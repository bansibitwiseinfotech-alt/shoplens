import { SHOPIFY_API_SECRET } from "../config/shopify.js";
import {
  isValidAppProxyRequest,
  isValidInternalEventSignature,
  normalizeShopDomain,
} from "../utils/searchIntelligenceEvent.js";

// Internal events from the React Router app are signed with INTERNAL_API_SECRET
// (falling back to SHOPIFY_API_SECRET).  This mirrors the signing logic in
// app/services/searchIntelligence.server.js so both sides always agree.
const INTERNAL_SIGNING_SECRET =
  process.env.INTERNAL_API_SECRET || SHOPIFY_API_SECRET;

export function verifySearchIntelligenceRequest(req, res, next) {
  if (!SHOPIFY_API_SECRET && !INTERNAL_SIGNING_SECRET) {
    console.error("Search Intelligence ingestion rejected: signing secret is not configured.");
    return res.status(503).json({
      success: false,
      message: "Search event ingestion is temporarily unavailable.",
    });
  }

  const internalSignature = req.get("x-shoplens-internal-signature");
  if (internalSignature) {
    // Try INTERNAL_API_SECRET first, then fall back to SHOPIFY_API_SECRET so
    // either key is accepted during a key rotation.
    const secrets = [INTERNAL_SIGNING_SECRET, SHOPIFY_API_SECRET].filter(Boolean);
    const valid = secrets.some((secret) =>
      isValidInternalEventSignature(req.rawBody, internalSignature, secret)
    );
    const shop = normalizeShopDomain(req.body?.trackingId || req.body?.shop);
    if (!valid || !shop) {
      console.warn("[SearchIntelligence] Internal event signature mismatch.", {
        hasRawBody: !!req.rawBody,
        shop,
        secretsAvailable: secrets.length,
      });
      return res.status(401).json({
        success: false,
        message: "Internal event signature is invalid.",
      });
    }
    req.verifiedShop = shop;
    req.isInternalEvent = true;
    return next();
  }

  const shop = isValidAppProxyRequest(req.originalUrl, SHOPIFY_API_SECRET);
  if (shop) {
    req.verifiedShop = shop;
    return next();
  }

  // Accept web pixel events and storefront fallback events
  const candidateShop = normalizeShopDomain(
    req.body?.trackingId || req.body?.shop || req.headers["x-shopify-shop-domain"]
  );
  if (candidateShop) {
    req.verifiedShop = candidateShop;
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "A valid Shopify App Proxy signature or shop domain is required.",
  });
}
