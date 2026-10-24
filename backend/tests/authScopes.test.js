import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import Store from "../models/Store.js";

const signOAuthQuery = (query, secret) => {
  const message = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.createHmac("sha256", secret).update(message).digest("hex");
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  redirectedTo: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  clearCookie() {},
  redirect(url) {
    this.redirectedTo = url;
    return this;
  },
});

test("OAuth config and backend authorization request require real sync scopes", async () => {
  const originalScopes = process.env.SHOPIFY_SCOPES;
  process.env.SHOPIFY_SCOPES = "read_customers,write_metaobjects";

  try {
    const { getRequestedScopes } = await import("../controllers/authController.js");
    const scopes = new Set(getRequestedScopes().split(","));
    const config = await readFile(
      new URL("../../shopify.app.toml", import.meta.url),
      "utf8"
    );
    const configuredScopes = config.match(/^scopes\s*=\s*"([^"]+)"/m)?.[1];

    assert.ok(scopes.has("read_products"));
    assert.ok(scopes.has("read_inventory"));
    assert.ok(scopes.has("read_orders"));
    assert.ok(scopes.has("write_products"));
    assert.ok(configuredScopes?.split(",").includes("read_inventory"));
  } finally {
    process.env.SHOPIFY_SCOPES = originalScopes;
  }
});

test("OAuth callback stores only verified grants and preserves an existing token on denial", async () => {
  const originalEnv = {
    SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
  };
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = Store.findOneAndUpdate;
  const originalUpdateOne = Store.updateOne;
  process.env.SHOPIFY_API_KEY = "test-api-key";
  process.env.SHOPIFY_API_SECRET = "test-api-secret";
  const { oauthCallback } = await import("../controllers/authController.js");
  let persisted;
  let reauthUpdate;
  let authorizationResponse = {
    access_token: "new-access-token",
    refresh_token: "new-refresh-token",
    expires_in: 3600,
    refresh_token_expires_in: 86400,
    scope: "read_products,read_inventory,read_orders,write_products",
  };
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => authorizationResponse,
  });
  Store.findOneAndUpdate = async (...args) => {
    persisted = args;
    return {};
  };
  Store.updateOne = async (...args) => {
    reauthUpdate = args;
    return {};
  };

  const baseQuery = {
    code: "one-time-code",
    shop: "alpha.myshopify.com",
    state: "csrf-state",
    timestamp: "1791800000",
  };

  try {
    const successQuery = {
      ...baseQuery,
      hmac: signOAuthQuery(baseQuery, process.env.SHOPIFY_API_SECRET),
    };
    const successResponse = makeResponse();
    await oauthCallback(
      {
        query: successQuery,
        cookies: { shopify_oauth_state: "csrf-state" },
      },
      successResponse
    );

    assert.equal(successResponse.statusCode, 200);
    assert.equal(persisted[0].shop, "alpha.myshopify.com");
    assert.equal(persisted[1].accessToken, "new-access-token");
    assert.equal(
      persisted[1].scope,
      "read_products,read_inventory,read_orders,write_products"
    );
    assert.equal(persisted[1].reauthorizationRequired, false);

    persisted = null;
    authorizationResponse = {
      ...authorizationResponse,
      scope: "read_products,read_orders,write_products",
    };
    const deniedQuery = {
      ...baseQuery,
      timestamp: "1791800001",
      hmac: signOAuthQuery(
        { ...baseQuery, timestamp: "1791800001" },
        process.env.SHOPIFY_API_SECRET
      ),
    };
    const deniedResponse = makeResponse();
    await oauthCallback(
      {
        query: deniedQuery,
        cookies: { shopify_oauth_state: "csrf-state" },
      },
      deniedResponse
    );

    assert.equal(deniedResponse.statusCode, 403);
    assert.equal(persisted, null);
    assert.equal(reauthUpdate[1].$set.reauthorizationRequired, true);
    assert.match(reauthUpdate[1].$set.syncError, /read_inventory/);
  } finally {
    process.env.SHOPIFY_API_KEY = originalEnv.SHOPIFY_API_KEY;
    process.env.SHOPIFY_API_SECRET = originalEnv.SHOPIFY_API_SECRET;
    global.fetch = originalFetch;
    Store.findOneAndUpdate = originalFindOneAndUpdate;
    Store.updateOne = originalUpdateOne;
  }
});

test("OAuth callback rejects invalid signatures before exchanging or storing tokens", async () => {
  const originalSecret = process.env.SHOPIFY_API_SECRET;
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = Store.findOneAndUpdate;
  process.env.SHOPIFY_API_SECRET = "test-api-secret";
  let exchanged = false;
  let persisted = false;
  global.fetch = async () => {
    exchanged = true;
    throw new Error("unexpected token exchange");
  };
  Store.findOneAndUpdate = async () => {
    persisted = true;
  };

  try {
    const { oauthCallback } = await import("../controllers/authController.js");
    const res = makeResponse();
    await oauthCallback(
      {
        query: {
          code: "code",
          shop: "alpha.myshopify.com",
          state: "state",
          hmac: "0".repeat(64),
        },
        cookies: { shopify_oauth_state: "state" },
      },
      res
    );
    assert.equal(res.statusCode, 401);
    assert.equal(exchanged, false);
    assert.equal(persisted, false);
  } finally {
    process.env.SHOPIFY_API_SECRET = originalSecret;
    global.fetch = originalFetch;
    Store.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
