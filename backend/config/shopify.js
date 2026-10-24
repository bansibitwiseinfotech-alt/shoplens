const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_API_VERSION =
  process.env.SHOPIFY_API_VERSION || "2026-10";

const APP_URL = process.env.APP_URL || process.env.SHOPIFY_APP_URL;

if (!SHOPIFY_API_KEY) {
  console.warn("⚠️ SHOPIFY_API_KEY is missing");
}

if (!SHOPIFY_API_SECRET) {
  console.warn("⚠️ SHOPIFY_API_SECRET is missing");
}

if (!APP_URL) {
  console.warn("⚠️ APP_URL is missing");
}

export const getShopifyUrl = (shop) => {
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
};

export {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_API_VERSION,
  APP_URL,
};