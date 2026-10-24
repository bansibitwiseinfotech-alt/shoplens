import { BILLING_PLANS, BILLING_INTERVALS } from "../config/billingPlans.js";

/**
 * Validates plan subscription payload.
 */
export const validateSubscribeInput = (data = {}) => {
  const errors = [];

  const rawPlan = typeof data.plan === "string" ? data.plan.toLowerCase().trim() : "";
  if (!rawPlan) {
    errors.push("Plan is required ('free', 'pro', or 'premium').");
  } else if (!BILLING_PLANS[rawPlan]) {
    errors.push(`Invalid plan '${rawPlan}'. Must be one of: ${Object.keys(BILLING_PLANS).join(", ")}.`);
  }

  const rawInterval = typeof data.interval === "string" ? data.interval.toLowerCase().trim() : "";
  if (rawPlan !== "free") {
    if (!rawInterval) {
      errors.push("Billing interval is required ('monthly' or 'yearly').");
    } else if (rawInterval !== BILLING_INTERVALS.MONTHLY && rawInterval !== BILLING_INTERVALS.YEARLY) {
      errors.push(`Invalid interval '${rawInterval}'. Must be 'monthly' or 'yearly'.`);
    }
  }

  if (data.returnUrl !== undefined && data.returnUrl !== null) {
    if (typeof data.returnUrl !== "string" || !data.returnUrl.trim()) {
      errors.push("returnUrl must be a valid URL string.");
    } else {
      try {
        new URL(data.returnUrl);
      } catch {
        errors.push("returnUrl must be a valid absolute URL.");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    plan: rawPlan,
    interval: rawInterval || BILLING_INTERVALS.MONTHLY,
    returnUrl: data.returnUrl ? data.returnUrl.trim() : null,
  };
};

/**
 * Validates cancellation input.
 */
export const validateCancelInput = (data = {}) => {
  const errors = [];

  if (data.prorate !== undefined && typeof data.prorate !== "boolean") {
    errors.push("prorate must be a boolean value.");
  }

  return {
    valid: errors.length === 0,
    errors,
    prorate: data.prorate !== undefined ? Boolean(data.prorate) : true,
    reason: typeof data.reason === "string" ? data.reason.trim() : "Merchant requested cancellation",
  };
};
