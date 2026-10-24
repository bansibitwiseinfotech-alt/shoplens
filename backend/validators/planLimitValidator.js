import {
  getPlanLimit,
  isLimitUnlimited,
  BILLING_PLANS,
} from "../config/billingPlans.js";

/**
 * Validates whether a requested action or count is within the merchant's plan limit.
 *
 * @param {string} planId - 'free' | 'pro' | 'premium'
 * @param {string} limitKey - Key from LIMIT_KEYS
 * @param {number} currentCount - The count to validate
 * @returns {{ allowed: boolean, isUnlimited: boolean, planLimit: number|null, upgradeRequired: boolean, message: string }}
 */
export const validateFeatureLimit = (planId, limitKey, currentCount = 0) => {
  const plan = BILLING_PLANS[planId] || BILLING_PLANS.free;
  const isUnlimited = isLimitUnlimited(plan.id, limitKey);
  const planLimit = getPlanLimit(plan.id, limitKey);

  if (isUnlimited || planLimit === null) {
    return {
      allowed: true,
      isUnlimited: true,
      planLimit: null,
      upgradeRequired: false,
      message: "No limit restriction applied.",
    };
  }

  const allowed = currentCount < planLimit;
  return {
    allowed,
    isUnlimited: false,
    planLimit,
    upgradeRequired: !allowed,
    message: allowed
      ? `Usage is within ${plan.name} plan limit of ${planLimit}.`
      : `${plan.name} plan limit of ${planLimit} reached. Upgrade required for additional capacity.`,
  };
};

/**
 * Clamps an array of items to the plan limit and produces standardized metadata.
 *
 * @param {Array} items - Array of data items (products, queries, trends)
 * @param {string} planId - 'free' | 'pro' | 'premium'
 * @param {string} limitKey - Key from LIMIT_KEYS
 * @param {object} options - Options (e.g. sliceFrom: 'start' | 'end')
 * @returns {{ items: Array, meta: object }}
 */
export const enforcePlanLimitOnItems = (items = [], planId = "free", limitKey, options = {}) => {
  const totalAvailable = Array.isArray(items) ? items.length : 0;
  const planLimit = getPlanLimit(planId, limitKey);
  const isUnlimited = isLimitUnlimited(planId, limitKey);

  if (isUnlimited || planLimit === null) {
    return {
      items,
      meta: {
        total: totalAvailable,
        totalAvailable,
        planLimit: null,
        isLimitedByPlan: false,
        upgradeRequired: false,
        plan: planId,
      },
    };
  }

  const { sliceFrom = "start" } = options;
  const clampedItems = sliceFrom === "end"
    ? items.slice(-planLimit)
    : items.slice(0, planLimit);

  const isLimitedByPlan = totalAvailable > planLimit;

  return {
    items: clampedItems,
    meta: {
      total: clampedItems.length,
      totalAvailable,
      planLimit,
      isLimitedByPlan,
      upgradeRequired: isLimitedByPlan,
      plan: planId,
    },
  };
};

export default {
  validateFeatureLimit,
  enforcePlanLimitOnItems,
};
