import Store from "../models/Store.js";
import "@shopify/shopify-api/adapters/node";
import { ApiVersion, shopifyApi } from "@shopify/shopify-api";
import { SHOPIFY_API_KEY, SHOPIFY_API_SECRET } from "../config/shopify.js";
import { getShopAccessToken } from "../services/shopifyTokenService.js";

const SHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY || "missing-api-key",
  apiSecretKey: SHOPIFY_API_SECRET || "missing-api-secret",
  scopes: [],
  hostName: "localhost",
  apiVersion: ApiVersion.July26,
  isEmbeddedApp: true,
});

const getRequestedShop = (req) =>
  req.headers["x-shopify-shop-domain"] ||
  req.headers["x-shop-domain"] ||
  req.query.shop ||
  req.body?.shop;

/**
 * Middleware to authenticate requests from Shopify stores.
 * Validates shop domain and verifies active store record with access token in MongoDB.
 */
export const authenticateShop = async (req, res, next) => {
  try {
    const [scheme, token, ...extra] = (req.headers.authorization || "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token || extra.length) {
      return res.status(401).json({
        success: false,
        message: "A valid Shopify session token is required.",
      });
    }

    if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
      console.error("Shopify session-token credentials are not configured.");
      return res.status(500).json({
        success: false,
        message: "Shopify authentication is not configured.",
      });
    }

    let payload;
    try {
      payload = await shopify.session.decodeSessionToken(token);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Shopify session token is invalid or expired.",
      });
    }

    let destination;
    try {
      destination = new URL(payload.dest);
    } catch {
      destination = null;
    }

    const normalizedShop = destination?.hostname.toLowerCase();
    const requestedShop = getRequestedShop(req);

    if (
      !normalizedShop ||
      destination.protocol !== "https:" ||
      !SHOPIFY_DOMAIN_REGEX.test(normalizedShop) ||
      payload.aud !== SHOPIFY_API_KEY ||
      payload.iss !== `https://${normalizedShop}/admin` ||
      (requestedShop &&
        (typeof requestedShop !== "string" ||
          requestedShop.toLowerCase().trim() !== normalizedShop))
    ) {
      return res.status(401).json({
        success: false,
        message: "Shopify session does not match this store.",
      });
    }

    const store = await Store.findOne({
      shop: normalizedShop,
      installed: true,
    });

    if (!store) {
      return res.status(401).json({
        success: false,
        message: "Shop is not authenticated or app is not installed.",
      });
    }

    // The signed session token, not the shop header, establishes store identity.
    req.shop = store.shop;
    req.store = store;
    req.shopifySessionToken = payload;

    return next();
  } catch (error) {
    console.error("Authentication middleware error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to connect to ShopLens services. Please try again later.",
    });
  }
};

export const requireShopifyAccessToken = async (req, res, next) => {
  try {
    const shop = req.store?.shop || req.shop || getRequestedShop(req);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shopify store authentication is required.",
      });
    }

    req.accessToken = await getShopAccessToken(shop);
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

export const requireStoreScopes = (...requiredScopes) => (req, res, next) => {
  const grantedScopes = new Set(
    (req.store?.scope || "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean)
  );

  const isScopeGranted = (scope) => {
    if (grantedScopes.has(scope)) return true;
    // In Shopify OAuth, write permissions automatically grant read permissions
    if (scope.startsWith("read_")) {
      const writeEquivalent = `write_${scope.slice(5)}`;
      if (grantedScopes.has(writeEquivalent)) return true;
    }
    return false;
  };

  const missingScopes = requiredScopes.filter((scope) => !isScopeGranted(scope));

  if (missingScopes.length > 0) {
    return res.status(403).json({
      success: false,
      message: `Shopify access token is missing required scopes: ${missingScopes.join(", ")}. Reconnect the app to grant these permissions.`,
    });
  }

  return next();
};

export default authenticateShop;