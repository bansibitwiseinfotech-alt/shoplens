import { shopifyBackendRequest } from "./shopifyBackendApi.js";

const BASE_PATH = "/api/billing";

/**
 * Fetch all available billing plans and configuration.
 */
export async function getBillingPlans(shop) {
  const response = await shopifyBackendRequest(`${BASE_PATH}/plans`, { shop });
  return response.data || { intervals: ["monthly", "yearly"], plans: {} };
}

/**
 * Fetch the current store's subscription and billing status.
 * Accepts optional chargeId to verify approved subscription upon redirect.
 */
export async function getCurrentSubscription(shop, { chargeId } = {}) {
  const query = chargeId ? `?charge_id=${encodeURIComponent(chargeId)}` : "";
  const response = await shopifyBackendRequest(`${BASE_PATH}/current${query}`, { shop });
  return response.data || null;
}

/**
 * Subscribe to a plan (Free, Pro, or Premium; Monthly or Yearly).
 * Returns confirmationUrl for paid plans.
 */
export async function subscribeToPlan(shop, { plan, interval = "monthly", returnUrl = null }) {
  const response = await shopifyBackendRequest(`${BASE_PATH}/subscribe`, {
    shop,
    method: "POST",
    body: {
      plan,
      interval,
      ...(returnUrl ? { returnUrl } : {}),
    },
  });

  return response.data;
}

/**
 * Confirm/verify an approved subscription after returning from Shopify charge approval.
 */
export async function confirmSubscription(shop, { chargeId }) {
  const query = chargeId ? `?charge_id=${encodeURIComponent(chargeId)}` : "";
  const response = await shopifyBackendRequest(`${BASE_PATH}/confirm${query}`, {
    shop,
  });

  return response.data;
}

/**
 * Cancel the current paid subscription and revert store to the Free plan.
 */
export async function cancelSubscription(shop, { prorate = true, reason } = {}) {
  const response = await shopifyBackendRequest(`${BASE_PATH}/cancel`, {
    shop,
    method: "POST",
    body: {
      prorate,
      ...(reason ? { reason } : {}),
    },
  });

  return response.data;
}

/**
 * Fetch current billing period usage and metric limits.
 */
export async function getBillingUsage(shop) {
  const response = await shopifyBackendRequest(`${BASE_PATH}/usage`, { shop });
  return response.data || null;
}

/**
 * Fetch store feature access permissions map.
 */
export async function getBillingAccess(shop) {
  const response = await shopifyBackendRequest(`${BASE_PATH}/access`, { shop });
  return response.data || null;
}

export default {
  getBillingPlans,
  getCurrentSubscription,
  subscribeToPlan,
  confirmSubscription,
  cancelSubscription,
  getBillingUsage,
  getBillingAccess,
};
