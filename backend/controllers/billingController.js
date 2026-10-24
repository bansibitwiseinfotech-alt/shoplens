import {
  BILLING_PLANS,
  BILLING_INTERVALS,
  getPlan,
  isFeatureAllowed,
} from "../config/billingPlans.js";
import Subscription from "../models/Subscription.js";
import MonthlyUsage from "../models/MonthlyUsage.js";
import {
  createAppSubscription,
  cancelAppSubscription,
  verifyAndActivateSubscription,
} from "../services/shopifyBillingService.js";
import {
  validateSubscribeInput,
  validateCancelInput,
} from "../validators/billingValidator.js";

/**
 * Extracts shop domain from verified request context.
 */
const getShop = (req) => {
  return (
    req.shop ||
    req.store?.shop ||
    req.headers["x-shopify-shop-domain"] ||
    req.headers["x-shop-domain"] ||
    req.query?.shop ||
    null
  );
};

/**
 * GET /api/billing/plans
 * Returns all plan definitions, prices, billing intervals, features, and limits.
 */
export const getPlans = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        intervals: Object.values(BILLING_INTERVALS),
        plans: BILLING_PLANS,
      },
    });
  } catch (error) {
    console.error("[BillingController] getPlans error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve billing plans.",
      error: error.message,
    });
  }
};

/**
 * GET /api/billing/current
 * Returns current shop's active subscription, status, interval, and tier details.
 */
export const getCurrentSubscription = async (req, res) => {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const normalizedShop = shop.toLowerCase().trim();
    let subscription = await Subscription.findOne({ shop: normalizedShop });

    // If subscription is pending or if charge_id is provided in query params, verify with Shopify
    const chargeId = req.query.charge_id || req.query.chargeId;
    if ((subscription?.status === "PENDING" || chargeId) && req.accessToken) {
      try {
        const verifyResult = await verifyAndActivateSubscription({
          shop: normalizedShop,
          accessToken: req.accessToken,
          chargeId,
        });

        if (verifyResult.activated) {
          subscription = await Subscription.findOne({ shop: normalizedShop });
        }
      } catch (verifyErr) {
        console.warn("[BillingController] Subscription verification note:", verifyErr.message);
      }
    }

    if (!subscription) {
      subscription = await Subscription.create({
        shop: normalizedShop,
        plan: "free",
        interval: "monthly",
        status: "ACTIVE",
        price: 0,
        currency: "USD",
        activatedAt: new Date(),
      });
    }

    return res.status(200).json({
      success: true,
      data: subscription.toSafeObject(),
    });
  } catch (error) {
    console.error("[BillingController] getCurrentSubscription error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve current subscription.",
      error: error.message,
    });
  }
};

/**
 * POST /api/billing/subscribe
 * Subscribes the shop to Free, Pro, or Premium (monthly or yearly).
 * For paid tiers, generates and returns the Shopify confirmation URL.
 */
export const subscribe = async (req, res) => {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const validation = validateSubscribeInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription request.",
        errors: validation.errors,
      });
    }

    const { plan, interval, returnUrl } = validation;
    const normalizedShop = shop.toLowerCase().trim();

    // Prevent re-subscribing to the same active plan with the same interval
    const currentSub = await Subscription.findOne({ shop: normalizedShop });
    if (
      currentSub &&
      currentSub.isActive() &&
      currentSub.plan === plan &&
      (plan === "free" || currentSub.interval === interval)
    ) {
      return res.status(200).json({
        success: true,
        message: `Store is already on the ${currentSub.plan} plan.`,
        data: currentSub.toSafeObject(),
      });
    }

    // Call Shopify Billing Service
    const result = await createAppSubscription({
      shop: normalizedShop,
      accessToken: req.accessToken,
      planId: plan,
      interval,
      returnUrl,
    });

    return res.status(200).json({
      success: true,
      message:
        plan === "free"
          ? "Free plan activated successfully."
          : "Subscription initiated. Merchant confirmation required.",
      data: {
        plan,
        interval,
        status: result.status,
        confirmationUrl: result.confirmationUrl,
        subscription: result.subscription,
      },
    });
  } catch (error) {
    console.error("[BillingController] subscribe error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initiate subscription.",
    });
  }
};

/**
 * GET /api/billing/confirm
 * Merchant callback endpoint after approving charge in Shopify.
 */
export const confirmSubscription = async (req, res) => {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const chargeId = req.query.charge_id || req.query.chargeId;
    const normalizedShop = shop.toLowerCase().trim();

    const verifyResult = await verifyAndActivateSubscription({
      shop: normalizedShop,
      accessToken: req.accessToken,
      chargeId,
    });

    if (!verifyResult.activated) {
      return res.status(400).json({
        success: false,
        message: "Subscription was not confirmed or approved by merchant.",
        data: verifyResult.subscription,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Subscription confirmed and activated successfully.",
      data: verifyResult.subscription,
    });
  } catch (error) {
    console.error("[BillingController] confirmSubscription error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to confirm subscription.",
    });
  }
};

/**
 * POST /api/billing/cancel
 * Cancels active paid subscription and downgrades store to Free.
 */
export const cancel = async (req, res) => {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const validation = validateCancelInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid cancellation request.",
        errors: validation.errors,
      });
    }

    const normalizedShop = shop.toLowerCase().trim();
    const result = await cancelAppSubscription({
      shop: normalizedShop,
      accessToken: req.accessToken,
      prorate: validation.prorate,
      reason: validation.reason,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.subscription,
    });
  } catch (error) {
    console.error("[BillingController] cancel error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel subscription.",
    });
  }
};

/**
 * GET /api/billing/usage
 * Returns current billing period usage counters, limits, and plan information.
 */
export const getUsage = async (req, res) => {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const normalizedShop = shop.toLowerCase().trim();
    const subscription = await Subscription.getOrCreateForShop(normalizedShop);
    const planId = subscription.isActive() ? subscription.plan : "free";

    const usageData = await MonthlyUsage.calculateLiveUsage(normalizedShop, planId);

    return res.status(200).json({
      success: true,
      data: {
        shop: normalizedShop,
        plan: planId,
        interval: subscription.interval,
        currentPeriodStart: subscription.currentPeriodStart || usageData.periodStart,
        currentPeriodEnd: subscription.currentPeriodEnd || usageData.periodEnd,
        usage: usageData,
      },
    });
  } catch (error) {
    console.error("[BillingController] getUsage error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve usage data.",
      error: error.message,
    });
  }
};

/**
 * GET /api/billing/access
 * Returns current shop's enabled features and access restrictions.
 */
export const getAccess = async (req, res) => {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const normalizedShop = shop.toLowerCase().trim();
    const subscription = await Subscription.getOrCreateForShop(normalizedShop);
    const currentPlanId = subscription.isActive() ? subscription.plan : "free";
    const currentPlanConfig = getPlan(currentPlanId);

    // Build comprehensive feature access map
    const allKnownFeatures = Object.values(BILLING_PLANS).flatMap((p) => p.features);
    const uniqueFeatures = [...new Set(allKnownFeatures)];

    const featuresMap = {};
    for (const feat of uniqueFeatures) {
      featuresMap[feat] = {
        enabled: isFeatureAllowed(currentPlanId, feat),
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        shop: normalizedShop,
        plan: currentPlanId,
        planName: currentPlanConfig.name,
        tier: currentPlanConfig.tier,
        status: subscription.status,
        isActive: subscription.isActive(),
        features: featuresMap,
        enabledFeatures: currentPlanConfig.features,
        limits: currentPlanConfig.limits,
      },
    });
  } catch (error) {
    console.error("[BillingController] getAccess error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve access permissions.",
      error: error.message,
    });
  }
};

export default {
  getPlans,
  getCurrentSubscription,
  subscribe,
  confirmSubscription,
  cancel,
  getUsage,
  getAccess,
};
