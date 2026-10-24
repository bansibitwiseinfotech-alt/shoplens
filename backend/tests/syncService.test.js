import test from "node:test";
import assert from "node:assert/strict";
import { syncShopData } from "../services/syncService.js";

const successfulDependencies = (shop, scopeList) => {
  const updates = [];
  const store = {
    shop,
    accessToken: `${shop}-stored-token`,
    scope: "stale-scope-cache",
  };

  return {
    updates,
    store,
    dependencies: {
      findStore: async (filter) => {
        assert.deepEqual(filter, { shop, installed: true });
        return store;
      },
      updateStore: async (filter, update) => {
        updates.push({ filter, update });
        return store;
      },
      getAccessToken: async (providedStore) => {
        assert.equal(providedStore, store);
        return `${shop}-current-token`;
      },
      fetchGrantedScopes: async (providedShop, token) => {
        assert.equal(providedShop, shop);
        assert.equal(token, `${shop}-current-token`);
        return scopeList;
      },
      syncProducts: async (providedShop, token) => {
        assert.equal(providedShop, shop);
        assert.equal(token, `${shop}-current-token`);
        return { totalFetched: 1, synced: 1, failed: 0 };
      },
      syncCollections: async () => ({ totalFetched: 0, created: 0, updated: 0, failed: 0 }),
      syncOrders: async () => ({ totalFetched: 0, created: 0, updated: 0, failed: 0 }),
      syncCustomers: async () => ({ totalFetched: 0, failed: 0 }),
    },
  };
};

test("sync validates live token permissions, not stale scope metadata", async () => {
  const { dependencies, updates } = successfulDependencies(
    "alpha.myshopify.com",
    ["write_products", "read_inventory", "read_orders"]
  );

  const result = await syncShopData("alpha.myshopify.com", dependencies);
  assert.equal(result.products.synced, 1);
  assert.equal(result.customers.totalFetched, 0);
  assert.ok(
    updates.some(
      ({ update }) =>
        update.$set?.scope === "write_products,read_inventory,read_orders" &&
        update.$set.reauthorizationRequired === false
    )
  );
});

test("missing live inventory permission stops the sync with a reauthorization action", async () => {
  const { dependencies, updates } = successfulDependencies(
    "alpha.myshopify.com",
    ["write_products", "read_orders"]
  );
  let productsSynced = false;
  dependencies.syncProducts = async () => {
    productsSynced = true;
  };

  await assert.rejects(
    syncShopData("alpha.myshopify.com", dependencies),
    /missing required scopes: read_inventory\. Reauthorize the app/
  );
  assert.equal(productsSynced, false);
  assert.ok(
    updates.some(
      ({ update }) =>
        update.$set?.reauthorizationRequired === true &&
        update.$set.syncError.includes("read_inventory")
    )
  );
  assert.ok(
    updates.some(
      ({ update }) =>
        update.$set?.syncStatus === "failed" &&
        update.$set.syncError.includes("read_inventory")
    )
  );
});

test("one shop's authorization and sync state stay isolated from another shop", async () => {
  const alpha = successfulDependencies("alpha.myshopify.com", [
    "write_products",
    "read_inventory",
    "read_orders",
  ]);
  const beta = successfulDependencies("beta.myshopify.com", [
    "write_products",
    "read_inventory",
    "read_orders",
  ]);

  const results = await Promise.all([
    syncShopData("alpha.myshopify.com", alpha.dependencies),
    syncShopData("beta.myshopify.com", beta.dependencies),
  ]);
  assert.equal(results.length, 2);
  assert.ok(alpha.updates.every(
    ({ filter }) => filter.shop === "alpha.myshopify.com"
  ));
  assert.ok(beta.updates.every(
    ({ filter }) => filter.shop === "beta.myshopify.com"
  ));
});

test("an inventory/product sync failure is persisted as failure, never as success", async () => {
  const { dependencies, updates } = successfulDependencies(
    "alpha.myshopify.com",
    ["write_products", "read_inventory", "read_orders"]
  );
  dependencies.syncProducts = async () => {
    const error = new Error("Shopify inventory API request failed.");
    error.syncSummary = { totalFetched: 1, synced: 0, failed: 1 };
    throw error;
  };

  await assert.rejects(
    syncShopData("alpha.myshopify.com", dependencies),
    /inventory API request failed/
  );
  assert.ok(
    updates.some(
      ({ update }) => update.$set?.syncStatus === "failed"
    )
  );
  assert.ok(
    updates.every(
      ({ update }) => update.$set?.syncStatus !== "success"
    )
  );
});
