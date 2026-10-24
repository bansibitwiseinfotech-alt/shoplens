import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchShopCollections,
  updateCollectionOrder,
} from "../services/shopifyMerchandisingService.js";

function jsonResponse(data) {
  return {
    ok: true,
    json: async () => ({ data }),
  };
}

test("fetchShopCollections follows Shopify cursors and returns live collection IDs", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);

    if (requests.length === 1) {
      return jsonResponse({
        collections: {
          nodes: [{ id: "gid://shopify/Collection/1", title: "First" }],
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        },
      });
    }

    return jsonResponse({
      collections: {
        nodes: [{ id: "gid://shopify/Collection/2", title: "Second" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
  };

  try {
    const collections = await fetchShopCollections("shop.myshopify.com", "token");
    assert.deepEqual(collections, [
      { id: "gid://shopify/Collection/1", title: "First" },
      { id: "gid://shopify/Collection/2", title: "Second" },
    ]);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].variables.after, "cursor-1");
  } finally {
    global.fetch = originalFetch;
  }
});

test("updateCollectionOrder submits only changed products and verifies Shopify's final order", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  const originalIds = ["A", "B", "C", "D"];
  const orderedIds = ["C", "A", "B", "D"];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);

    if (body.query.includes("SetCollectionManualOrder")) {
      return jsonResponse({
        collectionUpdate: {
          collection: {
            id: "gid://shopify/Collection/1",
            sortOrder: "MANUAL",
          },
          userErrors: [],
        },
      });
    }

    if (body.query.includes("mutation ReorderCollection")) {
      return jsonResponse({
        collectionReorderProducts: {
          job: { id: "gid://shopify/Job/1", done: false },
          userErrors: [],
        },
      });
    }

    if (body.query.includes("query MerchandisingReorderJob")) {
      return jsonResponse({ job: { id: "gid://shopify/Job/1", done: true } });
    }

    return jsonResponse({
      collection: {
        id: "gid://shopify/Collection/1",
        title: "Collection",
        sortOrder: "MANUAL",
        products: {
          nodes: orderedIds.map((id) => ({
            id,
            title: id,
            createdAt: "2026-01-01T00:00:00Z",
            productType: "",
            vendor: "",
            tags: [],
            totalInventory: 1,
            priceRangeV2: {
              minVariantPrice: { amount: "1.00", currencyCode: "USD" },
            },
          })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
  };

  try {
    const result = await updateCollectionOrder(
      "shop.myshopify.com",
      "token",
      "gid://shopify/Collection/1",
      orderedIds,
      originalIds
    );

    assert.deepEqual(result, {
      accepted: true,
      verified: true,
      jobIds: ["gid://shopify/Job/1"],
    });
    const reorderRequest = requests.find((request) =>
      request.query.includes("mutation ReorderCollection")
    );
    assert.deepEqual(reorderRequest.variables.moves, [
      { id: "C", newPosition: "0" },
    ]);
    assert.ok(
      requests.some((request) =>
        request.query.includes("query MerchandisingReorderJob")
      )
    );
  } finally {
    global.fetch = originalFetch;
  }
});
