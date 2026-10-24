import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import app from "../app.js";
import Subscription from "../models/Subscription.js";
import Store from "../models/Store.js";
import MonthlyUsage from "../models/MonthlyUsage.js";
import { getUsage, getAccess } from "../controllers/billingController.js";

const TEST_SHOP = "test-billing-store.myshopify.com";

test.before(async () => {
  await connectDB();
  // Ensure test store exists in tbl_stores
  await Store.findOneAndUpdate(
    { shop: TEST_SHOP },
    {
      $set: {
        shop: TEST_SHOP,
        accessToken: "test_access_token_12345",
        installed: true,
        installedAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Clean test subscriptions and usages
  await Subscription.deleteMany({ shop: TEST_SHOP });
  await MonthlyUsage.deleteMany({ shop: TEST_SHOP });
});

test.after(async () => {
  await Subscription.deleteMany({ shop: TEST_SHOP });
  await MonthlyUsage.deleteMany({ shop: TEST_SHOP });
  await Store.deleteOne({ shop: TEST_SHOP });
  await mongoose.connection.close();
});

test("Subscription.getOrCreateForShop initializes Free plan as default", async () => {
  const sub = await Subscription.getOrCreateForShop(TEST_SHOP);
  assert.equal(sub.shop, TEST_SHOP);
  assert.equal(sub.plan, "free");
  assert.equal(sub.status, "ACTIVE");
  assert.equal(sub.price, 0);
  assert.equal(sub.isActive(), true);

  const safe = sub.toSafeObject();
  assert.equal(safe.plan, "free");
  assert.equal(safe.planName, "Free");
  assert.equal(safe.isPaid, false);
  assert.equal(safe.limits.searchIntelligenceProducts, 20);
  assert.equal(safe.limits.zeroResultSearchQueries, 20);
});

test("MonthlyUsage.calculateLiveUsage computes usage and respects limits", async () => {
  const usage = await MonthlyUsage.calculateLiveUsage(TEST_SHOP, "free");
  assert.ok(usage.period);
  assert.ok(usage.metrics);

  const zeroResultMetric = usage.metrics.zeroResultSearchQueries;
  assert.equal(zeroResultMetric.limit, 20);
  assert.equal(zeroResultMetric.isUnlimited, false);

  const searchProdMetric = usage.metrics.searchIntelligenceProducts;
  assert.equal(searchProdMetric.limit, 20);
  assert.equal(searchProdMetric.isUnlimited, false);
});

test("MonthlyUsage for Premium tier reports explicit unlimited null", async () => {
  const usage = await MonthlyUsage.calculateLiveUsage(TEST_SHOP, "premium");

  const zeroResultMetric = usage.metrics.zeroResultSearchQueries;
  assert.equal(zeroResultMetric.limit, null);
  assert.equal(zeroResultMetric.isUnlimited, true);
  assert.equal(zeroResultMetric.exceeded, false);

  const searchProdMetric = usage.metrics.searchIntelligenceProducts;
  assert.equal(searchProdMetric.limit, null);
  assert.equal(searchProdMetric.isUnlimited, true);
});

test("getAccess controller outputs comprehensive feature permissions map", async () => {
  const mockReq = {
    shop: TEST_SHOP,
  };

  let responseData = null;
  const mockRes = {
    status: (code) => {
      assert.equal(code, 200);
      return mockRes;
    },
    json: (payload) => {
      responseData = payload;
      return mockRes;
    },
  };

  await getAccess(mockReq, mockRes);
  assert.ok(responseData?.success);
  assert.equal(responseData.data.shop, TEST_SHOP);
  assert.equal(responseData.data.plan, "free");

  // On Free plan: collection merchandising, smart rules, customer discovery are disabled
  assert.equal(responseData.data.features.collection_merchandising.enabled, false);
  assert.equal(responseData.data.features.smart_merchandising_rules.enabled, false);
  assert.equal(responseData.data.features.customer_discovery.enabled, false);

  // On Free plan: basic search intelligence and discoverability are enabled
  assert.equal(responseData.data.features.search_intelligence.enabled, true);
  assert.equal(responseData.data.features.product_discoverability.enabled, true);
  assert.equal(responseData.data.features.zero_result_search.enabled, true);
});

test("getUsage controller returns structured period usage with limits", async () => {
  const mockReq = {
    shop: TEST_SHOP,
  };

  let responseData = null;
  const mockRes = {
    status: (code) => {
      assert.equal(code, 200);
      return mockRes;
    },
    json: (payload) => {
      responseData = payload;
      return mockRes;
    },
  };

  await getUsage(mockReq, mockRes);
  assert.ok(responseData?.success);
  assert.equal(responseData.data.shop, TEST_SHOP);
  assert.equal(responseData.data.plan, "free");
  assert.ok(responseData.data.usage?.metrics);
  assert.equal(responseData.data.usage.metrics.zeroResultSearchQueries.limit, 20);
});
