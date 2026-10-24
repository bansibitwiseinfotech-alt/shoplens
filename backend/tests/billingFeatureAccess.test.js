import test from "node:test";
import assert from "node:assert/strict";

import {
  BILLING_PLANS,
  FEATURES,
  LIMIT_KEYS,
  isFeatureAllowed,
  getFeatureAccessMap,
  getPlanLimit,
  isLimitUnlimited,
  getMinimumPlanForFeature,
} from "../config/billingPlans.js";

import { isTestBilling } from "../billing-config/billingMode.js";
import { planAccessService } from "../services/planAccessService.js";
import { requireFeature, applyPlanLimit } from "../middleware/billingMiddleware.js";
import { validateFeatureLimit, enforcePlanLimitOnItems } from "../validators/planLimitValidator.js";

// =========================================================================
// 1. Centralized Plan Configuration — TRUE/FALSE Feature Condition Matrix
// =========================================================================
test("Free Plan: verifies exact TRUE/FALSE condition for all features", () => {
  const freeAccess = getFeatureAccessMap("free");

  // Allowed features (TRUE)
  assert.equal(freeAccess[FEATURES.SEARCH_INTELLIGENCE], true);
  assert.equal(freeAccess[FEATURES.SEARCH_INTELLIGENCE_TRENDS], true);
  assert.equal(freeAccess[FEATURES.PRODUCT_DISCOVERABILITY], true);
  assert.equal(freeAccess[FEATURES.ZERO_RESULT_SEARCH], true);

  // Pro features blocked for Free (FALSE)
  assert.equal(freeAccess[FEATURES.COLLECTION_MERCHANDISING], false);
  assert.equal(freeAccess[FEATURES.SEARCH_INTENT_ANALYZER], false);
  assert.equal(freeAccess[FEATURES.TRENDING_SEARCH], false);

  // Premium features blocked for Free (FALSE)
  assert.equal(freeAccess[FEATURES.MERCHANDISING_RECOMMENDATIONS], false);
  assert.equal(freeAccess[FEATURES.SMART_MERCHANDISING_RULES], false);
  assert.equal(freeAccess[FEATURES.MERCHANDISING_SIMULATOR], false);
  assert.equal(freeAccess[FEATURES.CUSTOMER_DISCOVERY], false);
  assert.equal(freeAccess[FEATURES.MISSED_SALES_OPPORTUNITIES], false);

  // Direct isFeatureAllowed call checks
  assert.equal(isFeatureAllowed("free", FEATURES.SEARCH_INTELLIGENCE), true);
  assert.equal(isFeatureAllowed("free", FEATURES.COLLECTION_MERCHANDISING), false);
  assert.equal(isFeatureAllowed("free", FEATURES.MERCHANDISING_RECOMMENDATIONS), false);
});

test("Pro Plan: verifies exact TRUE/FALSE condition for all features", () => {
  const proAccess = getFeatureAccessMap("pro");

  // Core features (TRUE)
  assert.equal(proAccess[FEATURES.SEARCH_INTELLIGENCE], true);
  assert.equal(proAccess[FEATURES.SEARCH_INTELLIGENCE_TRENDS], true);
  assert.equal(proAccess[FEATURES.PRODUCT_DISCOVERABILITY], true);
  assert.equal(proAccess[FEATURES.ZERO_RESULT_SEARCH], true);

  // Pro features allowed (TRUE)
  assert.equal(proAccess[FEATURES.COLLECTION_MERCHANDISING], true);
  assert.equal(proAccess[FEATURES.SEARCH_INTENT_ANALYZER], true);
  assert.equal(proAccess[FEATURES.TRENDING_SEARCH], true);

  // Premium-only features blocked for Pro (FALSE)
  assert.equal(proAccess[FEATURES.MERCHANDISING_RECOMMENDATIONS], false);
  assert.equal(proAccess[FEATURES.SMART_MERCHANDISING_RULES], false);
  assert.equal(proAccess[FEATURES.MERCHANDISING_SIMULATOR], false);
  assert.equal(proAccess[FEATURES.CUSTOMER_DISCOVERY], false);
  assert.equal(proAccess[FEATURES.MISSED_SALES_OPPORTUNITIES], false);

  // Direct isFeatureAllowed call checks
  assert.equal(isFeatureAllowed("pro", FEATURES.COLLECTION_MERCHANDISING), true);
  assert.equal(isFeatureAllowed("pro", FEATURES.MERCHANDISING_RECOMMENDATIONS), false);
});

test("Premium Plan: verifies ALL features evaluate to TRUE", () => {
  const premiumAccess = getFeatureAccessMap("premium");

  for (const feature of Object.values(FEATURES)) {
    assert.equal(
      premiumAccess[feature],
      true,
      `Feature '${feature}' must evaluate to true on Premium plan`
    );
    assert.equal(
      isFeatureAllowed("premium", feature),
      true,
      `isFeatureAllowed('premium', '${feature}') must return true`
    );
  }
});

// =========================================================================
// 2. Numerical and Unlimited Metric Limits Verification
// =========================================================================
test("Free Plan metric limits enforce exactly 20 items", () => {
  assert.equal(getPlanLimit("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), 20);
  assert.equal(getPlanLimit("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS), 20);
  assert.equal(getPlanLimit("free", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS), 20);
  assert.equal(getPlanLimit("free", LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES), 20);

  assert.equal(isLimitUnlimited("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), false);
  assert.equal(isLimitUnlimited("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS), false);
  assert.equal(isLimitUnlimited("free", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS), false);
  assert.equal(isLimitUnlimited("free", LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES), false);
});

test("Pro Plan metric limits enforce exactly 50 items", () => {
  assert.equal(getPlanLimit("pro", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), 50);
  assert.equal(getPlanLimit("pro", LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS), 50);
  assert.equal(getPlanLimit("pro", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS), 50);
  assert.equal(getPlanLimit("pro", LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES), 50);

  assert.equal(isLimitUnlimited("pro", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), false);
  assert.equal(isLimitUnlimited("pro", LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS), false);
  assert.equal(isLimitUnlimited("pro", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS), false);
  assert.equal(isLimitUnlimited("pro", LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES), false);
});

test("Premium Plan metric limits evaluate to unlimited (null / >50)", () => {
  assert.equal(getPlanLimit("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), null);
  assert.equal(getPlanLimit("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS), null);
  assert.equal(getPlanLimit("premium", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS), null);
  assert.equal(getPlanLimit("premium", LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES), null);

  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), true);
  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS), true);
  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS), true);
  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES), true);
});

// =========================================================================
// 3. Feature Access Middleware Blocking & Permission Tests
// =========================================================================
test("requireFeature blocks Free user from Pro feature with HTTP 403 and UPGRADE_REQUIRED", async () => {
  const middleware = requireFeature(FEATURES.COLLECTION_MERCHANDISING);

  const req = {
    shop: "test-free-store.myshopify.com",
    currentPlan: "free",
    subscription: { status: "ACTIVE", isActive: () => true },
    planConfig: BILLING_PLANS.free,
  };

  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, "next() must not be called when feature is blocked");
  assert.equal(statusCode, 403, "Blocked feature must return HTTP 403");
  assert.equal(responseData.success, false);
  assert.equal(responseData.allowed, false);
  assert.equal(responseData.code, "UPGRADE_REQUIRED");
  assert.equal(responseData.currentPlan, "free");
  assert.equal(responseData.requiredPlan, "pro");
  assert.equal(responseData.upgradeUrl, "/app/billing");
});

test("requireFeature blocks Pro user from Premium feature with HTTP 403 and UPGRADE_REQUIRED", async () => {
  const middleware = requireFeature(FEATURES.MERCHANDISING_RECOMMENDATIONS);

  const req = {
    shop: "test-pro-store.myshopify.com",
    currentPlan: "pro",
    subscription: { status: "ACTIVE", isActive: () => true },
    planConfig: BILLING_PLANS.pro,
  };

  let statusCode = null;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, "next() must not be called when feature is blocked");
  assert.equal(statusCode, 403, "Blocked feature must return HTTP 403");
  assert.equal(responseData.allowed, false);
  assert.equal(responseData.currentPlan, "pro");
  assert.equal(responseData.requiredPlan, "premium");
});

test("requireFeature allows permitted features through to next()", async () => {
  const middleware = requireFeature(FEATURES.SEARCH_INTELLIGENCE);

  const req = {
    shop: "test-store.myshopify.com",
    currentPlan: "free",
    subscription: { status: "ACTIVE", isActive: () => true },
    planConfig: BILLING_PLANS.free,
  };

  let nextCalled = false;
  const res = {};
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, "next() must be called when feature is allowed");
});

// =========================================================================
// 4. Array Clamping & Limit Validation Tests
// =========================================================================
test("enforcePlanLimitOnItems clamps Free plan items strictly to 20", () => {
  const sampleItems = Array.from({ length: 50 }, (_, i) => ({ id: i, title: `Product ${i}` }));

  const result = enforcePlanLimitOnItems(sampleItems, "free", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS);

  assert.equal(result.items.length, 20);
  assert.equal(result.meta.total, 20);
  assert.equal(result.meta.totalAvailable, 50);
  assert.equal(result.meta.planLimit, 20);
  assert.equal(result.meta.isLimitedByPlan, true);
  assert.equal(result.meta.upgradeRequired, true);
});

test("enforcePlanLimitOnItems clamps Pro plan items strictly to 50", () => {
  const sampleItems = Array.from({ length: 80 }, (_, i) => ({ id: i, title: `Product ${i}` }));

  const result = enforcePlanLimitOnItems(sampleItems, "pro", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS);

  assert.equal(result.items.length, 50);
  assert.equal(result.meta.total, 50);
  assert.equal(result.meta.totalAvailable, 80);
  assert.equal(result.meta.planLimit, 50);
  assert.equal(result.meta.isLimitedByPlan, true);
  assert.equal(result.meta.upgradeRequired, true);
});

test("enforcePlanLimitOnItems allows all items on Premium plan without truncation", () => {
  const sampleItems = Array.from({ length: 120 }, (_, i) => ({ id: i, title: `Product ${i}` }));

  const result = enforcePlanLimitOnItems(sampleItems, "premium", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS);

  assert.equal(result.items.length, 120);
  assert.equal(result.meta.total, 120);
  assert.equal(result.meta.totalAvailable, 120);
  assert.equal(result.meta.planLimit, null);
  assert.equal(result.meta.isLimitedByPlan, false);
  assert.equal(result.meta.upgradeRequired, false);
});

test("validateFeatureLimit validates boundary conditions correctly", () => {
  // Free plan limit 20
  assert.equal(validateFeatureLimit("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS, 19).allowed, true);
  assert.equal(validateFeatureLimit("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS, 20).allowed, false);

  // Pro plan limit 50
  assert.equal(validateFeatureLimit("pro", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS, 49).allowed, true);
  assert.equal(validateFeatureLimit("pro", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS, 50).allowed, false);

  // Premium plan unlimited
  assert.equal(validateFeatureLimit("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS, 9999).allowed, true);
  assert.equal(validateFeatureLimit("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS, 9999).isUnlimited, true);
});

// =========================================================================
// 5. Standalone Billing Mode Configuration Verification
// =========================================================================
test("isTestBilling() returns true from backend/billing-config/billingMode.js", () => {
  assert.equal(isTestBilling(), true, "isTestBilling() must return true in test mode");
});
