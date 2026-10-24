import { shopifyGraphQL } from "./shopifyGraphqlService.js";
import { APP_URL } from "../config/shopify.js";
import {
  BILLING_INTERVALS,
  SHOPIFY_INTERVALS,
  getPricingDetails,
  getPlan,
} from "../config/billingPlans.js";
import Subscription from "../models/Subscription.js";
import MonthlyUsage from "../models/MonthlyUsage.js";
import { isTestBilling } from "../billing-config/billingMode.js";

const APP_SUBSCRIPTION_CREATE_MUTATION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      test: $test
    ) {
      userErrors {
        field
        message
      }
      confirmationUrl
      appSubscription {
        id
        status
        name
        createdAt
        currentPeriodEnd
      }
    }
  }
`;

const APP_SUBSCRIPTION_CANCEL_MUTATION = `
  mutation AppSubscriptionCancel($id: ID!, $prorate: Boolean) {
    appSubscriptionCancel(id: $id, prorate: $prorate) {
      userErrors {
        field
        message
      }
      appSubscription {
        id
        status
      }
    }
  }
`;

const GET_CURRENT_APP_INSTALLATION_QUERY = `
  query GetCurrentAppInstallation {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        createdAt
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

const GET_APP_SUBSCRIPTION_NODE_QUERY = `
  query GetAppSubscriptionNode($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        id
        name
        status
        createdAt
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Determine if test billing mode should be enabled.
 * Sourced from /backend/billing-config/billingMode.js
 */
export { isTestBilling };

/**                      
 * Infer plan identifier from Shopify subscription name or amount.
 */
export const inferPlanFromShopifyData = (name = "", amount = 0) => {
  const lowerName = String(name).toLowerCase();
  const numAmount = Number(amount);

  if (lowerName.includes("premium") || numAmount === 49 || numAmount === 490) {
    return "premium";
  }
  if (lowerName.includes("pro") || numAmount === 19 || numAmount === 190) {
    return "pro";
  }
  return "free";
};

/**
 * Infer billing interval from Shopify interval string or amount.
 */
export const inferIntervalFromShopifyData = (shopifyInterval = "", amount = 0) => {
  if (shopifyInterval === "ANNUAL" || amount === 190 || amount === 490) {
    return BILLING_INTERVALS.YEARLY;
  }
  return BILLING_INTERVALS.MONTHLY;
};

/**
 * Create or initiate a Shopify subscription.
 * - For Free plan: activates locally without creating a paid Shopify charge.
 * - For Pro/Premium: creates AppSubscription in Shopify and returns confirmationUrl.
 */
export const createAppSubscription = async ({
  shop,
  accessToken,
  planId,
  interval = BILLING_INTERVALS.MONTHLY,
  returnUrl = null,
}) => {
  const normalizedShop = shop.toLowerCase().trim();
  const plan = getPlan(planId);

  // 1. FREE PLAN FLOW: No Shopify billing mutation required
  if (plan.id === "free") {
    // If shop had a paid subscription, cancel it in Shopify
    const existingSub = await Subscription.findOne({ shop: normalizedShop });
    if (existingSub?.shopifySubscriptionId && existingSub.status === "ACTIVE") {
      try {
        await cancelShopifySubscriptionNode({
          shop: normalizedShop,
          accessToken,
          subscriptionId: existingSub.shopifySubscriptionId,
          prorate: true,
        });
      } catch (err) {
        console.warn(`[ShopifyBilling] Notice cancelling previous Shopify sub: ${err.message}`);
      }
    }

    const updatedSub = await Subscription.findOneAndUpdate(
      { shop: normalizedShop },
      {
        $set: {
          plan: "free",
          interval: BILLING_INTERVALS.MONTHLY,
          status: "ACTIVE",
          price: 0,
          currency: "USD",
          shopifySubscriptionId: null,
          shopifyConfirmationUrl: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
          activatedAt: new Date(),
          cancelledAt: null,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // Sync monthly usage
    await MonthlyUsage.getCurrentUsage(normalizedShop, "free");

    return {
      success: true,
      plan: "free",
      status: "ACTIVE",
      confirmationUrl: null,
      subscription: updatedSub.toSafeObject(),
    };
  }

  // 2. PAID PLAN FLOW (Pro / Premium)
  if (!accessToken) {
    throw new Error("Shopify access token is required to create a paid subscription.");
  }

  const pricing = getPricingDetails(plan.id, interval);
  const shopifyInterval = SHOPIFY_INTERVALS[interval] || "EVERY_30_DAYS";
  const intervalLabel = interval === BILLING_INTERVALS.YEARLY ? "Yearly" : "Monthly";
  const subscriptionName = `ShopLens ${plan.name} Plan (${intervalLabel})`;

  // Construct return URL for merchant after approval
  const baseAppUrl = APP_URL || `https://${normalizedShop}/admin/apps`;
  const defaultReturnUrl = `${baseAppUrl}/app/billing?shop=${normalizedShop}&billing_status=approved`;
  const finalReturnUrl = returnUrl || defaultReturnUrl;

  const testMode = isTestBilling();

  const variables = {
    name: subscriptionName,
    returnUrl: finalReturnUrl,
    test: testMode,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: pricing.amount,
              currencyCode: pricing.currencyCode,
            },
            interval: shopifyInterval,
          },
        },
      },
    ],
  };

  const responseData = await shopifyGraphQL({
    shop: normalizedShop,
    accessToken,
    query: APP_SUBSCRIPTION_CREATE_MUTATION,
    variables,
  });

  const mutationResult = responseData?.appSubscriptionCreate;
  const userErrors = mutationResult?.userErrors || [];

  if (userErrors.length > 0) {
    const errorDetails = userErrors.map((e) => `${e.field ? e.field + ": " : ""}${e.message}`).join("; ");
    throw new Error(`Shopify Billing Error: ${errorDetails}`);
  }

  const confirmationUrl = mutationResult?.confirmationUrl;
  const createdAppSubscription = mutationResult?.appSubscription;

  if (!confirmationUrl || !createdAppSubscription?.id) {
    throw new Error("Shopify did not return a confirmation URL for the subscription.");
  }

  // Record pending subscription in database
  const updatedSub = await Subscription.findOneAndUpdate(
    { shop: normalizedShop },
    {
      $set: {
        plan: plan.id,
        interval,
        status: "PENDING",
        price: pricing.amount,
        currency: pricing.currencyCode,
        shopifySubscriptionId: createdAppSubscription.id,
        shopifyConfirmationUrl: confirmationUrl,
        test: testMode,
        currentPeriodStart: null,
        currentPeriodEnd: createdAppSubscription.currentPeriodEnd
          ? new Date(createdAppSubscription.currentPeriodEnd)
          : null,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  return {
    success: true,
    plan: plan.id,
    interval,
    status: "PENDING",
    confirmationUrl,
    shopifySubscriptionId: createdAppSubscription.id,
    subscription: updatedSub.toSafeObject(),
  };
};

/**
 * Cancel a subscription directly in Shopify via GraphQL.
 */
export const cancelShopifySubscriptionNode = async ({
  shop,
  accessToken,
  subscriptionId,
  prorate = true,
}) => {
  if (!subscriptionId) return null;

  const responseData = await shopifyGraphQL({
    shop,
    accessToken,
    query: APP_SUBSCRIPTION_CANCEL_MUTATION,
    variables: {
      id: subscriptionId,
      prorate,
    },
  });

  const userErrors = responseData?.appSubscriptionCancel?.userErrors || [];
  if (userErrors.length > 0) {
    const errorMsg = userErrors.map((e) => e.message).join("; ");
    throw new Error(`Failed to cancel Shopify subscription: ${errorMsg}`);
  }

  return responseData?.appSubscriptionCancel?.appSubscription;
};

/**
 * Cancel current subscription for a shop and revert to Free tier.
 */
export const cancelAppSubscription = async ({
  shop,
  accessToken,
  prorate = true,
  reason = "Merchant cancelled subscription",
}) => {
  const normalizedShop = shop.toLowerCase().trim();
  const subscription = await Subscription.findOne({ shop: normalizedShop });

  if (!subscription) {
    throw new Error("No subscription record found for this store.");
  }

  if (subscription.plan === "free" && subscription.status === "ACTIVE") {
    return {
      success: true,
      message: "Store is already on the Free plan.",
      subscription: subscription.toSafeObject(),
    };
  }

  // If there is an active Shopify subscription ID, cancel in Shopify
  if (subscription.shopifySubscriptionId && accessToken) {
    try {
      await cancelShopifySubscriptionNode({
        shop: normalizedShop,
        accessToken,
        subscriptionId: subscription.shopifySubscriptionId,
        prorate,
      });
    } catch (err) {
      console.warn(`[ShopifyBilling] Warning during Shopify cancel mutation: ${err.message}`);
    }
  }

  // Downgrade to Free plan
  const updatedSub = await Subscription.findOneAndUpdate(
    { shop: normalizedShop },
    {
      $set: {
        plan: "free",
        interval: BILLING_INTERVALS.MONTHLY,
        status: "ACTIVE",
        price: 0,
        currency: "USD",
        shopifySubscriptionId: null,
        shopifyConfirmationUrl: null,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    },
    { returnDocument: "after" }
  );

  // Sync monthly usage for Free tier
  await MonthlyUsage.getCurrentUsage(normalizedShop, "free");

  return {
    success: true,
    message: "Subscription successfully cancelled. Store reverted to Free plan.",
    subscription: updatedSub.toSafeObject(),
  };
};

/**
 * Verifies approved Shopify subscription and activates the paid plan in MongoDB.
 */
export const verifyAndActivateSubscription = async ({
  shop,
  accessToken,
  chargeId = null,
}) => {
  const normalizedShop = shop.toLowerCase().trim();
  if (!accessToken) {
    throw new Error("Access token is required to verify Shopify subscriptions.");
  }

  // Fetch active subscriptions from Shopify
  const data = await shopifyGraphQL({
    shop: normalizedShop,
    accessToken,
    query: GET_CURRENT_APP_INSTALLATION_QUERY,
  });

  const activeSubscriptions = data?.currentAppInstallation?.activeSubscriptions || [];

  let matchedSub = null;
  if (chargeId) {
    // If chargeId is formatted as a numeric ID or gid, match it
    const formattedId = chargeId.startsWith("gid://")
      ? chargeId
      : `gid://shopify/AppSubscription/${chargeId}`;
    matchedSub = activeSubscriptions.find((s) => s.id === formattedId || s.id.endsWith(`/${chargeId}`));
  }

  // If not matched by chargeId, look for any active subscription or the newest one
  if (!matchedSub && activeSubscriptions.length > 0) {
    matchedSub = activeSubscriptions[0];
  }

  if (matchedSub && matchedSub.status === "ACTIVE") {
    const lineItem = matchedSub.lineItems?.[0]?.plan?.pricingDetails;
    const amount = Number(lineItem?.price?.amount || 0);
    const shopifyInterval = lineItem?.interval;

    const planId = inferPlanFromShopifyData(matchedSub.name, amount);
    const interval = inferIntervalFromShopifyData(shopifyInterval, amount);
    const pricing = getPricingDetails(planId, interval);

    const now = new Date();
    const periodEnd = matchedSub.currentPeriodEnd ? new Date(matchedSub.currentPeriodEnd) : null;

    const activatedSubscription = await Subscription.findOneAndUpdate(
      { shop: normalizedShop },
      {
        $set: {
          plan: planId,
          interval,
          status: "ACTIVE",
          price: amount || pricing.amount,
          currency: lineItem?.price?.currencyCode || pricing.currencyCode,
          shopifySubscriptionId: matchedSub.id,
          shopifyConfirmationUrl: null,
          test: Boolean(matchedSub.test),
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          activatedAt: now,
          cancelledAt: null,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // Initialize or update MonthlyUsage for current period
    await MonthlyUsage.getCurrentUsage(normalizedShop, planId, matchedSub.id);

    return {
      activated: true,
      subscription: activatedSubscription.toSafeObject(),
    };
  }

  // If no active subscription found, check if there was a pending subscription node
  const existingSub = await Subscription.findOne({ shop: normalizedShop });
  if (existingSub?.shopifySubscriptionId) {
    try {
      const nodeData = await shopifyGraphQL({
        shop: normalizedShop,
        accessToken,
        query: GET_APP_SUBSCRIPTION_NODE_QUERY,
        variables: { id: existingSub.shopifySubscriptionId },
      });

      const node = nodeData?.node;
      if (node?.status && node.status !== existingSub.status) {
        existingSub.status = node.status;
        if (node.status === "ACTIVE") {
          existingSub.activatedAt = new Date();
          existingSub.currentPeriodEnd = node.currentPeriodEnd ? new Date(node.currentPeriodEnd) : null;
        }
        await existingSub.save();
      }
    } catch (nodeErr) {
      console.warn(`[ShopifyBilling] Subscription node query note: ${nodeErr.message}`);
    }
  }

  return {
    activated: existingSub?.status === "ACTIVE",
    subscription: existingSub ? existingSub.toSafeObject() : null,
  };
};

/**
 * Query real-time Shopify billing installation status.
 */
export const getShopifyBillingInstallation = async ({ shop, accessToken }) => {
  const normalizedShop = shop.toLowerCase().trim();
  const data = await shopifyGraphQL({
    shop: normalizedShop,
    accessToken,
    query: GET_CURRENT_APP_INSTALLATION_QUERY,
  });

  return data?.currentAppInstallation?.activeSubscriptions || [];
};

export default {
  createAppSubscription,
  cancelAppSubscription,
  cancelShopifySubscriptionNode,
  verifyAndActivateSubscription,
  getShopifyBillingInstallation,
  inferPlanFromShopifyData,
  inferIntervalFromShopifyData,
};
