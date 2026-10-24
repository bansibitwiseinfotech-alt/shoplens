import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import http from "http";
import app from "../app.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { FEATURES } from "../config/billingPlans.js";
import { requireFeature } from "../middleware/billingMiddleware.js";

test.before(async () => {
  await connectDB();
});

test.after(async () => {
  await mongoose.connection.close();
});

// Helper to make local HTTP requests to Express app
const createTestServer = () => {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
};

test("GET /api/billing/plans returns 3 plan definitions with pricing and explicit limits", async () => {
  const { server, url, close } = await createTestServer();
  try {
    const res = await fetch(`${url}/api/billing/plans`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.plans);
    assert.ok(body.data.plans.free);
    assert.ok(body.data.plans.pro);
    assert.ok(body.data.plans.premium);

    // Verify explicit limits
    assert.equal(body.data.plans.free.limits.searchIntelligenceProducts, 20);
    assert.equal(body.data.plans.pro.limits.searchIntelligenceProducts, 50);
    assert.equal(body.data.plans.premium.limits.searchIntelligenceProducts, null);

    // Verify pricing
    assert.equal(body.data.plans.free.pricing.monthly.amount, 0);
    assert.equal(body.data.plans.free.pricing.yearly.amount, 0);
    assert.equal(body.data.plans.pro.pricing.monthly.amount, 19);
    assert.equal(body.data.plans.pro.pricing.yearly.amount, 190);
    assert.equal(body.data.plans.premium.pricing.monthly.amount, 49);
    assert.equal(body.data.plans.premium.pricing.yearly.amount, 490);
  } finally {
    await close();
  }
});

test("Billing webhook rejects requests without HMAC signature", async () => {
  const { server, url, close } = await createTestServer();
  try {
    const res = await fetch(`${url}/api/webhooks/app-subscriptions-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.message.includes("Missing Shopify webhook signature"));
  } finally {
    await close();
  }
});

test("Billing webhook rejects requests with invalid HMAC signature", async () => {
  const { server, url, close } = await createTestServer();
  try {
    const res = await fetch(`${url}/api/webhooks/app-subscriptions-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256": "invalid_signature_base64",
        "X-Shopify-Shop-Domain": "test-store.myshopify.com",
      },
      body: JSON.stringify({ test: true }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.message.includes("Invalid Shopify webhook signature"));
  } finally {
    await close();
  }
});

test("Billing webhook verifies valid HMAC signature and processes payload idempotently", async () => {
  const { server, url, close } = await createTestServer();
  const secret = process.env.SHOPIFY_API_SECRET || "test_mock_shopify_app_shared_secret_value";

  const payload = {
    app_subscription: {
      admin_graphql_api_id: "gid://shopify/AppSubscription/99887766",
      name: "ShopLens Pro Plan (Monthly)",
      status: "ACTIVE",
      currency: "USD",
    },
  };
  const rawBody = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const webhookId = `wh_test_${Date.now()}`;

  try {
    // 1. Initial delivery
    const res1 = await fetch(`${url}/api/webhooks/app-subscriptions-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256": hmac,
        "X-Shopify-Shop-Domain": "test-webhook-shop.myshopify.com",
        "X-Shopify-Webhook-Id": webhookId,
      },
      body: rawBody,
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.success, true);

    // 2. Duplicate retry with same webhook ID (idempotency check)
    const res2 = await fetch(`${url}/api/webhooks/app-subscriptions-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256": hmac,
        "X-Shopify-Shop-Domain": "test-webhook-shop.myshopify.com",
        "X-Shopify-Webhook-Id": webhookId,
      },
      body: rawBody,
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.success, true);
    assert.ok(body2.message.includes("idempotent duplicate"));
  } finally {
    await close();
  }
});

test("requireFeature middleware blocks unauthorized features with 403 and upgrade advice", async () => {
  const middleware = requireFeature(FEATURES.SMART_MERCHANDISING_RULES);

  let statusCalled = null;
  let jsonSent = null;
  const mockRes = {
    status: (code) => {
      statusCalled = code;
      return mockRes;
    },
    json: (data) => {
      jsonSent = data;
      return mockRes;
    },
  };

  // Test Free plan accessing Premium feature
  const mockReqFree = {
    currentPlan: "free",
    subscription: { plan: "free", isActive: () => true },
  };

  let nextCalled = false;
  await middleware(mockReqFree, mockRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCalled, 403);
  assert.equal(jsonSent.error, "FEATURE_ACCESS_DENIED");
  assert.equal(jsonSent.code, "UPGRADE_REQUIRED");
  assert.equal(jsonSent.currentPlan, "free");
  assert.equal(jsonSent.requiredPlan, "premium");

  // Test Pro plan accessing Premium feature
  statusCalled = null;
  jsonSent = null;
  const mockReqPro = {
    currentPlan: "pro",
    subscription: { plan: "pro", isActive: () => true },
  };

  await middleware(mockReqPro, mockRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCalled, 403);
  assert.equal(jsonSent.requiredPlan, "premium");

  // Test Premium plan accessing Premium feature
  nextCalled = false;
  const mockReqPremium = {
    currentPlan: "premium",
    subscription: { plan: "premium", isActive: () => true },
  };

  await middleware(mockReqPremium, mockRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
