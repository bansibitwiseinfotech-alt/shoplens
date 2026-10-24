import { getShopifyAuthorizationHeaders } from "./shopifySessionToken.js";

const getBackendUrl = () => {
  if (typeof window !== "undefined" && window.__ENV__?.VITE_BACKEND_URL) {
    return window.__ENV__.VITE_BACKEND_URL;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  return "http://localhost:5000";
};

export const getMissedSalesOpportunityOverview = async ({
  shop,
  days = "30",
} = {}) => {
  const params = new URLSearchParams();
  if (shop) params.append("shop", shop);
  if (days) params.append("days", String(days));

  const url = `${getBackendUrl()}/api/missed-sales-opportunities/overview?${params.toString()}`;

  let authHeaders = {};
  try {
    authHeaders = await getShopifyAuthorizationHeaders();
  } catch (_) {
    // Development fallback if outside App Bridge
  }

  const headers = {
    "Content-Type": "application/json",
    ...authHeaders,
  };
  if (shop) {
    headers["x-shopify-shop-domain"] = shop;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message || "Failed to load missed sales opportunities overview"
    );
  }

  return data.data;
};

export const getMissedSalesOpportunityDetails = async ({
  shop,
  days = "30",
  opportunityKey,
} = {}) => {
  const params = new URLSearchParams();
  if (shop) params.append("shop", shop);
  if (days) params.append("days", String(days));
  if (opportunityKey) params.append("opportunityKey", opportunityKey);

  const url = `${getBackendUrl()}/api/missed-sales-opportunities/details?${params.toString()}`;

  let authHeaders = {};
  try {
    authHeaders = await getShopifyAuthorizationHeaders();
  } catch (_) {
    // Development fallback if outside App Bridge
  }

  const headers = {
    "Content-Type": "application/json",
    ...authHeaders,
  };
  if (shop) {
    headers["x-shopify-shop-domain"] = shop;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message || "Failed to load missed sales opportunity details"
    );
  }

  return data.data;
};

export default {
  getMissedSalesOpportunityOverview,
  getMissedSalesOpportunityDetails,
};
