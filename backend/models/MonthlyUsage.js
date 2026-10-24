import mongoose from "mongoose";
import { LIMIT_KEYS, getPlanLimit } from "../config/billingPlans.js";

const usageCountersSchema = new mongoose.Schema(
  {
    [LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS]: {
      type: Number,
      default: 0,
      min: 0,
    },
    [LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS]: {
      type: Number,
      default: 0,
      min: 0,
    },
    [LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS]: {
      type: Number,
      default: 0,
      min: 0,
    },
    [LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES]: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const monthlyUsageSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: [true, "Shop domain is required"],
      lowercase: true,
      trim: true,
      index: true,
    },

    period: {
      type: String,
      required: [true, "Usage period identifier is required"],
      index: true,
    },

    periodStart: {
      type: Date,
      required: true,
    },

    periodEnd: {
      type: Date,
      required: true,
    },

    plan: {
      type: String,
      required: true,
      enum: ["free", "pro", "premium"],
      default: "free",
    },

    shopifySubscriptionId: {
      type: String,
      default: null,
    },

    counters: {
      type: usageCountersSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: "tbl_monthly_usages",
  }
);

// Compound unique index ensuring one usage record per shop per period
monthlyUsageSchema.index(
  { shop: 1, period: 1 },
  { unique: true }
);

/**
 * Computes standard monthly period key and date range.
 */
monthlyUsageSchema.statics.getPeriodInfo = function (date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const period = `${year}-${month}`;

  const periodStart = new Date(Date.UTC(year, date.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  return { period, periodStart, periodEnd };
};

/**
 * Get or create current monthly usage document for shop.
 */
monthlyUsageSchema.statics.getCurrentUsage = async function (shop, planId = "free", subscriptionId = null) {
  if (!shop) throw new Error("Shop domain is required.");
  const normalizedShop = shop.toLowerCase().trim();
  const { period, periodStart, periodEnd } = this.getPeriodInfo();

  let usage = await this.findOne({ shop: normalizedShop, period });
  if (!usage) {
    usage = await this.findOneAndUpdate(
      { shop: normalizedShop, period },
      {
        $setOnInsert: {
          shop: normalizedShop,
          period,
          periodStart,
          periodEnd,
          plan: planId,
          shopifySubscriptionId: subscriptionId,
          counters: {
            [LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS]: 0,
            [LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS]: 0,
            [LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS]: 0,
            [LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES]: 0,
          },
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
  }

  return usage;
};

/**
 * Atomically increment a usage counter for the current period.
 */
monthlyUsageSchema.statics.incrementCounter = async function (shop, metricKey, amount = 1) {
  if (!shop || !metricKey) return null;
  const normalizedShop = shop.toLowerCase().trim();
  const { period, periodStart, periodEnd } = this.getPeriodInfo();

  return this.findOneAndUpdate(
    { shop: normalizedShop, period },
    {
      $setOnInsert: {
        shop: normalizedShop,
        period,
        periodStart,
        periodEnd,
      },
      $inc: {
        [`counters.${metricKey}`]: amount,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
};

/**
 * Calculate live usage from actual ShopLens database records for current period.
 */
monthlyUsageSchema.statics.calculateLiveUsage = async function (shop, planId = "free") {
  const normalizedShop = shop.toLowerCase().trim();
  const { period, periodStart, periodEnd } = this.getPeriodInfo();

  // Query actual ShopLens collections
  const db = mongoose.connection.db;

  let searchEventsCount = 0;
  let zeroResultQueriesCount = 0;
  let productDiscoverabilityCount = 0;
  let searchTrendsCount = 0;

  try {
    if (db) {
      // 1. Zero-result search unique queries count
      const zeroResultEventsColl = db.collection("tbl_search_events");
      const zeroResultAgg = await zeroResultEventsColl.aggregate([
        {
          $match: {
            shop: normalizedShop,
            resultCount: 0,
            occurredAt: { $gte: periodStart, $lte: periodEnd },
          },
        },
        {
          $group: {
            _id: "$normalizedQuery",
          },
        },
        { $count: "uniqueCount" },
      ]).toArray();

      zeroResultQueriesCount = zeroResultAgg[0]?.uniqueCount || 0;

      // 2. Search Intelligence unique products interacted with
      const prodAgg = await zeroResultEventsColl.aggregate([
        {
          $match: {
            shop: normalizedShop,
            productId: { $ne: null, $exists: true },
            occurredAt: { $gte: periodStart, $lte: periodEnd },
          },
        },
        { $group: { _id: "$productId" } },
        { $count: "uniqueProducts" },
      ]).toArray();

      searchEventsCount = prodAgg[0]?.uniqueProducts || 0;

      // 3. Search Intelligence Trends (unique popular queries in period)
      const trendsAgg = await zeroResultEventsColl.aggregate([
        {
          $match: {
            shop: normalizedShop,
            occurredAt: { $gte: periodStart, $lte: periodEnd },
          },
        },
        { $group: { _id: "$normalizedQuery" } },
        { $count: "uniqueTrends" },
      ]).toArray();

      searchTrendsCount = trendsAgg[0]?.uniqueTrends || 0;

      // 4. Product Discoverability products evaluated
      const discoverabilityColl = db.collection("tbl_product_discoverability");
      productDiscoverabilityCount = await discoverabilityColl.countDocuments({
        shop: normalizedShop,
      });
    }
  } catch (err) {
    console.warn("[MonthlyUsage] Live usage calculation note:", err.message);
  }

  // Also check stored usage counters in tbl_monthly_usages
  const storedUsage = await this.findOne({ shop: normalizedShop, period });
  const storedCounters = storedUsage?.counters || {};

  // Take the maximum of live DB count and tracked counter
  const finalCounters = {
    [LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS]: Math.max(searchEventsCount, storedCounters[LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS] || 0),
    [LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS]: Math.max(searchTrendsCount, storedCounters[LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS] || 0),
    [LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS]: Math.max(productDiscoverabilityCount, storedCounters[LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS] || 0),
    [LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES]: Math.max(zeroResultQueriesCount, storedCounters[LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES] || 0),
  };

  // Sync to database
  await this.findOneAndUpdate(
    { shop: normalizedShop, period },
    {
      $set: {
        plan: planId,
        counters: finalCounters,
        periodStart,
        periodEnd,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  // Return usage with limits
  return {
    period,
    periodStart,
    periodEnd,
    plan: planId,
    metrics: {
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS]: {
        label: "Search Intelligence Products",
        used: finalCounters[LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS],
        limit: getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS),
        isUnlimited: getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS) === null,
        exceeded: getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS) !== null &&
          finalCounters[LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS] >= getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS),
      },
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS]: {
        label: "Search Intelligence Trends",
        used: finalCounters[LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS],
        limit: getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS),
        isUnlimited: getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS) === null,
        exceeded: getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS) !== null &&
          finalCounters[LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS] >= getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS),
      },
      [LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS]: {
        label: "Product Discoverability Products",
        used: finalCounters[LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS],
        limit: getPlanLimit(planId, LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS),
        isUnlimited: getPlanLimit(planId, LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS) === null,
        exceeded: getPlanLimit(planId, LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS) !== null &&
          finalCounters[LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS] >= getPlanLimit(planId, LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS),
      },
      [LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES]: {
        label: "Zero-Result Search Queries",
        used: finalCounters[LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES],
        limit: getPlanLimit(planId, LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES),
        isUnlimited: getPlanLimit(planId, LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES) === null,
        exceeded: getPlanLimit(planId, LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES) !== null &&
          finalCounters[LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES] >= getPlanLimit(planId, LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES),
      },
    },
  };
};

const MonthlyUsage =
  mongoose.models.MonthlyUsage ||
  mongoose.model("MonthlyUsage", monthlyUsageSchema);

export default MonthlyUsage;
