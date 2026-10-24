/**
 * ShopLens Product Discoverability API Service
 */
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

export const fetchDiscoverabilitySummary = async ({ shop, from, to }) => {
  const params = new URLSearchParams();
  if (shop) {
    params.append("shop", shop);
  }
  if (from) {
    params.append("from", from);
  }
  if (to) {
    params.append("to", to);
  }
  const queryString = params.toString() ? `?${params.toString()}` : "";
  const url = `${getBackendUrl()}/api/product-discoverability/summary${queryString}`;
  const headers = {
    "Content-Type": "application/json",
    ...(await getShopifyAuthorizationHeaders()),
  };
  if (shop) {
    headers["x-shopify-shop-domain"] = shop;
  }

  const response = await fetch(url, { method: "GET", headers });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load discoverability summary");
  }

  return result.data;
};

export const fetchProductDiscoverability = async ({
  shop,
  sort = "lowest",
  limit = 250,
  status,
  from,
  to,
}) => {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (shop) {
    params.append("shop", shop);
  }
  if (status && status !== "all") {
    params.append("status", status);
  }
  if (from) {
    params.append("from", from);
  }
  if (to) {
    params.append("to", to);
  }
  const url = `${getBackendUrl()}/api/product-discoverability?${params.toString()}`;
  const headers = {
    "Content-Type": "application/json",
    ...(await getShopifyAuthorizationHeaders()),
  };
  if (shop) {
    headers["x-shopify-shop-domain"] = shop;
  }

  const response = await fetch(url, { method: "GET", headers });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to load discoverability products");
  }

  return result.data || [];
};

export default {
  fetchDiscoverabilitySummary,
  fetchProductDiscoverability,
};
