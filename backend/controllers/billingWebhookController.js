import crypto from "crypto";
import { Buffer } from "buffer";
import Subscription from "../models/Subscription.js";
import MonthlyUsage from "../models/MonthlyUsage.js";
import {
  inferPlanFromShopifyData,
  inferIntervalFromShopifyData,
} from "../services/shopifyBillingService.js";
import { getPricingDetails } from "../config/billingPlans.js";

/**
 * Handle incoming Shopify `app_subscriptions/update` webhook.
 * Verifies HMAC signature, ensures idempotent updates, and synchronizes subscription state.
 */
export const handleAppSubscriptionUpdate = async (req, res) => {
  try {
    const hmacHeader = req.headers["x-shopify-hmac-sha256"];
    const webhookId = req.headers["x-shopify-webhook-id"];
    const secret = process.env.SHOPIFY_API_SECRET;

    if (!hmacHeader) {
      return res.status(401).json({
        success: false,
        message: "Missing Shopify webhook signature.",
      });
    }

    if (!secret) {
      console.error("[BillingWebhook] SHOPIFY_API_SECRET is missing.");
      return res.status(500).json({
        success: false,
        message: "Webhook configuration is incomplete.",
      });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    const digest = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");

    const received = Buffer.from(hmacHeader, "utf8");
    const expected = Buffer.from(digest, "utf8");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid Shopify webhook signature.",
      });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({
        success: false,
        message: "Webhook body contains invalid JSON.",
      });
    }

    const shop = String(req.headers["x-shopify-shop-domain"] || "")
      .toLowerCase()
      .trim();

    if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing Shopify shop domain header.",
      });
    }

    const appSubscription = payload?.app_subscription;
    if (!appSubscription) {
      // Acknowledge non-subscription payloads gracefully
      return res.status(200).json({ success: true, ignored: true });
    }

    const subscriptionId = appSubscription.admin_graphql_api_id || appSubscription.id;
    const status = String(appSubscription.status || "").toUpperCase();
    const name = appSubscription.name || "";

    // Idempotency check: if we've already processed this exact webhook ID, skip duplicate work
    let subscription = await Subscription.findOne({ shop });
    if (webhookId && subscription?.lastWebhookEventId === webhookId) {
      return res.status(200).json({
        success: true,
        message: "Webhook already processed (idempotent duplicate).",
      });
    }

    if (status === "ACTIVE") {
      const planId = inferPlanFromShopifyData(name);
      const interval = inferIntervalFromShopifyData(name);
      const pricing = getPricingDetails(planId, interval);

      subscription = await Subscription.findOneAndUpdate(
        { shop },
        {
          $set: {
            plan: planId,
            interval,
            status: "ACTIVE",
            price: pricing.amount,
            currency: appSubscription.currency || pricing.currencyCode,
            shopifySubscriptionId: subscriptionId,
            shopifyConfirmationUrl: null,
            activatedAt: new Date(),
            cancelledAt: null,
            lastWebhookEventId: webhookId || null,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      // Initialize usage document for active plan
      await MonthlyUsage.getCurrentUsage(shop, planId, subscriptionId);

      console.log(`[BillingWebhook] Activated ${planId} plan for ${shop} via webhook.`);
    } else if (["CANCELLED", "DECLINED", "EXPIRED", "FROZEN"].includes(status)) {
      // Revert store to Free plan
      subscription = await Subscription.findOneAndUpdate(
        { shop },
        {
          $set: {
            plan: "free",
            interval: "monthly",
            status: "ACTIVE",
            price: 0,
            currency: "USD",
            shopifySubscriptionId: null,
            shopifyConfirmationUrl: null,
            cancelledAt: new Date(),
            cancelReason: `Shopify subscription status: ${status}`,
            lastWebhookEventId: webhookId || null,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      await MonthlyUsage.getCurrentUsage(shop, "free");
      console.log(`[BillingWebhook] Downgraded ${shop} to free plan due to status: ${status}.`);
    }

    return res.status(200).json({
      success: true,
      message: `Processed subscription status: ${status}`,
      shop,
      status,
    });
  } catch (error) {
    console.error("[BillingWebhook] Error handling app_subscriptions/update:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process billing webhook.",
    });
  }
};

export default {
  handleAppSubscriptionUpdate,
};
