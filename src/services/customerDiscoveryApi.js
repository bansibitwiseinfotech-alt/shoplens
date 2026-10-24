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

export const getCustomerDiscoveryOverview = async ({ shop, days = "30" } = {}) => {
  const params = new URLSearchParams();
  if (shop) params.append("shop", shop);
  if (days) params.append("days", days);

  const url = `${getBackendUrl()}/api/customer-discovery/overview?${params.toString()}`;

  let authHeaders = {};
  try {
    authHeaders = await getShopifyAuthorizationHeaders();
  } catch (_) {
    // If running in development without App Bridge session token, fallback gracefully
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
    throw new Error(data.message || "Failed to load customer discovery data");
  }

  return data.data;
};

export default {
  getCustomerDiscoveryOverview,
};
