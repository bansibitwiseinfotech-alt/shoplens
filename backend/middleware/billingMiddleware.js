import Subscription from "../models/Subscription.js";
import {
  BILLING_PLANS,
  isFeatureAllowed,
  getPlanLimit,
  isLimitUnlimited,
  getMinimumPlanForFeature,
} from "../config/billingPlans.js";

/**
 * Extracts shop domain from verified request context.
 */
const getShopDomain = (req) => {
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
 * Middleware that loads or provisions the store's subscription
 * and attaches it to req.subscription, req.currentPlan, and req.planConfig.
 */
export const attachSubscription = async (req, res, next) => {
  try {
    const shop = getShopDomain(req);

    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required to verify billing status.",
      });
    }

    const normalizedShop = shop.toLowerCase().trim();

    // Fetch or initialize default Free subscription
    let subscription = await Subscription.findOne({ shop: normalizedShop });
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

    // Determine effective plan (if subscription is expired/cancelled/not active, fallback to Free)
    let effectivePlan = subscription.plan;
    if (!subscription.isActive()) {
      effectivePlan = "free";
    }

    req.shop = normalizedShop;
    req.subscription = subscription;
    req.currentPlan = effectivePlan;
    req.planConfig = BILLING_PLANS[effectivePlan] || BILLING_PLANS.free;

    return next();
  } catch (error) {
    console.error("[BillingMiddleware] Failed to attach subscription:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to verify store billing status. Please try again later.",
    });
  }
};

/**
 * Middleware to enforce feature-level plan access.
 * Returns 403 Forbidden with upgrade guidance if not permitted.
 */
export const requireFeature = (featureKey) => {
  return async (req, res, next) => {
    // Ensure subscription is attached
    if (!req.subscription || !req.currentPlan) {
      await new Promise((resolve) => attachSubscription(req, res, resolve));
      if (res.headersSent) return;
    }

    const currentPlan = req.currentPlan || "free";
    const allowed = isFeatureAllowed(currentPlan, featureKey);

    if (!allowed) {
      const requiredPlan = getMinimumPlanForFeature(featureKey);
      return res.status(403).json({
        success: false,
        error: "FEATURE_ACCESS_DENIED",
        code: "UPGRADE_REQUIRED",
        allowed: false,
        message: `The '${featureKey}' feature is not included in the ${BILLING_PLANS[currentPlan]?.name || currentPlan} plan. Upgrade to the ${BILLING_PLANS[requiredPlan]?.name || requiredPlan} plan to unlock this feature.`,
        feature: featureKey,
        currentPlan,
        requiredPlan,
        upgradeUrl: "/app/billing",
      });
    }

    return next();
  };
};

/**
 * Middleware or utility to clamp and enforce metric limits.
 * Attaches effective limit information to req.billingLimit.
 */
export const enforceMetricLimit = (limitKey) => {
  return async (req, res, next) => {
    if (!req.subscription || !req.currentPlan) {
      await new Promise((resolve) => attachSubscription(req, res, resolve));
      if (res.headersSent) return;
    }

    const currentPlan = req.currentPlan || "free";
    const planLimit = getPlanLimit(currentPlan, limitKey);
    const isUnlimited = isLimitUnlimited(currentPlan, limitKey);

    req.billingLimit = {
      key: limitKey,
      planLimit,
      isUnlimited,
      currentPlan,
    };

    // If request contains a limit query parameter, clamp it to plan limit
    if (!isUnlimited && planLimit !== null) {
      const requestedLimit = Number(req.query.limit);
      if (!requestedLimit || requestedLimit > planLimit) {
        req.query.limit = planLimit;
      }
    }

    return next();
  };
};

/**
 * Helper function for controllers: clamps an array to plan limit
 * while attaching explicit metadata so data is never silently truncated.
 */
export const applyPlanLimit = (items = [], planId = "free", limitKey) => {
  const planLimit = getPlanLimit(planId, limitKey);
  const isUnlimited = isLimitUnlimited(planId, limitKey);
  const totalAvailable = items.length;

  if (isUnlimited || planLimit === null) {
    return {
      items,
      total: items.length,
      totalAvailable,
      planLimit: null,
      isLimitedByPlan: false,
      upgradeRequired: false,
    };
  }

  const limitedItems = items.slice(0, planLimit);
  const isLimitedByPlan = totalAvailable > planLimit;

  return {
    items: limitedItems,
    total: limitedItems.length,
    totalAvailable,
    planLimit,
    isLimitedByPlan,
    upgradeRequired: isLimitedByPlan,
  };
};

export default {
  attachSubscription,
  requireFeature,
  enforceMetricLimit,
  applyPlanLimit,
};
