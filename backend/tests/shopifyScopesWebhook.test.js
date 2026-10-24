import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Store from "../models/Store.js";
import { handleAppScopesUpdate } from "../controllers/webhookController.js";

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("scope update webhook verifies Shopify HMAC and stores granted scopes", async () => {
  const originalSecret = process.env.SHOPIFY_API_SECRET;
  const originalFindOneAndUpdate = Store.findOneAndUpdate;
  const rawBody = Buffer.from(
    JSON.stringify({
      current: [
        "read_products",
        "read_inventory",
        "read_orders",
        "write_products",
      ],
      previous: ["read_products"],
    })
  );
  const signature = crypto
    .createHmac("sha256", "test-secret")
    .update(rawBody)
    .digest("base64");
  let update;

  process.env.SHOPIFY_API_SECRET = "test-secret";
  Store.findOneAndUpdate = async (...args) => {
    update = args;
    return { shop: "shop.myshopify.com" };
  };

  try {
    const res = createResponse();
    await handleAppScopesUpdate(
      {
        body: rawBody,
        headers: {
          "x-shopify-hmac-sha256": signature,
          "x-shopify-shop-domain": "shop.myshopify.com",
        },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(update[0], {
      shop: "shop.myshopify.com",
      installed: true,
    });
    assert.deepEqual(update[1], {
      $set: {
        scope: "read_products,read_inventory,read_orders,write_products",
        reauthorizationRequired: false,
        syncError: null,
      },
    });
    assert.equal("accessToken" in update[1].$set, false);
    assert.equal("refreshToken" in update[1].$set, false);
  } finally {
    process.env.SHOPIFY_API_SECRET = originalSecret;
    Store.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("scope update marks only the identified store for reauthorization when inventory is revoked", async () => {
  const originalSecret = process.env.SHOPIFY_API_SECRET;
  const originalFindOneAndUpdate = Store.findOneAndUpdate;
  const rawBody = Buffer.from(
    JSON.stringify({ current: ["read_products", "read_orders", "write_products"] })
  );
  const signature = crypto
    .createHmac("sha256", "test-secret")
    .update(rawBody)
    .digest("base64");
  let update;
  process.env.SHOPIFY_API_SECRET = "test-secret";
  Store.findOneAndUpdate = async (...args) => {
    update = args;
    return { shop: "beta.myshopify.com" };
  };

  try {
    const res = createResponse();
    await handleAppScopesUpdate(
      {
        body: rawBody,
        headers: {
          "x-shopify-hmac-sha256": signature,
          "x-shopify-shop-domain": "beta.myshopify.com",
        },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(update[0], {
      shop: "beta.myshopify.com",
      installed: true,
    });
    assert.equal(update[1].$set.reauthorizationRequired, true);
    assert.match(update[1].$set.syncError, /read_inventory/);
    assert.equal("accessToken" in update[1].$set, false);
    assert.equal("refreshToken" in update[1].$set, false);
  } finally {
    process.env.SHOPIFY_API_SECRET = originalSecret;
    Store.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("scope update webhook rejects invalid signatures before updating the store", async () => {
  const originalSecret = process.env.SHOPIFY_API_SECRET;
  const originalFindOneAndUpdate = Store.findOneAndUpdate;
  let updated = false;
  process.env.SHOPIFY_API_SECRET = "test-secret";
  Store.findOneAndUpdate = async () => {
    updated = true;
    return { shop: "shop.myshopify.com" };
  };

  try {
    const res = createResponse();
    await handleAppScopesUpdate(
      {
        body: Buffer.from('{"current":["read_products"]}'),
        headers: {
          "x-shopify-hmac-sha256": "invalid",
          "x-shopify-shop-domain": "shop.myshopify.com",
        },
      },
      res
    );

    assert.equal(res.statusCode, 401);
    assert.equal(updated, false);
  } finally {
    process.env.SHOPIFY_API_SECRET = originalSecret;
    Store.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
