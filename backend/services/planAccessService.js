import Subscription from "../models/Subscription.js";
import {
  BILLING_PLANS,
  getPlan,
  isFeatureAllowed,
  getFeatureAccessMap,
  getPlanLimit,
  isLimitUnlimited,
  getMinimumPlanForFeature,
} from "../config/billingPlans.js";

/**
 * Service to manage real merchant subscription verification,
 * TRUE/FALSE feature gating, and limit enforcement.
 */
class PlanAccessService {
  /**
   * Retrieves or initializes the verified subscription for a shop domain.
   * Gracefully falls back to 'free' if the subscription is inactive, cancelled, expired, or declined.
   *
   * @param {string} shop - Target myshopify domain
   * @returns {Promise<{ subscription: object, effectivePlan: string, status: string, isActive: boolean }>}
   */
  async getMerchantSubscription(shop) {
    if (!shop || typeof shop !== "string") {
      throw new Error("A valid Shopify shop domain is required.");
    }

    const normalizedShop = shop.toLowerCase().trim();
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

    const isActive = subscription.isActive();
    const effectivePlan = isActive ? subscription.plan : "free";

    return {
      subscription,
      effectivePlan,
      status: subscription.status,
      isActive,
    };
  }

  /**
   * Checks whether a feature is permitted under the shop's active plan.
   * Returns a clean TRUE/FALSE evaluation result.
   *
   * @param {string} shop - Target myshopify domain
   * @param {string} featureKey - Key from FEATURES enum
   * @returns {Promise<{ allowed: boolean, shop: string, feature: string, currentPlan: string, requiredPlan: string, message: string }>}
   */
  async checkFeatureAccess(shop, featureKey) {
    const { effectivePlan } = await this.getMerchantSubscription(shop);
    const allowed = isFeatureAllowed(effectivePlan, featureKey) === true;
    const requiredPlan = getMinimumPlanForFeature(featureKey);
    const planName = BILLING_PLANS[effectivePlan]?.name || effectivePlan;
    const requiredPlanName = BILLING_PLANS[requiredPlan]?.name || requiredPlan;

    return {
      allowed,
      shop: shop.toLowerCase().trim(),
      feature: featureKey,
      currentPlan: effectivePlan,
      requiredPlan,
      message: allowed
        ? `Access granted to '${featureKey}' on the ${planName} plan.`
        : `The '${featureKey}' feature is locked on the ${planName} plan. Upgrade to the ${requiredPlanName} plan to unlock it.`,
    };
  }

  /**
   * Returns the complete dictionary of feature access flags (TRUE/FALSE)
   * for the merchant's real active plan.
   *
   * @param {string} shop - Target myshopify domain
   * @returns {Promise<{ shop: string, plan: string, status: string, features: Record<string, boolean> }>}
   */
  async getFeaturePermissions(shop) {
    const { effectivePlan, status } = await this.getMerchantSubscription(shop);
    const features = getFeatureAccessMap(effectivePlan);

    return {
      shop: shop.toLowerCase().trim(),
      plan: effectivePlan,
      status,
      features,
    };
  }

  /**
   * Retrieves plan limits and unlimited flags for the shop.
   *
   * @param {string} shop - Target myshopify domain
   * @returns {Promise<{ shop: string, plan: string, limits: object }>}
   */
  async getMerchantLimits(shop) {
    const { effectivePlan } = await this.getMerchantSubscription(shop);
    const planConfig = getPlan(effectivePlan);

    return {
      shop: shop.toLowerCase().trim(),
      plan: effectivePlan,
      limits: planConfig.limits,
    };
  }

  /**
   * Clamps an array of items (products, trends, queries) to the merchant's plan limit
   * and attaches explicit metadata so data is never silently truncated.
   *
   * @param {string} shop - Target myshopify domain
   * @param {string} limitKey - Key from LIMIT_KEYS enum
   * @param {Array} items - Array of items to clamp
   * @param {object} options - Optional overrides (e.g. sliceFrom: 'start' or 'end')
   * @returns {Promise<{ items: Array, total: number, totalAvailable: number, planLimit: number|null, isLimitedByPlan: boolean, upgradeRequired: boolean, plan: string }>}
   */
  async clampToPlanLimit(shop, limitKey, items = [], options = {}) {
    const { effectivePlan } = await this.getMerchantSubscription(shop);
    const planLimit = getPlanLimit(effectivePlan, limitKey);
    const isUnlimited = isLimitUnlimited(effectivePlan, limitKey);
    const totalAvailable = Array.isArray(items) ? items.length : 0;

    if (isUnlimited || planLimit === null) {
      return {
        items,
        total: totalAvailable,
        totalAvailable,
        planLimit: null,
        isLimitedByPlan: false,
        upgradeRequired: false,
        plan: effectivePlan,
      };
    }

    const { sliceFrom = "start" } = options;
    const clampedItems = sliceFrom === "end"
      ? items.slice(-planLimit)
      : items.slice(0, planLimit);

    const isLimitedByPlan = totalAvailable > planLimit;

    return {
      items: clampedItems,
      total: clampedItems.length,
      totalAvailable,
      planLimit,
      isLimitedByPlan,
      upgradeRequired: isLimitedByPlan,
      plan: effectivePlan,
    };
  }
}

export const planAccessService = new PlanAccessService();
export default planAccessService;
