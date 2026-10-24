/**
 * ShopLens Search Intelligence API Service
 * Handles communication between the frontend React application
 * and the backend search intelligence endpoints.
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

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.append(key, val);
    }
  });

  const str = query.toString();
  return str ? `?${str}` : "";
};

const makeRequest = async (endpoint, { shop, signal, ...params } = {}) => {
  const url = `${getBackendUrl()}${endpoint}${buildQueryString({ shop, ...params })}`;

  let authorizationHeaders;
  try {
    authorizationHeaders = await getShopifyAuthorizationHeaders();
  } catch (error) {
    throw new Error(
      `Unable to authenticate Search Intelligence request to ${endpoint}: ${error.message}`
    );
  }

  const headers = {
    "Content-Type": "application/json",
    ...authorizationHeaders,
  };
  if (shop) {
    headers["x-shopify-shop-domain"] = shop;
  }

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      signal,
    });
  } catch (error) {
    throw new Error(
      `Unable to reach Search Intelligence endpoint ${endpoint}: ${error.message}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error(
      `Search Intelligence endpoint ${endpoint} returned an invalid response (HTTP ${response.status}).`
    );
    error.status = response.status;
    error.endpoint = endpoint;
    throw error;
  }

  if (!response.ok || data?.success === false) {
    const details = data?.message || response.statusText || "Request failed.";
    const error = new Error(
      `Search Intelligence endpoint ${endpoint} failed (HTTP ${response.status}): ${details}`
    );
    error.status = response.status;
    error.endpoint = endpoint;
    error.data = data;
    throw error;
  }

  return data;
};

/**
 * Fetch high-level search summary metrics.
 * GET /api/search-intelligence/summary
 */
export const getSearchSummary = async ({ shop, from, to, timezone, signal }) => {
  return makeRequest("/api/search-intelligence/summary", { shop, from, to, timezone, signal });
};

/**
 * Fetch popular search queries with conversion metrics.
 * GET /api/search-intelligence/queries
 */
export const getPopularQueries = async ({ shop, from, to, limit = 20, timezone, signal }) => {
  return makeRequest("/api/search-intelligence/queries", { shop, from, to, limit, timezone, signal });
};

/**
 * Fetch daily search trends.
 * GET /api/search-intelligence/trends
 */
export const getSearchTrends = async ({ shop, from, to, timezone, signal }) => {
  return makeRequest("/api/search-intelligence/trends", { shop, from, to, timezone, signal });
};

/**
 * Fetch product-level search and engagement analytics.
 * GET /api/search-intelligence/products
 */
export const getProductAnalytics = async ({ shop, from, to, limit = 20, timezone, signal }) => {
  return makeRequest("/api/search-intelligence/products", { shop, from, to, limit, timezone, signal });      
};

/**
 * Fetch products connected to actual customer searches.
 * GET /api/search-intelligence/searched-products
 */
export const getSearchedProducts = async ({ shop, from, to, query, search, sortBy, limit = 100 }) => {
  return makeRequest("/api/search-intelligence/searched-products", { shop, from, to, query, search, sortBy, limit });
};

/**
 * Fetch live orders directly via Shopify GraphQL (not MongoDB).
 * GET /api/sync/orders
 */
export const getLiveOrders = async ({ shop, limit = 50, search, since } = {}) => {
  return makeRequest("/api/sync/orders", { shop, limit, search, since });
};

export const getLiveProducts = async ({ shop, limit = 50, search, cursor } = {}) => {
  return makeRequest("/api/sync/products", { shop, limit, search, cursor });
};

export {
  fetchDiscoverabilitySummary as getProductDiscoverabilitySummary,
  fetchProductDiscoverability as getProductDiscoverability,
} from "./productDiscoverabilityApi.js";

export const getLiveCustomers = async ({ shop, limit = 50, search, cursor } = {}) => {
  return makeRequest("/api/sync/customers", { shop, limit, search, cursor });
};

export default {
  getBackendUrl,
  getSearchSummary,
  getPopularQueries,
  getSearchTrends,
  getProductAnalytics,
  getSearchedProducts,
  getLiveOrders,
  getLiveProducts,
  getLiveCustomers,
};
