import crypto from "crypto";
import Store from "../models/Store.js";
import { shopifyGraphQL } from "../services/shopifyGraphqlService.js";
import {
  APP_REQUIRED_SHOPIFY_SCOPES,
  getMissingShopifyScopes,
  parseShopifyScopes,
} from "../utils/shopifyScopes.js";

const SHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export const getRequestedScopes = () => {
  const configuredScopes = (process.env.SHOPIFY_SCOPES || "")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return [...new Set([...APP_REQUIRED_SHOPIFY_SCOPES, ...configuredScopes])].join(",");
};

export const verifyShopifyOAuthHmac = (query, secret) => {
  if (
    !query ||
    typeof query !== "object" ||
    typeof query.hmac !== "string" ||
    !/^[a-f0-9]{64}$/i.test(query.hmac) ||
    !secret
  ) {
    return false;
  }

  const entries = Object.entries(query).filter(([key]) => key !== "hmac");

  if (entries.some(([, value]) => typeof value !== "string")) return false;

  const message = entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  const received = Buffer.from(query.hmac, "hex");
  const expected = Buffer.from(digest, "hex");

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
};

/**
 * Validates and normalizes a myshopify.com store domain.
 * @param {string} shop
 * @returns {string|null} Normalized domain or null if invalid
 */
export const normalizeShopDomain = (shop) => {
  if (!shop || typeof shop !== "string") {
    return null;
  }
  const normalized = shop.toLowerCase().trim();
  return SHOPIFY_DOMAIN_REGEX.test(normalized) ? normalized : null;
};

/**
 * GET /api/auth/install
 * Initiates Shopify OAuth flow.
 */
export const startOAuth = (req, res) => {
  try { 
    const rawShop = req.query.shop;
    const shop = normalizeShopDomain(rawShop);

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shopify store domain.",
      });
    }

    const apiKey = process.env.SHOPIFY_API_KEY;
    const scopes = getRequestedScopes();
    const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");

    if (!apiKey || !appUrl) {
      console.error("Missing SHOPIFY_API_KEY or SHOPIFY_APP_URL in environment");
      return res.status(500).json({
        success: false,
        message: "Unable to connect to ShopLens services. Please try again later.",
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    const redirectUri = `${appUrl}/api/auth/callback`;

    const installUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(apiKey)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    // Store OAuth state securely in an HTTP-only cookie
    res.cookie("shopify_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: "/",
    });

    return res.redirect(installUrl);
  } catch (error) {
    console.error("Error initiating OAuth:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to connect to ShopLens services. Please try again later.",
    });
  }
};

/**
 * GET /api/auth/callback
 * Handles Shopify OAuth callback, exchanges code for access token, and saves store.
 */
export const oauthCallback = async (req, res) => {
  try {
    const { code, state, shop: rawShop } = req.query;

    if (!verifyShopifyOAuthHmac(req.query, process.env.SHOPIFY_API_SECRET)) {
      return res.status(401).json({
        success: false,
        message: "Shopify authorization response signature is invalid.",
      });
    }

    const shop = normalizeShopDomain(rawShop);

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shopify store domain.",
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: "Shopify authentication failed. Please try connecting your store again.",
      });
    }

    const savedState = req.cookies?.shopify_oauth_state;

    if (!savedState || savedState !== state) {
      return res.status(403).json({
        success: false,
        message: "Authentication session expired. Please restart the connection.",
      });
    }

    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error("Missing Shopify credentials in environment variables");
      return res.status(500).json({
        success: false,
        message: "Unable to connect to ShopLens services. Please try again later.",
      });
    }

    // Exchange authorization code for permanent access token
    let tokenResponse;
    try {
      tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code,
          expiring: 1,
        }),
      });
    } catch (networkErr) {
      console.error("Token exchange network error:", networkErr.message);
      return res.status(502).json({
        success: false,
        message: "Unable to connect to Shopify. Please try again.",
      });
    }

    if (!tokenResponse.ok) {
      console.error(`Token exchange failed [${tokenResponse.status}].`);
      return res.status(500).json({
        success: false,
        message: "Shopify authentication failed. Please try connecting your store again.",
      });
    }

    const tokenData = await tokenResponse.json();
    const grantedScopes = tokenData.scope;
    const missingScopes = getMissingShopifyScopes(
      grantedScopes,
      APP_REQUIRED_SHOPIFY_SCOPES
    );

    if (missingScopes.length > 0) {
      console.error(
        `Shopify OAuth granted insufficient scopes for ${shop}: ${missingScopes.join(", ")}`
      );
      await Store.updateOne(
        { shop, installed: true },
        {
          $set: {
            reauthorizationRequired: true,
            syncError: `Shopify authorization did not grant required permissions: ${missingScopes.join(", ")}. Reauthorize the app and approve the requested permissions.`,
          },
        }
      );
      return res.status(403).json({
        success: false,
        message: `Shopify did not grant required permissions: ${missingScopes.join(", ")}. Restart authorization and approve the requested permissions.`,
      });
    }

    const accessExpiresIn = Number(tokenData.expires_in);
    const refreshExpiresIn = Number(tokenData.refresh_token_expires_in);
    if (
      !tokenData.access_token ||
      !tokenData.refresh_token ||
      !Number.isFinite(accessExpiresIn) ||
      accessExpiresIn <= 0 ||
      !Number.isFinite(refreshExpiresIn) ||
      refreshExpiresIn <= 0
    ) {
      console.error("Shopify did not issue an expiring offline token pair.");
      return res.status(500).json({
        success: false,
        message: "Shopify did not issue an expiring access token. Please restart the app authorization flow.",
      });
    }

    const tokenIssuedAt = Date.now();
    const expiresAt = new Date(tokenIssuedAt + accessExpiresIn * 1000);
    const refreshTokenExpiresAt = new Date(
      tokenIssuedAt + refreshExpiresIn * 1000
    );

    // Upsert store in MongoDB (never duplicate store records)
    await Store.findOneAndUpdate(
      { shop },
      {
        shop,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || "",
        expiresAt,
        refreshTokenExpiresAt,
        scope: parseShopifyScopes(grantedScopes).join(","),
        installed: true,
        installedAt: new Date(),
        uninstalledAt: null,
        reauthorizationRequired: false,
        syncError: null,
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );

    // Clear OAuth state cookie
    res.clearCookie("shopify_oauth_state", { path: "/" });

    // Redirect merchant to embedded ShopLens app in Shopify Admin
    const storeSubdomain = shop.replace(".myshopify.com", "");
    const redirectUrl = `https://admin.shopify.com/store/${storeSubdomain}/apps/${apiKey}`;

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("OAuth callback error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to connect to ShopLens services. Please try again later.",
    });
  }
};

/**
 * GET /api/auth/test-connection
 * Protected route to test Shopify GraphQL API connection and retrieve shop info.
 */
export const testConnection = async (req, res) => {
  try {
    const { shop, accessToken } = req;

    const query = `
      query getShopInfo {
        shop {
          name
          myshopifyDomain
          currencyCode
        }
      }
    `;

    const data = await shopifyGraphQL({
      shop,
      accessToken,
      query,
    });

    if (!data?.shop) {
      return res.status(500).json({
        success: false,
        message: "Unable to connect to Shopify. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      connected: true,
      shop: {
        name: data.shop.name,
        myshopifyDomain: data.shop.myshopifyDomain,
        currencyCode: data.shop.currencyCode,
      },
    });
  } catch (error) {
    console.error("Connection test failed:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to connect to Shopify. Please try again.",
    });
  }
};

/**
 * GET /api/auth/status
 * Check store authentication status in database
 */
export const getAuthStatus = async (req, res) => {
  try {
    const rawShop = req.query.shop;
    const shop = normalizeShopDomain(rawShop);

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shopify store domain.",
      });
    }

    const store = await Store.findOne({ shop, installed: true });

    if (!store) {
      return res.status(200).json({
        success: true,
        authenticated: false,
        message: "Store is not connected.",
      });
    }

    return res.status(200).json({
      success: true,
      authenticated: true,
      shop: {
        shop: store.shop,
        scope: store.scope,
        installedAt: store.installedAt,
      },
    });
  } catch (error) {
    console.error("Status check error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to connect to ShopLens services. Please try again later.",
    });
  }
};