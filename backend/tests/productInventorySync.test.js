import test from "node:test";
import assert from "node:assert/strict";
import Product from "../models/Product.js";
import { syncProducts } from "../services/productSyncService.js";

const jsonResponse = (data) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify({ data }),
});

const productPage = () => ({
  products: {
    edges: [
      {
        node: {
          id: "gid://shopify/Product/1",
          title: "Live product",
          handle: "live-product",
          description: "Fetched from Shopify",
          vendor: "ShopLens test vendor",
          productType: "Accessory",
          status: "ACTIVE",
          tags: [],
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-02T00:00:00Z",
          variants: {
            edges: [
              {
                node: {
                  id: "gid://shopify/ProductVariant/1",
                  title: "Default",
                  sku: "SKU-1",
                  price: "12.00",
                  inventoryItem: { id: "gid://shopify/InventoryItem/1" },
                  selectedOptions: [],
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          images: {
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
});

test("syncProducts persists live products and location-level available inventory", async () => {
  const originalFetch = global.fetch;
  const originalUpdateOne = Product.updateOne;
  let persisted;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.query.includes("ProductPage")) {
      return jsonResponse(productPage());
    }
    if (body.query.includes("InventoryItems")) {
      return jsonResponse({
        nodes: [
          {
            id: "gid://shopify/InventoryItem/1",
            tracked: true,
            inventoryLevels: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/InventoryLevel/101?inventory_item_id=1",
                    quantities: [{ name: "available", quantity: 8 }],
                  },
                },
                {
                  node: {
                    id: "gid://shopify/InventoryLevel/102?inventory_item_id=1",
                    quantities: [{ name: "available", quantity: 5 }],
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        ],
      });
    }
    throw new Error("Unexpected query in test.");
  };
  Product.updateOne = async (...args) => {
    persisted = args;
    return { acknowledged: true };
  };

  try {
    const result = await syncProducts("alpha.myshopify.com", "alpha-token");
    assert.deepEqual(result, { totalFetched: 1, synced: 1, failed: 0 });
    assert.deepEqual(persisted[0], {
      shop: "alpha.myshopify.com",
      shopifyProductId: "gid://shopify/Product/1",
    });
    const variant = persisted[1].$set.variants[0];
    assert.equal(variant.inventoryQuantity, 13);
    assert.deepEqual(
      variant.inventoryLevels.map(({ availableQuantity }) => availableQuantity),
      [8, 5]
    );
    assert.ok(variant.inventoryLevels.every(({ inventoryLevelId }) => inventoryLevelId));
  } finally {
    global.fetch = originalFetch;
    Product.updateOne = originalUpdateOne;
  }
});

test("inventory API errors fail product sync rather than returning a successful summary", async () => {
  const originalFetch = global.fetch;
  const originalUpdateOne = Product.updateOne;
  let persisted = false;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.query.includes("ProductPage")) {
      return jsonResponse(productPage());
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          errors: [{ message: "Access denied for inventoryItems field." }],
        }),
    };
  };
  Product.updateOne = async () => {
    persisted = true;
  };

  try {
    await assert.rejects(
      syncProducts("alpha.myshopify.com", "alpha-token"),
      (error) => {
        assert.match(error.message, /Access denied for inventoryItems/);
        assert.deepEqual(error.syncSummary, {
          totalFetched: 1,
          synced: 0,
          failed: 1,
        });
        return true;
      }
    );
    assert.equal(persisted, false);
  } finally {
    global.fetch = originalFetch;
    Product.updateOne = originalUpdateOne;
  }
});
