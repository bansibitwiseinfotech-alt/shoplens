import Product from "../models/Product.js";
import Collection from "../models/Collection.js";
import MerchandisingEvent from "../models/MerchandisingEvent.js";
import CustomerDiscoveryEvent from "../models/CustomerDiscoveryEvent.js";
import SearchEvent from "../models/searchEvent.model.js";

/**
 * Normalizes Shopify Collection IDs to match both GID and numeric strings.
 * e.g. "gid://shopify/Collection/296410251351" -> ["gid://shopify/Collection/296410251351", "296410251351"]
 */
export function getEquivalentCollectionIds(id) {
  if (!id || typeof id !== "string") return [];
  const trimmed = id.trim();
  const numericMatch = trimmed.match(/\d+$/);
  const numeric = numericMatch ? numericMatch[0] : null;
  const gid = numeric ? `gid://shopify/Collection/${numeric}` : trimmed;

  const ids = new Set([trimmed]);
  if (numeric) ids.add(numeric);
  if (gid) ids.add(gid);
  return Array.from(ids);
}

/**
 * Normalizes Shopify Product IDs to match both GID and numeric strings.
 * e.g. "gid://shopify/Product/7634929811543" -> ["gid://shopify/Product/7634929811543", "7634929811543"]
 */
export function getEquivalentProductIds(id) {
  if (!id || typeof id !== "string") return [];
  const trimmed = id.trim();
  const numericMatch = trimmed.match(/\d+$/);
  const numeric = numericMatch ? numericMatch[0] : null;
  const gid = numeric ? `gid://shopify/Product/${numeric}` : trimmed;

  const ids = new Set([trimmed]);
  if (numeric) ids.add(numeric);
  if (gid) ids.add(gid);
  return Array.from(ids);
}

/**
 * Normalizes shop domain.
 */
export function normalizeShop(shop) {
  return String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

/**
 * Retrieves synced products from MongoDB with search and pagination.
 */
export async function getSimulatorProducts({
  shop,
  query = "",
  page = 1,
  limit = 20,
}) {
  const normalizedShop = normalizeShop(shop);
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  const filter = { shop: normalizedShop };
  if (query && typeof query === "string" && query.trim()) {
    const regex = new RegExp(query.trim(), "i");
    filter.$or = [{ title: regex }, { handle: regex }, { vendor: regex }];
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select("shopifyProductId title handle vendor productType status variants images")
      .sort({ title: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const mapped = products.map((p) => {
    const firstVariant = p.variants?.[0];
    const totalInventory = (p.variants || []).reduce(
      (sum, v) => sum + (v.inventoryQuantity ?? 0),
      0
    );
    const imageUrl = p.images?.[0]?.url || null;

    return {
      id: p.shopifyProductId,
      title: p.title,
      handle: p.handle,
      vendor: p.vendor || null,
      productType: p.productType || null,
      status: p.status || "ACTIVE",
      price: firstVariant?.price != null ? Number(firstVariant.price) : null,
      inventory: totalInventory,
      imageUrl,
    };
  });

  return {
    products: mapped,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Aggregates actual historical events and calculates verified baseline metrics.
 * Sources:
 * - tbl_customer_discovery_events (product_viewed)
 * - tbl_search_events (product_view, click)
 * - tbl_merchandising_events (collection_view impressions, product_click)
 */
export async function getVerifiedBaseline({
  shop,
  startDate,
  endDate,
  productId = null,
}) {
  const normalizedShop = normalizeShop(shop);
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    const error = new Error("Invalid date range. Start date must not be after end date.");
    error.status = 400;
    throw error;
  }

  const productIds = productId ? getEquivalentProductIds(productId) : null;

  // 1. Query Direct Product Views from CustomerDiscoveryEvent and SearchEvent
  const custViewFilter = {
    shopDomain: normalizedShop,
    eventType: "product_viewed",
    occurredAt: { $gte: start, $lte: end },
  };
  if (productIds) {
    custViewFilter.productId = { $in: productIds };
  }

  const searchViewFilter = {
    shop: normalizedShop,
    $or: [
      { eventType: { $in: ["product_view", "view"] } },
      { eventName: "product_viewed" },
    ],
    occurredAt: { $gte: start, $lte: end },
  };
  if (productIds) {
    searchViewFilter.productId = { $in: productIds };
  }

  // 2. Query Collection Impressions (collection_view in MerchandisingEvent)
  let matchingCollectionIds = null;
  if (productIds) {
    const parentCollections = await Collection.find({
      shop: normalizedShop,
      productIds: { $in: productIds },
    })
      .select("shopifyCollectionId")
      .lean();

    const colIdSet = new Set();
    for (const c of parentCollections) {
      for (const cid of getEquivalentCollectionIds(c.shopifyCollectionId)) {
        colIdSet.add(cid);
      }
    }
    matchingCollectionIds = Array.from(colIdSet);
  }

  const colViewFilter = {
    shop: normalizedShop,
    eventType: "collection_view",
    occurredAt: { $gte: start, $lte: end },
  };
  if (productIds) {
    colViewFilter.collectionId = {
      $in: matchingCollectionIds.length > 0 ? matchingCollectionIds : ["__none__"],
    };
  }

  // 3. Query Product Clicks from MerchandisingEvent and SearchEvent
  const merchClickFilter = {
    shop: normalizedShop,
    eventType: "product_click",
    occurredAt: { $gte: start, $lte: end },
  };
  if (productIds) {
    merchClickFilter.productId = { $in: productIds };
  }

  const searchClickFilter = {
    shop: normalizedShop,
    eventType: "click",
    occurredAt: { $gte: start, $lte: end },
  };
  if (productIds) {
    searchClickFilter.productId = { $in: productIds };
  }

  const [custViewsCount, searchViewsCount, colViewsCount, merchClicksCount, searchClicksCount] =
    await Promise.all([
      CustomerDiscoveryEvent.countDocuments(custViewFilter),
      SearchEvent.countDocuments(searchViewFilter),
      MerchandisingEvent.countDocuments(colViewFilter),
      MerchandisingEvent.countDocuments(merchClickFilter),
      SearchEvent.countDocuments(searchClickFilter),
    ]);

  const totalViews = custViewsCount + searchViewsCount + colViewsCount;
  const totalClicks = merchClicksCount + searchClicksCount;

  // Data Quality Validation
  let clickThroughRate = null;
  let isValid = true;
  let warning = null;
  const notes = [];

  if (totalViews === 0) {
    clickThroughRate = null;
    isValid = false;
    warning = "Zero product views or collection impressions recorded in the selected period. Click-through rate cannot be calculated.";
    notes.push(warning);
  } else if (totalClicks > totalViews) {
    clickThroughRate = null;
    isValid = false;
    warning = `Data Quality Warning: Recorded clicks (${totalClicks}) exceed product views and impressions (${totalViews}). Click-through rate cannot exceed 100% in a valid interaction funnel. Clicks and views originate from incompatible event sources or views are untracked. Scenario calculation is disabled until valid comparable data is available.`;
    notes.push(warning);
  } else {
    // Valid: Views > 0 and Clicks <= Views
    clickThroughRate = Number(((totalClicks / totalViews) * 100).toFixed(2));
  }

  return {
    shop: normalizedShop,
    dateRange: { startDate: start, endDate: end },
    scope: productId ? "product" : "store_wide",
    productId: productId || null,
    dataSource: "Verified Shopify Store Events (ShopLens Analytics)",
    metrics: {
      views: totalViews,
      clicks: totalClicks,
      clickThroughRate,
      breakdown: {
        directViews: custViewsCount + searchViewsCount,
        collectionImpressions: colViewsCount,
        storefrontClicks: merchClicksCount,
        searchClicks: searchClicksCount,
      },
    },
    dataQuality: {
      isValid,
      warning,
      notes,
      viewsCount: totalViews,
      clicksCount: totalClicks,
      sources: [
        "tbl_customer_discovery_events & tbl_search_events (Direct Views)",
        "tbl_merchandising_events (Collection Impressions)",
        "tbl_merchandising_events & tbl_search_events (Product Clicks)",
      ],
      lastUpdatedAt: new Date(),
    },
  };
}

/**
 * Pure calculation function for simulating hypothetical outcomes.
 *
 * Formulas:
 * 1. Estimated Target Clicks = Math.round(Product Views × Target CTR / 100)
 * 2. Estimated Additional Clicks = Estimated Target Clicks − Actual Product Clicks
 */
export function calculateHypotheticalScenario({
  baseline,
  target,
  investigationType = "product_engagement",
}) {
  if (!baseline || typeof baseline !== "object") {
    throw new Error("Baseline metrics are required for simulation.");
  }
  if (!target || typeof target !== "object") {
    throw new Error("Simulation target is required.");
  }

  const views = Number(baseline.views);
  const clicks = Number(baseline.clicks);

  if (Number.isNaN(views) || views < 0 || Number.isNaN(clicks) || clicks < 0) {
    throw new Error("Baseline views and clicks must be non-negative numbers.");
  }

  if (views === 0) {
    throw new Error("Product views is 0. Scenario calculation requires a non-zero views baseline.");
  }

  if (clicks > views) {
    throw new Error(
      `Recorded clicks (${clicks}) exceed views (${views}). Cannot calculate scenario on incompatible baseline data.`
    );
  }

  const rawTargetRate = target.targetRate;
  const targetRate = Number(rawTargetRate);

  if (
    typeof rawTargetRate !== "number" &&
    (typeof rawTargetRate !== "string" || rawTargetRate.trim() === "")
  ) {
    throw new Error("Target CTR must be a valid number.");
  }

  if (typeof targetRate !== "number" || Number.isNaN(targetRate) || targetRate <= 0 || targetRate > 100) {
    throw new Error("Target CTR must be a number greater than 0% and at most 100%.");
  }

  const actualCTR = Number(((clicks / views) * 100).toFixed(2));

  // 1. Estimated Target Clicks = Product Views × Target CTR / 100
  const estimatedTargetClicks = Math.round((views * targetRate) / 100);

  // 2. Estimated Additional Clicks = Estimated Target Clicks − Actual Product Clicks
  const estimatedAdditionalClicks = estimatedTargetClicks - clicks;

  const percentagePointDifference = Number((targetRate - actualCTR).toFixed(2));

  const assumptions = [
    "Hypothetical Estimate — Not Guaranteed",
    `Estimated target clicks (${estimatedTargetClicks}) calculated as: Math.round(${views} views × ${targetRate}% target CTR / 100).`,
    `Estimated additional clicks (${estimatedAdditionalClicks >= 0 ? "+" : ""}${estimatedAdditionalClicks}) calculated as: ${estimatedTargetClicks} target clicks − ${clicks} actual clicks.`,
    "Storefront collections, product order, and live merchandising rules are NOT modified.",
  ];

  return {
    investigationType,
    targetMetric: "clickThroughRate",
    targetRate,
    targetValue: targetRate,
    estimatedTargetClicks,
    additionalClicks: estimatedAdditionalClicks,
    percentagePointDifference,
    assumptions,
    disclaimer: "Hypothetical Estimate — Not Guaranteed",
  };
}
