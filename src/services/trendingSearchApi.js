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

export const getTrendingOverview = async ({ shop, days = 30 } = {}) => {
  const params = new URLSearchParams();
  if (shop) params.append("shop", shop);
  if (days) params.append("days", String(days));

  const url = `${getBackendUrl()}/api/trending-searches/overview?${params.toString()}`;

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
    throw new Error(data.message || "Failed to load trending search overview");
  }

  return data.data;
};

export const getTrendingSearchList = async ({
  shop,
  days = 30,
  trendType,
  limit = 50,
} = {}) => {
  const params = new URLSearchParams();
  if (shop) params.append("shop", shop);
  if (days) params.append("days", String(days));
  if (trendType) params.append("trendType", trendType);
  if (limit) params.append("limit", String(limit));

  const url = `${getBackendUrl()}/api/trending-searches/list?${params.toString()}`;

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
    throw new Error(data.message || "Failed to load trending search list");
  }

  return data.data;
};

export default {
  getTrendingOverview,
  getTrendingSearchList,
};
