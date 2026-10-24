import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  BILLING_PLANS,
  BILLING_INTERVALS,
  SHOPIFY_INTERVALS,
  FEATURES,
  LIMIT_KEYS,
  getPlan,
  isFeatureAllowed,
  isLimitUnlimited,
  getPlanLimit,
  getMinimumPlanForFeature,
  getPricingDetails,
} from "../config/billingPlans.js";

import {
  validateSubscribeInput,
  validateCancelInput,
} from "../validators/billingValidator.js";

import {
  inferPlanFromShopifyData,
  inferIntervalFromShopifyData,
} from "../services/shopifyBillingService.js";

import { applyPlanLimit } from "../middleware/billingMiddleware.js";
import Subscription from "../models/Subscription.js";
import MonthlyUsage from "../models/MonthlyUsage.js";

// ==========================================
// 1. Central Plan Configuration Tests
// ==========================================
test("Billing configuration defines exactly 3 plans", () => {
  const planKeys = Object.keys(BILLING_PLANS);
  assert.equal(planKeys.length, 3);
  assert.deepEqual(planKeys.sort(), ["free", "premium", "pro"]);
});

test("Free plan pricing and limits match specifications", () => {
  const freePlan = BILLING_PLANS.free;
  assert.equal(freePlan.pricing.monthly.amount, 0);
  assert.equal(freePlan.pricing.yearly.amount, 0);
  assert.equal(freePlan.limits[LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS], 20);
  assert.equal(freePlan.limits[LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS], 20);
  assert.equal(freePlan.limits[LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS], 20);
  assert.equal(freePlan.limits[LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES], 20);

  assert.equal(isLimitUnlimited("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), false);
  assert.equal(getPlanLimit("free", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), 20);
});

test("Pro plan pricing, limits, and features match specifications", () => {
  const proPlan = BILLING_PLANS.pro;
  assert.equal(proPlan.pricing.monthly.amount, 19);
  assert.equal(proPlan.pricing.yearly.amount, 190);
  assert.equal(proPlan.limits[LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS], 50);
  assert.equal(proPlan.limits[LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS], 50);
  assert.equal(proPlan.limits[LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS], 50);
  assert.equal(proPlan.limits[LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES], 50);

  // Pro features
  assert.ok(isFeatureAllowed("pro", FEATURES.COLLECTION_MERCHANDISING));
  assert.ok(isFeatureAllowed("pro", FEATURES.SEARCH_INTENT_ANALYZER));
  assert.ok(isFeatureAllowed("pro", FEATURES.TRENDING_SEARCH));

  // Premium-only features should NOT be allowed on Pro
  assert.equal(isFeatureAllowed("pro", FEATURES.MERCHANDISING_RECOMMENDATIONS), false);
  assert.equal(isFeatureAllowed("pro", FEATURES.SMART_MERCHANDISING_RULES), false);
  assert.equal(isFeatureAllowed("pro", FEATURES.MERCHANDISING_SIMULATOR), false);
  assert.equal(isFeatureAllowed("pro", FEATURES.CUSTOMER_DISCOVERY), false);
});

test("Premium plan pricing, features, and explicit null unlimited limits match specifications", () => {
  const premiumPlan = BILLING_PLANS.premium;
  assert.equal(premiumPlan.pricing.monthly.amount, 49);
  assert.equal(premiumPlan.pricing.yearly.amount, 490);

  // Four limits explicitly defined as null (unlimited)
  assert.equal(premiumPlan.limits[LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS], null);
  assert.equal(premiumPlan.limits[LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS], null);
  assert.equal(premiumPlan.limits[LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS], null);
  assert.equal(premiumPlan.limits[LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES], null);

  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS), true);
  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS), true);
  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS), true);
  assert.equal(isLimitUnlimited("premium", LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES), true);

  // All features included in Premium
  assert.ok(isFeatureAllowed("premium", FEATURES.COLLECTION_MERCHANDISING));
  assert.ok(isFeatureAllowed("premium", FEATURES.SEARCH_INTENT_ANALYZER));
  assert.ok(isFeatureAllowed("premium", FEATURES.TRENDING_SEARCH));
  assert.ok(isFeatureAllowed("premium", FEATURES.MERCHANDISING_RECOMMENDATIONS));
  assert.ok(isFeatureAllowed("premium", FEATURES.SMART_MERCHANDISING_RULES));
  assert.ok(isFeatureAllowed("premium", FEATURES.MERCHANDISING_SIMULATOR));
  assert.ok(isFeatureAllowed("premium", FEATURES.CUSTOMER_DISCOVERY));
});

test("Minimum plan lookup identifies correct tier for restricted features", () => {
  assert.equal(getMinimumPlanForFeature(FEATURES.COLLECTION_MERCHANDISING), "pro");
  assert.equal(getMinimumPlanForFeature(FEATURES.SEARCH_INTENT_ANALYZER), "pro");
  assert.equal(getMinimumPlanForFeature(FEATURES.TRENDING_SEARCH), "pro");

  assert.equal(getMinimumPlanForFeature(FEATURES.MERCHANDISING_RECOMMENDATIONS), "premium");
  assert.equal(getMinimumPlanForFeature(FEATURES.SMART_MERCHANDISING_RULES), "premium");
  assert.equal(getMinimumPlanForFeature(FEATURES.MERCHANDISING_SIMULATOR), "premium");
  assert.equal(getMinimumPlanForFeature(FEATURES.CUSTOMER_DISCOVERY), "premium");
});

test("Shopify billing intervals map properly to GraphQL constants", () => {
  assert.equal(SHOPIFY_INTERVALS[BILLING_INTERVALS.MONTHLY], "EVERY_30_DAYS");
  assert.equal(SHOPIFY_INTERVALS[BILLING_INTERVALS.YEARLY], "ANNUAL");

  const monthlyDetails = getPricingDetails("pro", "monthly");
  assert.equal(monthlyDetails.amount, 19);
  assert.equal(monthlyDetails.interval, "EVERY_30_DAYS");

  const yearlyDetails = getPricingDetails("pro", "yearly");
  assert.equal(yearlyDetails.amount, 190);
  assert.equal(yearlyDetails.interval, "ANNUAL");
});

// ==========================================
// 2. Billing Validator Tests
// ==========================================
test("validateSubscribeInput enforces valid plan and interval", () => {
  // Missing plan
  const emptyRes = validateSubscribeInput({});
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.errors.some((e) => e.includes("Plan is required")));

  // Invalid plan
  const invalidPlanRes = validateSubscribeInput({ plan: "enterprise" });
  assert.equal(invalidPlanRes.valid, false);
  assert.ok(invalidPlanRes.errors.some((e) => e.includes("Invalid plan")));

  // Paid plan without interval
  const noIntervalRes = validateSubscribeInput({ plan: "pro" });
  assert.equal(noIntervalRes.valid, false);
  assert.ok(noIntervalRes.errors.some((e) => e.includes("interval is required")));

  // Paid plan with invalid interval
  const badIntervalRes = validateSubscribeInput({ plan: "pro", interval: "weekly" });
  assert.equal(badIntervalRes.valid, false);
  assert.ok(badIntervalRes.errors.some((e) => e.includes("Invalid interval")));

  // Valid Pro monthly
  const validProRes = validateSubscribeInput({ plan: "pro", interval: "monthly" });
  assert.equal(validProRes.valid, true);
  assert.equal(validProRes.plan, "pro");
  assert.equal(validProRes.interval, "monthly");

  // Valid Free
  const validFreeRes = validateSubscribeInput({ plan: "free" });
  assert.equal(validFreeRes.valid, true);
  assert.equal(validFreeRes.plan, "free");

  // Invalid URL
  const badUrlRes = validateSubscribeInput({ plan: "pro", interval: "monthly", returnUrl: "not-a-url" });
  assert.equal(badUrlRes.valid, false);
});

test("validateCancelInput handles default and custom values", () => {
  const defaultCancel = validateCancelInput();
  assert.equal(defaultCancel.valid, true);
  assert.equal(defaultCancel.prorate, true);

  const customCancel = validateCancelInput({ prorate: false, reason: "Too expensive" });
  assert.equal(customCancel.valid, true);
  assert.equal(customCancel.prorate, false);
  assert.equal(customCancel.reason, "Too expensive");
});

// ==========================================
// 3. Plan Limits & Truncation Middleware Tests
// ==========================================
test("applyPlanLimit enforces limit on Free plan with complete metadata", () => {
  const testData = Array.from({ length: 30 }, (_, i) => i + 1);
  const result = applyPlanLimit(testData, "free", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS);

  assert.equal(result.items.length, 20);
  assert.equal(result.total, 20);
  assert.equal(result.totalAvailable, 30);
  assert.equal(result.planLimit, 20);
  assert.equal(result.isLimitedByPlan, true);
  assert.equal(result.upgradeRequired, true);
});

test("applyPlanLimit enforces limit on Pro plan with complete metadata", () => {
  const testData = Array.from({ length: 60 }, (_, i) => i + 1);
  const result = applyPlanLimit(testData, "pro", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS);

  assert.equal(result.items.length, 50);
  assert.equal(result.total, 50);
  assert.equal(result.totalAvailable, 60);
  assert.equal(result.planLimit, 50);
  assert.equal(result.isLimitedByPlan, true);
});

test("applyPlanLimit does not truncate data for Premium plan (unlimited null)", () => {
  const testData = Array.from({ length: 100 }, (_, i) => i + 1);
  const result = applyPlanLimit(testData, "premium", LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS);

  assert.equal(result.items.length, 100);
  assert.equal(result.total, 100);
  assert.equal(result.totalAvailable, 100);
  assert.equal(result.planLimit, null);
  assert.equal(result.isLimitedByPlan, false);
  assert.equal(result.upgradeRequired, false);
});

// ==========================================
// 4. Shopify Plan Inference Helpers
// ==========================================
test("inferPlanFromShopifyData correctly parses subscription names and amounts", () => {
  assert.equal(inferPlanFromShopifyData("ShopLens Pro Plan (Monthly)", 19), "pro");
  assert.equal(inferPlanFromShopifyData("ShopLens Pro Plan (Yearly)", 190), "pro");
  assert.equal(inferPlanFromShopifyData("ShopLens Premium Plan (Monthly)", 49), "premium");
  assert.equal(inferPlanFromShopifyData("ShopLens Premium Plan (Yearly)", 490), "premium");
  assert.equal(inferPlanFromShopifyData("Something else", 0), "free");
});

test("inferIntervalFromShopifyData identifies intervals accurately", () => {
  assert.equal(inferIntervalFromShopifyData("ANNUAL", 190), "yearly");
  assert.equal(inferIntervalFromShopifyData("EVERY_30_DAYS", 19), "monthly");
  assert.equal(inferIntervalFromShopifyData("", 490), "yearly");
});

// ==========================================
// 5. MongoDB Models Schema Tests
// ==========================================
test("Subscription model uses tbl_subscriptions collection", () => {
  assert.equal(Subscription.collection.name, "tbl_subscriptions");
});

test("MonthlyUsage model uses tbl_monthly_usages collection and generates period info", () => {
  assert.equal(MonthlyUsage.collection.name, "tbl_monthly_usages");

  const testDate = new Date("2026-10-15T12:00:00Z");
  const periodInfo = MonthlyUsage.getPeriodInfo(testDate);
  assert.equal(periodInfo.period, "2026-10");
  assert.equal(periodInfo.periodStart.toISOString(), "2026-10-01T00:00:00.000Z");
});
