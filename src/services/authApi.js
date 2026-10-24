/**
 * ShopLens Authentication API Service
 * Handles communication with the backend authentication endpoints.
 */
import { getShopifyAuthorizationHeaders } from "./shopifySessionToken.js";

const getBackendUrl = () => {
  // Support Vite environment variable or fallback to default backend port 5000
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  return "http://localhost:5000";
};

/**
 * Normalizes shop domain input.
 * @param {string} shop
 * @returns {string} Normalized domain
 */
export const normalizeShop = (shop) => {
  if (!shop) return "";
  let clean = shop.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//, "");
  clean = clean.replace(/\/.*$/, "");
  if (!clean.includes(".myshopify.com") && !clean.includes(".")) {
    clean = `${clean}.myshopify.com`;
  }
  return clean;
};

/**
 * Validates shop domain format.
 * @param {string} shop
 * @returns {boolean}
 */
export const isValidShopDomain = (shop) => {
  const normalized = normalizeShop(shop);
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized);
};

/**
 * Checks backend health.
 * GET /api/health
 */
export const checkHealth = async () => {
  try {
    const res = await fetch(`${getBackendUrl()}/api/health`);
    if (!res.ok) {
      return { success: false, message: "Unable to connect to ShopLens services. Please try again later." };
    }
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: "Unable to connect to ShopLens services. Please try again later.",
    };
  }
};

/**
 * Checks whether a store is authenticated in MongoDB.
 * GET /api/auth/status?shop=...
 */
export const checkAuthStatus = async (shopDomain) => {
  const shop = normalizeShop(shopDomain);
  if (!isValidShopDomain(shop)) {
    return { success: false, message: "Invalid Shopify store domain." };
  }

  try {
    const res = await fetch(`${getBackendUrl()}/api/auth/status?shop=${encodeURIComponent(shop)}`);
    if (!res.ok) {
      if (res.status === 400) {
        return { success: false, message: "Invalid Shopify store domain." };
      }
      return { success: false, message: "Unable to connect to ShopLens services. Please try again later." };
    }
    return await res.json();
  } catch (error) {
    return {
      success: false,
      message: "Unable to connect to ShopLens services. Please try again later.",
    };
  }
};

/**
 * Tests connection with Shopify Admin GraphQL API using stored credentials.
 * GET /api/auth/test-connection
 */
export const testConnection = async (shopDomain) => {
  const shop = normalizeShop(shopDomain);
  if (!isValidShopDomain(shop)) {
    return { success: false, message: "Invalid Shopify store domain." };
  }

  try {
    const res = await fetch(
      `${getBackendUrl()}/api/auth/test-connection?shop=${encodeURIComponent(shop)}`,
      {
        headers: {
          ...(await getShopifyAuthorizationHeaders()),
          "x-shopify-shop-domain": shop,
        },
      }
    );

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      return {
        success: false,
        connected: false,
        message: "Shopify authentication failed. Please try connecting your store again.",
      };
    }

    if (res.status === 400) {
      return {
        success: false,
        connected: false,
        message: data.message || "Invalid Shopify store domain.",
      };
    }

    if (!res.ok) {
      return {
        success: false,
        connected: false,
        message: data.message || "Unable to connect to Shopify. Please try again.",
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      connected: false,
      message: "Unable to connect to ShopLens services. Please try again later.",
    };
  }
};

/**
 * Initiates the Shopify OAuth flow by navigating the browser to the backend install endpoint.
 * @param {string} shopDomain
 */
export const initiateInstall = (shopDomain) => {
  const shop = normalizeShop(shopDomain);
  if (!isValidShopDomain(shop)) {
    throw new Error("Invalid Shopify store domain.");
  }

  const installUrl = `${getBackendUrl()}/api/auth/install?shop=${encodeURIComponent(shop)}`;
  window.location.href = installUrl;
};

export default {
  getBackendUrl,
  normalizeShop,
  isValidShopDomain,
  checkHealth,
  checkAuthStatus,
  testConnection,
  initiateInstall,
};
