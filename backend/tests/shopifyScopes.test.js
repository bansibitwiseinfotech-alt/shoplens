import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_REQUIRED_SHOPIFY_SCOPES,
  getMissingShopifyScopes,
  parseShopifyScopes,
  SYNC_REQUIRED_SHOPIFY_SCOPES,
} from "../utils/shopifyScopes.js";

test("parses comma- and whitespace-separated scopes without duplicates", () => {
  assert.deepEqual(parseShopifyScopes("read_products, read_inventory\nread_products"), [
    "read_products",
    "read_inventory",
  ]);
});

test("write_products satisfies the read_products requirement", () => {
  assert.deepEqual(
    getMissingShopifyScopes(
      "write_products,read_inventory,read_orders",
      SYNC_REQUIRED_SHOPIFY_SCOPES
    ),
    []
  );
});

test("sync still requires inventory and order access", () => {
  assert.deepEqual(
    getMissingShopifyScopes("write_products", SYNC_REQUIRED_SHOPIFY_SCOPES),
    ["read_inventory", "read_orders"]
  );
});

test("OAuth requires scopes needed for both sync and merchandising writes", () => {
  assert.deepEqual(
    getMissingShopifyScopes(
      "read_products,read_inventory,read_orders",
      APP_REQUIRED_SHOPIFY_SCOPES
    ),
    ["write_products"]
  );
});

test("invalid scope values do not satisfy requirements", () => {
  assert.deepEqual(
    getMissingShopifyScopes(null, SYNC_REQUIRED_SHOPIFY_SCOPES),
    SYNC_REQUIRED_SHOPIFY_SCOPES
  );
});
