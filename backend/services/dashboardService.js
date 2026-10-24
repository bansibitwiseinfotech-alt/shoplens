import SearchEvent from "../models/searchEvent.model.js";
import SearchIntent from "../models/SearchIntent.js";
import Product from "../models/Product.js";
import MerchandisingRecommendation from "../models/MerchandisingRecommendation.js";

import {
  getSearchSummary,
  getSearchTrends,
  getPopularQueries,
} from "./searchIntelligence.service.js";
import {
  getZeroResultSummary,
  getZeroResultSearches,
} from "./zeroResultSearch.service.js";
import { calculateProductDiscoverability } from "./productDiscoverabilityService.js";
import { getCollectionOverview } from "./collectionMerchandisingService.js";
import { getTrendingSearchList } from "./trendingSearchService.js";

const RECOMMENDATION_ROUTES = {
  "Zero-Result Search Detector": "/app/zero-result-searches",
  "Product Discoverability": "/app/product-discoverability",
  "Search Intelligence": "/app/search-intelligence",
  "Customer Discovery Journey": "/app/customer-discovery-journey",
  "Collection Merchandising Intelligence": "/app/collection-merchandising",
  "Trending Searches": "/app/trending-searches",
  "Missed Sales Opportunity Finder": "/app/missed-sales-opportunities",
};

const ALLOWED_RECOMMENDATION_PATHS = new Set(
  Object.values(RECOMMENDATION_ROUTES)
);

function calculateDelta(current, previous) {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;

  if (prev === 0) {
    return curr > 0 ? 100 : 0;
  }
  return Math.round(((curr - prev) / prev) * 100);
}

function formatCategoryLabel(raw) {
  if (!raw) return "General Products";
  const map = {
    footwear: "Footwear & Shoes",
    clothing: "Clothing & Apparel",
    accessories: "Accessories & Bags",
    electronics: "Electronics & Tech",
    beauty: "Beauty & Health",
    home: "Home & Living",
    sports: "Sports & Outdoors",
  };
  const key = String(raw).toLowerCase().trim();
  return map[key] || raw.charAt(0).toUpperCase() + raw.slice(1);
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getRecommendationLink(recommendation) {
  const fallback =
    RECOMMENDATION_ROUTES[recommendation.sourceModule] || "/app/recommendations";
  const sourcePath = recommendation.sourcePath;

  if (typeof sourcePath !== "string" || !sourcePath.startsWith("/app/")) {
    return fallback;
  }

  try {
    const url = new URL(sourcePath, "https://shoplens.local");
    if (
      url.origin !== "https://shoplens.local" ||
      !ALLOWED_RECOMMENDATION_PATHS.has(url.pathname)
    ) {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export async function getSearchIntentDistribution({ shop, from, to }) {
  const [intentRecords, queryCounts] = await Promise.all([
    SearchIntent.find({
      shop,
      category: { $nin: [null, ""] },
      searchQuery: { $nin: [null, ""] },
    })
      .select("searchQuery category")
      .lean(),
    SearchEvent.aggregate([
      {
        $match: {
          shop,
          eventType: "search",
          occurredAt: { $gte: from, $lte: to },
          normalizedQuery: { $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: "$normalizedQuery",
          searches: { $sum: 1 },
        },
      },
    ]),
  ]);

  const categoryByQuery = new Map(
    intentRecords.map((intent) => [
      normalizeSearchQuery(intent.searchQuery),
      intent.category,
    ])
  );
  const categoryCounts = new Map();

  for (const query of queryCounts) {
    const category = categoryByQuery.get(normalizeSearchQuery(query._id));
    if (!category) continue;

    const current = categoryCounts.get(category) || {
      count: 0,
      queryCount: 0,
    };
    current.count += Number(query.searches) || 0;
    current.queryCount += 1;
    categoryCounts.set(category, current);
  }

  const totalSearches = [...categoryCounts.values()].reduce(
    (total, item) => total + item.count,
    0
  );

  return [...categoryCounts.entries()]
    .map(([category, values]) => ({
      id: category,
      name: formatCategoryLabel(category),
      count: values.count,
      queryCount: values.queryCount,
      percentage:
        totalSearches > 0
          ? Math.round((values.count / totalSearches) * 100)
          : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getDashboardOverview({
  shop,
  accessToken,
  from,
  to,
  datePreset = "last30",
}) {
  const normalizedShop = String(shop || "").trim().toLowerCase();
  if (!normalizedShop) {
    throw new Error("Shop domain is required.");
  }

  const now = new Date();
  let endDate = to ? new Date(to) : new Date(now);
  let startDate = from
    ? new Date(from)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(endDate.getTime())) endDate = new Date(now);
  if (Number.isNaN(startDate.getTime())) {
    startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (endDate < startDate) {
    throw new Error("The dashboard end date must be on or after its start date.");
  }

  const durationMs = Math.max(
    endDate.getTime() - startDate.getTime() + 1,
    24 * 60 * 60 * 1000
  );
  const trendPeriodDays = Math.ceil(durationMs / (24 * 60 * 60 * 1000));
  const prevEndDate = new Date(startDate.getTime() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - durationMs + 1);

  const [
    currentSummary,
    previousSummary,
    trends,
    popularQueries,
    zeroSummary,
    previousZeroSummary,
    zeroSearches,
    discoverabilityProducts,
    intentCategories,
    collectionOverview,
    recommendations,
    trendingSearches,
    clickedProductCounts,
  ] = await Promise.all([
    getSearchSummary({ shop: normalizedShop, from: startDate, to: endDate }),
    getSearchSummary({
      shop: normalizedShop,
      from: prevStartDate,
      to: prevEndDate,
    }),
    getSearchTrends({ shop: normalizedShop, from: startDate, to: endDate }),
    getPopularQueries({
      shop: normalizedShop,
      from: startDate,
      to: endDate,
      limit: 10,
    }),
    getZeroResultSummary({
      shop: normalizedShop,
      from: startDate,
      to: endDate,
    }),
    getZeroResultSummary({
      shop: normalizedShop,
      from: prevStartDate,
      to: prevEndDate,
    }),
    getZeroResultSearches({
      shop: normalizedShop,
      from: startDate,
      to: endDate,
      limit: 5,
    }),
    calculateProductDiscoverability({
      shop: normalizedShop,
      accessToken,
      from: startDate,
      to: endDate,
    }),
    getSearchIntentDistribution({
      shop: normalizedShop,
      from: startDate,
      to: endDate,
    }),
    getCollectionOverview({
      shop: normalizedShop,
      startDate,
      endDate,
    }),
    MerchandisingRecommendation.find({
      shop: normalizedShop,
      status: { $in: ["PENDING", "REVIEWED"] },
    })
      .sort({ priorityScore: -1, updatedAt: -1 })
      .limit(3)
      .lean(),
    getTrendingSearchList({
      shop: normalizedShop,
      days: trendPeriodDays,
      limit: 5,
    }),
    SearchEvent.aggregate([
      {
        $match: {
          shop: normalizedShop,
          eventType: "click",
          occurredAt: { $gte: startDate, $lte: endDate },
          productId: { $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: "$productId",
          clicks: { $sum: 1 },
        },
      },
      { $sort: { clicks: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const totalSearches = Number(currentSummary.totalSearches) || 0;
  const uniqueQueries = Number(currentSummary.uniqueQueries) || 0;
  const clicks = Number(currentSummary.totalClicks) || 0;
  const conversions = Number(currentSummary.purchasesFromSearch) || 0;
  const periodLabels = {
    last7: "7 days",
    last30: "30 days",
    last90: "90 days",
    last365: "12 months",
  };
  const comparisonPeriod = periodLabels[datePreset] || "selected period";

  const dateMap = new Map();
  const currentDay = new Date(startDate);
  currentDay.setUTCHours(0, 0, 0, 0);
  const endLimit = new Date(endDate);
  endLimit.setUTCHours(23, 59, 59, 999);

  while (currentDay <= endLimit) {
    const day = currentDay.toISOString().slice(0, 10);
    dateMap.set(day, {
      date: day,
      searches: 0,
      clicks: 0,
      conversions: 0,
    });
    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }

  for (const trend of trends) {
    const point = dateMap.get(trend.date);
    if (!point) continue;
    point.searches = Number(trend.searches) || 0;
    point.clicks = Number(trend.clicks) || 0;
    point.conversions = Number(
      trend.attributedPurchases || trend.purchases || 0
    );
  }

  const productIds = [
    ...new Set(
      popularQueries
        .flatMap((query) => query.returnedProductIds || [])
        .filter(Boolean)
        .map(String)
        .concat(clickedProductCounts.map((item) => String(item._id)))
    ),
  ];
  const productLookupIds = [
    ...new Set([
      ...productIds,
      ...productIds
        .map((id) => {
          const numericId = id.replace(/\D/g, "");
          return numericId ? `gid://shopify/Product/${numericId}` : null;
        })
        .filter(Boolean),
    ]),
  ];
  const products = productLookupIds.length
    ? await Product.find({
        shop: normalizedShop,
        shopifyProductId: { $in: productLookupIds },
      })
        .select("shopifyProductId title handle")
        .lean()
    : [];
  const productById = new Map(
    products.map((product) => [
      String(product.shopifyProductId).replace(/\D/g, ""),
      product,
    ])
  );

  const topSearchQueries = popularQueries.slice(0, 5).map((query) => {
    const matchedProduct = (query.returnedProductIds || [])
      .map((id) => productById.get(String(id).replace(/\D/g, "")))
      .find(Boolean);

    return {
      query: query.query,
      displayQuery: query.displayQuery || query.query,
      productTitle: matchedProduct?.title || null,
      productHandle: matchedProduct?.handle || null,
      searches: Number(query.searches) || 0,
      clicks: Number(query.clicks) || 0,
      conversions: Number(query.purchases) || 0,
      conversionRate: Number(query.conversionRate) || 0,
    };
  });

  const zeroResultCount = Number(zeroSummary.zeroResultSearches) || 0;
  const hardToFindProducts = discoverabilityProducts
    .filter((product) => Number(product.discoverabilityScore) < 60)
    .sort(
      (a, b) =>
        Number(a.discoverabilityScore) - Number(b.discoverabilityScore)
    )
    .slice(0, 5)
    .map((product) => ({
      productId: product.productId,
      title: product.productTitle,
      score: Number(product.discoverabilityScore) || 0,
      searches: Number(product.searchVisibility) || 0,
      clicks: Number(product.clicks) || 0,
    }));

  const easyToFind = discoverabilityProducts.filter(
    (product) => product.discoverabilityScore >= 80
  ).length;
  const needsImprovement = discoverabilityProducts.filter(
    (product) =>
      product.discoverabilityScore >= 60 &&
      product.discoverabilityScore < 80
  ).length;
  const hardToFind = discoverabilityProducts.filter(
    (product) => product.discoverabilityScore < 60
  ).length;
  const averageScore = discoverabilityProducts.length
    ? Math.round(
        discoverabilityProducts.reduce(
          (sum, product) =>
            sum + (Number(product.discoverabilityScore) || 0),
          0
        ) / discoverabilityProducts.length
      )
    : 0;

  const quickInsights = [];
  const topQuery = topSearchQueries[0];
  if (topQuery) {
    quickInsights.push({
      title: `High demand for ${topQuery.displayQuery}`,
      detail: `${topQuery.searches.toLocaleString()} searches and ${topQuery.conversionRate}% conversion rate`,
      link: "/app/search-intelligence",
    });
  }

  if (totalSearches > 0) {
    quickInsights.push(
      zeroResultCount > 0
        ? {
            title: `${zeroResultCount.toLocaleString()} searches returned no results`,
            detail: "Review these queries for catalog or search gaps.",
            link: "/app/zero-result-search",
          }
        : {
            title: "No zero-result searches in this period",
            detail: "Every recorded search returned at least one result.",
            link: "/app/zero-result-search",
          }
    );
  }

  if (intentCategories.length > 0) {
    quickInsights.push({
      title: `Top search intent: ${intentCategories[0].name}`,
      detail: `${intentCategories[0].percentage}% of categorized searches in this period`,
      link: "/app/search-intent",
    });
  }

  const underperformingCollections =
    Number(collectionOverview.summary?.underperformingCollections) || 0;
  if (underperformingCollections > 0) {
    quickInsights.push({
      title: "Collections need merchandising attention",
      detail: `${underperformingCollections} collections are underperforming.`,
      link: "/app/collection-merchandising",
    });
  }

  const formattedRecommendations = recommendations.map(
    (recommendation, index) => ({
      id: String(recommendation._id),
      order: index + 1,
      title: recommendation.title,
      problemDetected:
        recommendation.problemDetected || recommendation.description,
      suggestedAction: recommendation.suggestedAction,
      priority: recommendation.priority || "MEDIUM",
      sourceModule: recommendation.sourceModule || "Store Intelligence",
      link: getRecommendationLink(recommendation),
    })
  );

  const totalIntentQueries = intentCategories.reduce(
    (total, category) => total + category.queryCount,
    0
  );

  return {
    shop: normalizedShop,
    period: {
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      datePreset,
    },
    kpis: {
      totalSearches: {
        value: totalSearches,
        delta: calculateDelta(
          totalSearches,
          Number(previousSummary.totalSearches) || 0
        ),
        periodLabel: `vs. previous ${comparisonPeriod}`,
      },
      uniqueQueries: {
        value: uniqueQueries,
        delta: calculateDelta(
          uniqueQueries,
          Number(previousSummary.uniqueQueries) || 0
        ),
        periodLabel: `vs. previous ${comparisonPeriod}`,
      },
      clicks: {
        value: clicks,
        delta: calculateDelta(
          clicks,
          Number(previousSummary.totalClicks) || 0
        ),
        periodLabel: `vs. previous ${comparisonPeriod}`,
      },
      conversions: {
        value: conversions,
        delta: calculateDelta(
          conversions,
          Number(previousSummary.purchasesFromSearch) || 0
        ),
        periodLabel: `vs. previous ${comparisonPeriod}`,
      },
    },
    trend: {
      points: [...dateMap.values()],
      totalSearches,
      totalClicks: clicks,
    },
    topSearchQueries,
    topClickedProducts: clickedProductCounts.map((item) => {
      const productId = String(item._id);
      const product = productById.get(productId.replace(/\D/g, ""));

      return {
        productId,
        title: product?.title || `Product #${productId.replace(/\D/g, "")}`,
        clicks: Number(item.clicks) || 0,
      };
    }),
    trendingSearches: {
      periodDays: trendPeriodDays,
      trends: trendingSearches,
    },
    searchIntent: {
      totalQueries: totalIntentQueries,
      categories: intentCategories,
    },
    zeroResults: {
      total: zeroResultCount,
      uniqueQueries: Number(zeroSummary.uniqueFailedQueries) || 0,
      delta: calculateDelta(
        zeroResultCount,
        Number(previousZeroSummary.zeroResultSearches) || 0
      ),
      rate: Number(zeroSummary.zeroResultRate) || 0,
      topFailedQueries: zeroSearches.slice(0, 5).map((item) => ({
        query: item.query,
        searches: Number(item.searches) || 0,
        classification: item.classification || "one_off",
      })),
    },
    discoverability: {
      averageScore,
      totalProducts: discoverabilityProducts.length,
      easyToFind,
      needsImprovement,
      hardToFind,
      products: hardToFindProducts,
    },
    quickInsights,
    recommendations: formattedRecommendations,
  };
}

export default {
  getDashboardOverview,
};
