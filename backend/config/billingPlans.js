/**
 * ShopLens Billing & Plans Configuration
 * Source of truth for all plan tiers, pricing, intervals, features, and usage limits.
 */

export const BILLING_INTERVALS = {
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

export const SHOPIFY_INTERVALS = {
  [BILLING_INTERVALS.MONTHLY]: "EVERY_30_DAYS",
  [BILLING_INTERVALS.YEARLY]: "ANNUAL",
};

export const FEATURES = {
  SEARCH_INTELLIGENCE: "search_intelligence",
  SEARCH_INTELLIGENCE_TRENDS: "search_intelligence_trends",
  PRODUCT_DISCOVERABILITY: "product_discoverability",
  ZERO_RESULT_SEARCH: "zero_result_search",
  COLLECTION_MERCHANDISING: "collection_merchandising",
  SEARCH_INTENT_ANALYZER: "search_intent_analyzer",
  TRENDING_SEARCH: "trending_search",
  MERCHANDISING_RECOMMENDATIONS: "merchandising_recommendations",
  SMART_MERCHANDISING_RULES: "smart_merchandising_rules",
  MERCHANDISING_SIMULATOR: "merchandising_simulator",
  CUSTOMER_DISCOVERY: "customer_discovery",
  MISSED_SALES_OPPORTUNITIES: "missed_sales_opportunities",
};

export const LIMIT_KEYS = {
  SEARCH_INTELLIGENCE_PRODUCTS: "searchIntelligenceProducts",
  SEARCH_INTELLIGENCE_TRENDS: "searchIntelligenceTrends",
  PRODUCT_DISCOVERABILITY_PRODUCTS: "productDiscoverabilityProducts",
  ZERO_RESULT_SEARCH_QUERIES: "zeroResultSearchQueries",
};

export const BILLING_PLANS = {
  free: {
    id: "free",
    name: "Free",
    tier: 0,
    description: "Core search intelligence and discoverability analytics for growing stores.",
    pricing: {
      [BILLING_INTERVALS.MONTHLY]: {
        amount: 0,
        currencyCode: "USD",
        interval: SHOPIFY_INTERVALS[BILLING_INTERVALS.MONTHLY],
      },
      [BILLING_INTERVALS.YEARLY]: {
        amount: 0,
        currencyCode: "USD",
        interval: SHOPIFY_INTERVALS[BILLING_INTERVALS.YEARLY],
      },
    },
    limits: {
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS]: 20,
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS]: 20,
      [LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS]: 20,
      [LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES]: 20,
    },
    // Explicit TRUE/FALSE condition access map
    featureFlags: {
      [FEATURES.SEARCH_INTELLIGENCE]: true,
      [FEATURES.SEARCH_INTELLIGENCE_TRENDS]: true,
      [FEATURES.PRODUCT_DISCOVERABILITY]: true,
      [FEATURES.ZERO_RESULT_SEARCH]: true,
      [FEATURES.COLLECTION_MERCHANDISING]: false,
      [FEATURES.SEARCH_INTENT_ANALYZER]: false,
      [FEATURES.TRENDING_SEARCH]: false,
      [FEATURES.MERCHANDISING_RECOMMENDATIONS]: false,
      [FEATURES.SMART_MERCHANDISING_RULES]: false,
      [FEATURES.MERCHANDISING_SIMULATOR]: false,
      [FEATURES.CUSTOMER_DISCOVERY]: false,
      [FEATURES.MISSED_SALES_OPPORTUNITIES]: false,
    },
    features: [
      FEATURES.SEARCH_INTELLIGENCE,
      FEATURES.SEARCH_INTELLIGENCE_TRENDS,
      FEATURES.PRODUCT_DISCOVERABILITY,
      FEATURES.ZERO_RESULT_SEARCH,
    ],
    displayFeatures: [
      "Search Intelligence (Up to 20 products)",
      "Search Intelligence Trends (Up to 20 trends)",
      "Product Discoverability (Up to 20 products)",
      "Zero-Result Search (Up to 20 unique queries)",
    ],
  },

  pro: {
    id: "pro",
    name: "Pro",
    tier: 1,
    description: "Expanded limits and intelligence tools for scaling Shopify merchants.",
    pricing: {
      [BILLING_INTERVALS.MONTHLY]: {
        amount: 19,
        currencyCode: "USD",
        interval: SHOPIFY_INTERVALS[BILLING_INTERVALS.MONTHLY],
      },
      [BILLING_INTERVALS.YEARLY]: {
        amount: 190,
        currencyCode: "USD",
        interval: SHOPIFY_INTERVALS[BILLING_INTERVALS.YEARLY],
      },
    },
    limits: {
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS]: 50,
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS]: 50,
      [LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS]: 50,
      [LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES]: 50,
    },
    // Explicit TRUE/FALSE condition access map
    featureFlags: {
      [FEATURES.SEARCH_INTELLIGENCE]: true,
      [FEATURES.SEARCH_INTELLIGENCE_TRENDS]: true,
      [FEATURES.PRODUCT_DISCOVERABILITY]: true,
      [FEATURES.ZERO_RESULT_SEARCH]: true,
      [FEATURES.COLLECTION_MERCHANDISING]: true,
      [FEATURES.SEARCH_INTENT_ANALYZER]: true,
      [FEATURES.TRENDING_SEARCH]: true,
      [FEATURES.MERCHANDISING_RECOMMENDATIONS]: false,
      [FEATURES.SMART_MERCHANDISING_RULES]: false,
      [FEATURES.MERCHANDISING_SIMULATOR]: false,
      [FEATURES.CUSTOMER_DISCOVERY]: false,
      [FEATURES.MISSED_SALES_OPPORTUNITIES]: false,
    },
    features: [
      FEATURES.SEARCH_INTELLIGENCE,
      FEATURES.SEARCH_INTELLIGENCE_TRENDS,
      FEATURES.PRODUCT_DISCOVERABILITY,
      FEATURES.ZERO_RESULT_SEARCH,
      FEATURES.COLLECTION_MERCHANDISING,
      FEATURES.SEARCH_INTENT_ANALYZER,
      FEATURES.TRENDING_SEARCH,
    ],
    displayFeatures: [
      "Search Intelligence (Up to 50 products)",
      "Search Intelligence Trends (Up to 50 trends)",
      "Product Discoverability (Up to 50 products)",
      "Zero-Result Search (Up to 50 unique queries)",
      "Collection Merchandising",
      "Search Intent Analyzer",
      "Trending Search",
    ],
  },

  premium: {
    id: "premium",
    name: "Premium",
    tier: 2,
    description: "Full suite of automated merchandising, simulation, insights, and unlimited analytics.",
    pricing: {
      [BILLING_INTERVALS.MONTHLY]: {
        amount: 49,
        currencyCode: "USD",
        interval: SHOPIFY_INTERVALS[BILLING_INTERVALS.MONTHLY],
      },
      [BILLING_INTERVALS.YEARLY]: {
        amount: 490,
        currencyCode: "USD",
        interval: SHOPIFY_INTERVALS[BILLING_INTERVALS.YEARLY],
      },
    },
    limits: {
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS]: null, // Unlimited / More than 200
      [LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS]: null,   // Unlimited / More than 200
      [LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS]: null, // Unlimited / More than 200
      [LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES]: null,   // Unlimited / More than 200
    },
    // Explicit TRUE/FALSE condition access map
    featureFlags: {
      [FEATURES.SEARCH_INTELLIGENCE]: true,
      [FEATURES.SEARCH_INTELLIGENCE_TRENDS]: true,
      [FEATURES.PRODUCT_DISCOVERABILITY]: true,
      [FEATURES.ZERO_RESULT_SEARCH]: true,
      [FEATURES.COLLECTION_MERCHANDISING]: true,
      [FEATURES.SEARCH_INTENT_ANALYZER]: true,
      [FEATURES.TRENDING_SEARCH]: true,
      [FEATURES.MERCHANDISING_RECOMMENDATIONS]: true,
      [FEATURES.SMART_MERCHANDISING_RULES]: true,
      [FEATURES.MERCHANDISING_SIMULATOR]: true,
      [FEATURES.CUSTOMER_DISCOVERY]: true,
      [FEATURES.MISSED_SALES_OPPORTUNITIES]: true,
    },
    features: [
      FEATURES.SEARCH_INTELLIGENCE,
      FEATURES.SEARCH_INTELLIGENCE_TRENDS,
      FEATURES.PRODUCT_DISCOVERABILITY,
      FEATURES.ZERO_RESULT_SEARCH,
      FEATURES.COLLECTION_MERCHANDISING,
      FEATURES.SEARCH_INTENT_ANALYZER,
      FEATURES.TRENDING_SEARCH,
      FEATURES.MERCHANDISING_RECOMMENDATIONS,
      FEATURES.SMART_MERCHANDISING_RULES,
      FEATURES.MERCHANDISING_SIMULATOR,
      FEATURES.CUSTOMER_DISCOVERY,
      FEATURES.MISSED_SALES_OPPORTUNITIES,
    ],
    displayFeatures: [
      "Search Intelligence (more than 200 products)",
      "Search Intelligence Trends (more than 200 trends)",
      "Product Discoverability (more than 200 products)",
      "Zero-Result Search (more than 200 queries)",
      "Merchandising Recommendations",
      "Smart Merchandising Rules",
      "Collection Merchandising",
      "Merchandising Simulator",
      "Search Intent Analyzer",
      "Customer Discovery",
      "Trending Search",
      "Missed Sales Opportunities",
    ],
  },
};

/**
 * Returns the plan definition for a plan ID, defaulting to Free.
 */
export const getPlan = (planId) => {
  const normalizedId = String(planId || "").toLowerCase().trim();
  return BILLING_PLANS[normalizedId] || BILLING_PLANS.free;
};

/**
 * Checks whether a feature is permitted under the given plan ID using strict boolean comparison.
 * Returns true if permitted, false otherwise.
 */
export const isFeatureAllowed = (planId, featureKey) => {
  const plan = getPlan(planId);
  if (plan.featureFlags && Object.prototype.hasOwnProperty.call(plan.featureFlags, featureKey)) {
    return plan.featureFlags[featureKey] === true;
  }
  return plan.features.includes(featureKey);
};

/**
 * Returns the complete dictionary of feature boolean flags (TRUE/FALSE) for a given plan ID.
 */
export const getFeatureAccessMap = (planId) => {
  const plan = getPlan(planId);
  const result = {};
  for (const key of Object.values(FEATURES)) {
    result[key] = isFeatureAllowed(plan.id, key);
  }
  return result;
};

/**
 * Checks if a metric limit is unlimited (null).
 */
export const isLimitUnlimited = (planId, limitKey) => {
  const plan = getPlan(planId);
  return plan.limits[limitKey] === null;
};

/**
 * Returns numeric limit or null (unlimited) for a given plan and metric.
 */
export const getPlanLimit = (planId, limitKey) => {
  const plan = getPlan(planId);
  return Object.prototype.hasOwnProperty.call(plan.limits, limitKey)
    ? plan.limits[limitKey]
    : null;
};

/**
 * Returns the minimum plan ID required to access a specific feature.
 */
export const getMinimumPlanForFeature = (featureKey) => {
  if (BILLING_PLANS.free.featureFlags?.[featureKey] === true || BILLING_PLANS.free.features.includes(featureKey)) return "free";
  if (BILLING_PLANS.pro.featureFlags?.[featureKey] === true || BILLING_PLANS.pro.features.includes(featureKey)) return "pro";
  if (BILLING_PLANS.premium.featureFlags?.[featureKey] === true || BILLING_PLANS.premium.features.includes(featureKey)) return "premium";
  return "premium";
};

/**
 * Get pricing details for a plan and billing interval.
 */
export const getPricingDetails = (planId, interval = BILLING_INTERVALS.MONTHLY) => {
  const plan = getPlan(planId);
  const normalizedInterval = String(interval).toLowerCase() === BILLING_INTERVALS.YEARLY
    ? BILLING_INTERVALS.YEARLY
    : BILLING_INTERVALS.MONTHLY;

  return plan.pricing[normalizedInterval];
};

export default BILLING_PLANS;
