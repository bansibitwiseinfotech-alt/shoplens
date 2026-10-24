import test from "node:test";
import assert from "node:assert/strict";
import { fetchInventoryForItems } from "../services/inventorySyncService.js";

const response = (data, status = 200, retryAfter = null) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get(name) {
      return name === "retry-after" ? retryAfter : null;
    },
  },
  text: async () => JSON.stringify({ data }),
});

test("fetchInventoryForItems returns available quantities separately for each level", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body, token: options.headers["X-Shopify-Access-Token"] });

    return response({
      nodes: body.variables.ids.map((id) => ({
        id,
        tracked: true,
        inventoryLevels: {
          edges: [
            {
              node: {
                id: `gid://shopify/InventoryLevel/${id.endsWith("1") ? "101" : "202"}?inventory_item_id=${id}`,
                quantities: [{ name: "available", quantity: id.endsWith("1") ? 7 : 3 }],
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      })),
    });
  };

  try {
    const result = await fetchInventoryForItems(
      "alpha.myshopify.com",
      "alpha-token",
      ["gid://shopify/InventoryItem/1", "gid://shopify/InventoryItem/2"]
    );

    assert.equal(result.get("gid://shopify/InventoryItem/1").tracked, true);
    assert.deepEqual(
      result.get("gid://shopify/InventoryItem/1").inventoryLevels.map(
        ({ availableQuantity }) => availableQuantity
      ),
      [7]
    );
    assert.deepEqual(
      result.get("gid://shopify/InventoryItem/2").inventoryLevels.map(
        ({ availableQuantity }) => availableQuantity
      ),
      [3]
    );
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/2026-10\/graphql\.json$/);
    assert.equal(requests[0].token, "alpha-token");
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchInventoryForItems paginates levels and fails when Shopify omits an item", async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    if (body.query.includes("InventoryItems")) {
      return response({
        nodes: [
          {
            id: "gid://shopify/InventoryItem/1",
            tracked: true,
            inventoryLevels: {
              edges: [{ node: { id: "level-1", quantities: [{ name: "available", quantity: 4 }] } }],
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
            },
          },
        ],
      });
    }

    return response({
      inventoryItem: {
        id: "gid://shopify/InventoryItem/1",
        tracked: true,
        inventoryLevels: {
          edges: [{ node: { id: "level-2", quantities: [{ name: "available", quantity: 6 }] } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
  };

  try {
    const result = await fetchInventoryForItems(
      "alpha.myshopify.com",
      "alpha-token",
      ["gid://shopify/InventoryItem/1"]
    );
    assert.equal(calls, 2);
    assert.deepEqual(
      result.get("gid://shopify/InventoryItem/1").inventoryLevels.map(
        ({ availableQuantity }) => availableQuantity
      ),
      [4, 6]
    );

    global.fetch = async () => response({ nodes: [null] });
    await assert.rejects(
      fetchInventoryForItems("beta.myshopify.com", "beta-token", [
        "gid://shopify/InventoryItem/9",
      ]),
      /did not return inventory item/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("Shopify GraphQL read queries retry transient rate limits, mutations are not retried", async () => {
  const originalFetch = global.fetch;
  let queryAttempts = 0;
  let mutationAttempts = 0;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.query.startsWith("query")) {
      queryAttempts += 1;
      return queryAttempts === 1
        ? response({}, 429, "0.001")
        : response({ shop: { name: "Store" } });
    }

    mutationAttempts += 1;
    return response({}, 503);
  };

  try {
    const { shopifyGraphQL } = await import("../services/shopifyGraphqlService.js");
    const result = await shopifyGraphQL({
      shop: "alpha.myshopify.com",
      accessToken: "token",
      query: "query ShopName { shop { name } }",
    });
    assert.deepEqual(result, { shop: { name: "Store" } });
    assert.equal(queryAttempts, 2);

    await assert.rejects(
      shopifyGraphQL({
        shop: "alpha.myshopify.com",
        accessToken: "token",
        query: "# A mutation must never be retried\nmutation DoThing { __typename }",
      }),
      /HTTP 503/
    );
    assert.equal(mutationAttempts, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
