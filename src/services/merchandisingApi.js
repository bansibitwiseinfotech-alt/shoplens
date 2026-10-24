/**
 * ShopLens Collection Merchandising API Service
 * Handles communication between the frontend React application
 * and the backend collection merchandising endpoints.
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

const makeRequest = async (endpoint, { shop, ...params } = {}) => {
  const url = `${getBackendUrl()}${endpoint}${buildQueryString({ shop, ...params })}`;

  const headers = {
    "Content-Type": "application/json",
    ...(await getShopifyAuthorizationHeaders()),
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
    const error = new Error(data.message || "Failed to load merchandising data.");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

/**
 * Fetch collection-level merchandising overview and store summary.
 * GET /api/merchandising/overview
 */
export const getMerchandisingOverview = async ({ shop, startDate, endDate } = {}) => {
  const result = await makeRequest("/api/merchandising/overview", {
    shop,
    startDate,
    endDate,
  });

  const summaryFields = [
    "totalCollections",
    "collectionsWithSales",
    "underperformingCollections",
    "productsToReposition",
  ];
  if (
    !result.summary ||
    summaryFields.some((field) => !Number.isFinite(result.summary[field])) ||
    !Array.isArray(result.collections)
  ) {
    throw new Error("The merchandising overview response is incomplete.");
  }

  return {
    currency: result.currency || null,
    summary: result.summary,
    collections: result.collections,
  };
};

/**
 * Fetch all detected product positioning problems across all collections.
 * GET /api/merchandising/positioning/problems
 */
export const getPositioningProblems = async ({ shop, startDate, endDate } = {}) => {
  const result = await makeRequest("/api/merchandising/positioning/problems", {
    shop,
    startDate,
    endDate,
  });

  if (!Array.isArray(result.problems)) {
    throw new Error("The positioning problems response is incomplete.");
  }

  return result.problems;
};

/**
 * Fetch detailed merchandising performance and positioning for a single collection.
 * GET /api/merchandising/collections/:collectionId
 */
export const getCollectionDetail = async ({ shop, collectionId, startDate, endDate } = {}) => {
  if (!collectionId) {
    throw new Error("Collection ID is required to fetch collection details.");
  }

  const encodedId = encodeURIComponent(collectionId);
  const result = await makeRequest(`/api/merchandising/collections/${encodedId}`, {
    shop,
    startDate,
    endDate,
  });

  if (
    !result.collection ||
    !result.performance ||
    !Array.isArray(result.products) ||
    !Array.isArray(result.recommendations) ||
    !Array.isArray(result.topProducts) ||
    !Array.isArray(result.weakProducts)
  ) {
    throw new Error("The collection details response is incomplete.");
  }

  return {
    currency: result.currency || null,
    collection: result.collection,
    performance: result.performance,
    products: result.products,
    recommendations: result.recommendations,
    topProducts: result.topProducts,
    weakProducts: result.weakProducts,
  };
};

export const getCollectionDetails = getCollectionDetail;

export default {
  getBackendUrl,
  getMerchandisingOverview,
  getPositioningProblems,
  getCollectionDetail,
  getCollectionDetails,
};
