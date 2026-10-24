import test from "node:test";
import assert from "node:assert/strict";
import { fetchCurrentGrantedScopes } from "../services/shopifyScopeService.js";

test("fetchCurrentGrantedScopes reads permissions from the token sent for that shop", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({
      url,
      token: options.headers["X-Shopify-Access-Token"],
      body: JSON.parse(options.body),
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          data: {
            currentAppInstallation: {
              accessScopes: [
                { handle: "read_inventory" },
                { handle: "write_products" },
                { handle: "read_inventory" },
              ],
            },
          },
        }),
    };
  };

  try {
    const alpha = await fetchCurrentGrantedScopes(
      "alpha.myshopify.com",
      "alpha-token"
    );
    const beta = await fetchCurrentGrantedScopes(
      "beta.myshopify.com",
      "beta-token"
    );

    assert.deepEqual(alpha, ["read_inventory", "write_products"]);
    assert.deepEqual(beta, alpha);
    assert.equal(calls[0].url, "https://alpha.myshopify.com/admin/api/2026-10/graphql.json");
    assert.equal(calls[1].url, "https://beta.myshopify.com/admin/api/2026-10/graphql.json");
    assert.equal(calls[0].token, "alpha-token");
    assert.equal(calls[1].token, "beta-token");
    assert.match(calls[0].body.query, /currentAppInstallation/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchCurrentGrantedScopes rejects missing or malformed live API data", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () =>
      JSON.stringify({
        data: { currentAppInstallation: { accessScopes: [{ handle: "" }] } },
      }),
  });

  try {
    await assert.rejects(
      fetchCurrentGrantedScopes("alpha.myshopify.com", "token"),
      /did not return the current app installation scopes/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
