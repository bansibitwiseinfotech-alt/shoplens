import mongoose from "mongoose";
import crypto from "node:crypto";

import MerchandisingRecommendation from "../models/MerchandisingRecommendation.js";
import {
    calculateRecommendationPriority,
    calculateConfidence,
} from "./recommendationPriorityService.js";

// Import existing verified services
import { getZeroResultSearches } from "./zeroResultSearch.service.js";
import { calculateProductDiscoverability } from "./productDiscoverabilityService.js";
import customerDiscoveryService from "./customerDiscoveryService.js";
import { getPositioningProblems } from "./collectionMerchandisingService.js";
import { calculateTrendingSearches } from "./trendingSearchService.js";

/**
 * In-memory concurrency locks to prevent duplicate concurrent refresh executions per shop.
 */
const activeRefreshes = new Map();

export function normalizeShop(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
}

export function makeFingerprint(shop, type, sourceKey) {
    return crypto
        .createHash("sha256")
        .update(`${shop}:${type}:${String(sourceKey || "").toLowerCase().trim()}`)
        .digest("hex");
}

function escapeRegex(text) {
    return String(text || "").replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

function createRecommendation({
    shop,
    type,
    sourceKey,
    title,
    description,
    problemDetected,
    whyItMatters,
    suggestedAction,
    sourceModule,
    sourceRecordId = null,
    sourcePath = "",
    actionType = "",
    actionDestination = "",
    targetQuery = "",
    proposedChanges = null,
    impact = 50,
    evidenceStrength = 60,
    actionability = 70,
    effort = 30,
    confidenceData = {},
    evidence = [],
    affectedProducts = [],
    affectedCollections = [],
}) {
    const priorityResult = calculateRecommendationPriority({
        impact,
        evidenceStrength,
        actionability,
        effort,
    });

    const confidenceResult = calculateConfidence({
        sampleSize: confidenceData.sampleSize ?? 1,
        sourceVerified: confidenceData.sourceVerified ?? true,
        recencyDays: confidenceData.recencyDays ?? 30,
        dataCompleteness: confidenceData.dataCompleteness ?? true,
    });

    const now = new Date();

    return {
        shop,
        fingerprint: makeFingerprint(shop, type, sourceKey),
        type,
        title: title.trim(),
        description: description.trim(),
        problemDetected: (problemDetected || description).trim(),
        whyItMatters: (whyItMatters || "").trim(),
        suggestedAction: suggestedAction.trim(),
        sourceModule,
        sourceRecordId,
        sourcePath,
        actionType,
        actionDestination: actionDestination || sourcePath,
        targetQuery,
        proposedChanges,
        priority: priorityResult.priority,
        priorityScore: priorityResult.score,
        priorityReason: priorityResult.reason,
        priorityBreakdown: priorityResult.breakdown,
        confidence: confidenceResult.confidence,
        confidenceLevel: confidenceResult.level,
        confidenceReason: confidenceResult.reason,
        evidence,
        affectedProducts,
        affectedCollections,
        status: "PENDING",
        executionState: "NOT_STARTED",
        lastDetectedAt: now,
        lastEvidenceAt: now,
    };
}

/**
 * Adapter A: Search Demand with Zero Results
 */
export async function buildZeroResultRecommendations(shop) {
    const recommendations = [];
    if (mongoose.connection.readyState !== 1) return recommendations;
    try {
        const searches = await getZeroResultSearches({
            shop,
            limit: 50,
            sort: "opportunity",
        });

        if (!Array.isArray(searches)) return recommendations;

        for (const item of searches) {
            if (!item.query || item.searches < 2) continue;

            const queryText = item.query.trim();
            const impact = Math.min(100, Math.round(item.opportunityScore || item.searches * 8));
            const evidenceStrength = item.activeDays >= 2 ? 85 : 70;
            const actionability = item.potentialProducts > 0 ? 90 : 75;
            const effort = item.potentialProducts > 0 ? 30 : 50;

            let affectedProducts = [];
            try {
                const words = queryText.split(" ").filter((w) => w.length >= 2).slice(0, 3);
                const searchRegex = words.length ? words.map(escapeRegex).join("|") : escapeRegex(queryText);
                const rawMatches = await mongoose.connection.collection("tbl_products").find({
                    shop,
                    $or: [
                        { title: { $regex: searchRegex, $options: "i" } },
                        { handle: { $regex: searchRegex, $options: "i" } },
                    ],
                }).limit(3).toArray();
                affectedProducts = rawMatches.map((p) => ({
                    productId: p.shopifyProductId || String(p._id),
                    title: p.title || "",
                    handle: p.handle || "",
                }));
            } catch (error) {
                console.warn("[RecommendationEngine] Zero-result product lookup failed:", error.message);
            }

            const proposedChanges = {
                action: "ADD_SEARCH_TAG",
                tag: queryText,
                targetQuery: queryText,
                affectedProducts,
                description: `Add search tag "${queryText}" to matching catalog products so customers find them.`,
            };

            recommendations.push(
                createRecommendation({
                    shop,
                    type: "ZERO_RESULT",
                    sourceKey: queryText,
                    title: `Review zero-result searches for "${queryText}"`,
                    description: `Shoppers searched for "${queryText}" ${item.searches} time(s) but found no matching products.`,
                    problemDetected: `Store search returned 0 matching products for "${queryText}" across ${item.searches} search(es) by ${item.uniqueCustomers || 1} shopper(s).`,
                    whyItMatters: "Zero-result searches immediately degrade shopper trust and lead to abandoned customer visits without conversion.",
                    suggestedAction: item.potentialProducts > 0
                        ? `Add "${queryText}" as a searchable tag or synonym to the ${item.potentialProducts} related catalog product(s).`
                        : `Evaluate customer demand for "${queryText}" and consider adding matching items or search synonyms.`,
                    sourceModule: "Zero-Result Search Detector",
                    sourcePath: `/app/zero-result-searches?query=${encodeURIComponent(queryText)}`,
                    actionType: "ADD_SEARCH_TAG",
                    actionDestination: `/app/zero-result-searches?query=${encodeURIComponent(queryText)}`,
                    targetQuery: queryText,
                    proposedChanges,
                    impact,
                    evidenceStrength,
                    actionability,
                    effort,
                    confidenceData: {
                        sampleSize: item.searches,
                        sourceVerified: true,
                        recencyDays: 14,
                        dataCompleteness: true,
                    },
                    affectedProducts,
                    evidence: [
                        {
                            metric: "Zero-Result Search Volume",
                            value: item.searches,
                            explanation: "Actual recorded zero-result searches in store search events.",
                        },
                        {
                            metric: "Unique Shoppers Affected",
                            value: item.uniqueCustomers || 1,
                            explanation: "Distinct customer or client IDs who submitted this query.",
                        },
                        {
                            metric: "Active Days Observed",
                            value: item.activeDays || 1,
                            explanation: "Distinct calendar dates on which this search occurred.",
                        },
                    ],
                })
            );
        }
    } catch (err) {
        console.warn("[RecommendationEngine] Zero-result adapter warning:", err.message);
    }
    return recommendations;
}

/**
 * Adapter B: Poor Product Discoverability
 */
export async function buildDiscoverabilityRecommendations(shop) {
    const recommendations = [];
    if (mongoose.connection.readyState !== 1) return recommendations;
    try {
        const products = await calculateProductDiscoverability({ shop });
        if (!Array.isArray(products)) return recommendations;

        // Flag products with low discoverability score (< 45) that have active catalog titles
        const lowProducts = products
            .filter((p) => Number(p.discoverabilityScore) < 45 && p.productTitle)
            .sort((a, b) => Number(a.discoverabilityScore) - Number(b.discoverabilityScore))
            .slice(0, 15);

        for (const item of lowProducts) {
            const score = Number(item.discoverabilityScore) || 0;
            const isZeroCollection = Number(item.collectionCount || 0) === 0;
            const impact = Math.round(100 - score);
            const evidenceStrength = 80;
            const actionability = 85;
            const effort = isZeroCollection ? 25 : 40;

            const actionType = isZeroCollection ? "ADD_TO_COLLECTION" : "ADD_SEARCH_TAG";
            const suggestedTag = String(item.productTitle || "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .split("-")
                .filter(Boolean)[0] || "featured";

            const proposedChanges = isZeroCollection
                ? {
                    action: "ADD_TO_COLLECTION",
                    actionType: "ADD_TO_COLLECTION",
                    productId: item.productId,
                    productTitle: item.productTitle,
                    currentScore: score,
                    collectionCount: 0,
                    description: `Add "${item.productTitle}" to an active storefront collection.`,
                }
                : {
                    action: "ADD_SEARCH_TAG",
                    actionType: "ADD_SEARCH_TAG",
                    productId: item.productId,
                    productTitle: item.productTitle,
                    currentScore: score,
                    collectionCount: item.collectionCount,
                    tag: suggestedTag,
                    description: `Add search tag "${suggestedTag}" to "${item.productTitle}".`,
                };

            const title = isZeroCollection
                ? `"${item.productTitle}" is hard to find`
                : `Improve search visibility for "${item.productTitle}"`;

            const description = isZeroCollection
                ? `This product is not included in any storefront collections.`
                : `Product has low search visibility (${score}/100) despite belonging to ${item.collectionCount} collection(s).`;

            const problemDetected = isZeroCollection
                ? `"${item.productTitle}" is not included in any collections. This may make it harder for shoppers to discover the product through collection browsing.`
                : `"${item.productTitle}" appears in ${item.collectionCount} collection(s) but has low search visibility (${score}/100).`;

            const whyItMatters = isZeroCollection
                ? `Products not placed in any collection receive zero collection browsing traffic and lower overall store visibility.`
                : `Adding relevant search tags helps shoppers discover this product when submitting relevant catalog searches.`;

            const suggestedAction = isZeroCollection
                ? `Add "${item.productTitle}" to an appropriate existing collection.`
                : `Add the search tag "${suggestedTag}" to "${item.productTitle}" to assist search discovery.`;

            recommendations.push(
                createRecommendation({
                    shop,
                    type: "LOW_DISCOVERABILITY",
                    sourceKey: item.productId,
                    title,
                    description,
                    problemDetected,
                    whyItMatters,
                    suggestedAction,
                    sourceModule: "Product Discoverability",
                    sourcePath: `/app/product-discoverability?productId=${encodeURIComponent(item.productId)}`,
                    actionType,
                    actionDestination: `/app/product-discoverability?productId=${encodeURIComponent(item.productId)}`,
                    proposedChanges,
                    impact,
                    evidenceStrength,
                    actionability,
                    effort,
                    confidenceData: {
                        sampleSize: (item.views || 0) + (item.clicks || 0) + (item.collectionCount || 0) + 1,
                        sourceVerified: true,
                        recencyDays: 30,
                        dataCompleteness: true,
                    },
                    evidence: [
                        {
                            metric: "Discoverability Score",
                            value: score,
                            comparisonValue: "Benchmark: 60+",
                            explanation: "Calculated discoverability score across visibility, collections, views, and clicks.",
                        },
                        {
                            metric: "Collection Placements",
                            value: item.collectionCount,
                            comparisonValue: "Recommended: 2+",
                            explanation: "Number of storefront collections containing this product.",
                        },
                        {
                            metric: "Storefront Impressions / Views",
                            value: item.views && item.views > 0 ? item.views : "0 (No views recorded)",
                            explanation: "Observed customer views within the observation window.",
                        },
                    ],
                    affectedProducts: [
                        {
                            productId: item.productId,
                            title: item.productTitle,
                            handle: "",
                        },
                    ],
                })
            );
        }
    } catch (err) {
        console.warn("[RecommendationEngine] Discoverability adapter warning:", err.message);
    }
    return recommendations;
}

/**
 * Adapter C: Search Engagement Problem
 */
export async function buildSearchEngagementRecommendations(shop) {
    const recommendations = [];
    if (mongoose.connection.readyState !== 1) return recommendations;
    try {
        const db = mongoose.connection.db;
        if (!db) return recommendations;

        // Group searches that returned products (resultCount > 0)
        const pipeline = [
            {
                $match: {
                    shop,
                    eventType: "search",
                    resultCount: { $gt: 0 },
                    normalizedQuery: { $nin: [null, ""] },
                },
            },
            {
                $group: {
                    _id: "$normalizedQuery",
                    query: { $first: "$query" },
                    searches: { $sum: 1 },
                },
            },
            {
                $match: {
                    searches: { $gte: 4 },
                },
            },
            {
                $sort: { searches: -1 },
            },
            {
                $limit: 20,
            },
        ];

        const candidateSearches = await db.collection("tbl_search_events").aggregate(pipeline).toArray();
        if (!candidateSearches.length) return recommendations;

        const queries = candidateSearches.map((s) => s._id);

        // Match clicks for these queries
        const clickCounts = await db.collection("tbl_search_events").aggregate([
            {
                $match: {
                    shop,
                    eventType: "click",
                    normalizedQuery: { $in: queries },
                },
            },
            {
                $group: {
                    _id: "$normalizedQuery",
                    clicks: { $sum: 1 },
                },
            },
        ]).toArray();

        const clicksMap = new Map(clickCounts.map((c) => [c._id, c.clicks]));

        for (const item of candidateSearches) {
            const clicks = clicksMap.get(item._id) || 0;
            const ctr = Number(((clicks / item.searches) * 100).toFixed(1));

            // Only flag if engagement is genuinely low (CTR < 5% or 0 clicks)
            if (clicks > 1 && ctr >= 5) continue;

            const impact = Math.min(95, Math.round(item.searches * 10));
            const evidenceStrength = item.searches >= 6 ? 85 : 70;

            const proposedChanges = {
                action: "OPTIMIZE_SEARCH_ENGAGEMENT",
                query: item.query || item._id,
                searches: item.searches,
                clicks,
                ctr: `${ctr}%`,
                description: `Review product thumbnails and ranking relevance for query "${item.query || item._id}".`,
            };

            recommendations.push(
                createRecommendation({
                    shop,
                    type: "LOW_ENGAGEMENT",
                    sourceKey: item._id,
                    title: `Improve search engagement for "${item.query || item._id}"`,
                    description: `Search query "${item.query || item._id}" produced ${item.searches} searches with only ${clicks} click(s) (${ctr}% CTR).`,
                    problemDetected: `Shoppers submit "${item.query || item._id}" and see matching products, but rarely click any of the returned results.`,
                    whyItMatters: "A low click-through rate indicates that returned products do not match customer intent, or thumbnail images/prices are unappealing.",
                    suggestedAction: `Review search relevance and thumbnail presentation for products matching "${item.query || item._id}".`,
                    sourceModule: "Search Intelligence",
                    sourcePath: `/app/search-intelligence?query=${encodeURIComponent(item.query || item._id)}`,
                    actionType: "OPTIMIZE_SEARCH_ENGAGEMENT",
                    actionDestination: `/app/search-intelligence?query=${encodeURIComponent(item.query || item._id)}`,
                    targetQuery: item.query || item._id,
                    proposedChanges,
                    impact,
                    evidenceStrength,
                    actionability: 75,
                    effort: 35,
                    confidenceData: {
                        sampleSize: item.searches,
                        sourceVerified: true,
                        recencyDays: 30,
                        dataCompleteness: true,
                    },
                    evidence: [
                        {
                            metric: "Search Volume",
                            value: item.searches,
                            explanation: "Searches that successfully returned catalog products.",
                        },
                        {
                            metric: "Product Clicks Recorded",
                            value: clicks,
                            explanation: "Result clicks attributed to this search query.",
                        },
                        {
                            metric: "Click-Through Rate (CTR)",
                            value: `${ctr}%`,
                            comparisonValue: "Benchmark: 10%+",
                            explanation: "Percentage of searches that resulted in a product click.",
                        },
                    ],
                })
            );
        }
    } catch (err) {
        console.warn("[RecommendationEngine] Search engagement adapter warning:", err.message);
    }
    return recommendations;
}

/**
 * Adapter D: Customer Journey Drop-Off
 */
export async function buildJourneyDropOffRecommendations(shop) {
    const recommendations = [];
    if (mongoose.connection.readyState !== 1) return recommendations;
    try {
        const overview = await customerDiscoveryService.getOverview({ shopDomain: shop });
        if (!overview || !overview.biggestDropOff) return recommendations;

        const drop = overview.biggestDropOff;
        if (drop.dropOff >= 3) {
            const impact = Math.min(95, Math.round(drop.dropOff * 12));
            const evidenceStrength = 85;

            const proposedChanges = {
                action: "ADDRESS_JOURNEY_DROPOFF",
                fromStage: drop.from,
                toStage: drop.to,
                dropOffCount: drop.dropOff,
                conversionRate: `${drop.conversionRate}%`,
                description: `Inspect ${drop.from} layout and merchandising CTAs to ease shopper transition toward ${drop.to}.`,
            };

            recommendations.push(
                createRecommendation({
                    shop,
                    type: "JOURNEY_DROPOFF",
                    sourceKey: `${drop.from}_to_${drop.to}`,
                    title: `Address discovery drop-off from ${drop.from} to ${drop.to}`,
                    description: `Major conversion bottleneck identified between ${drop.from} and ${drop.to} with ${drop.dropOff} lost shopper sessions.`,
                    problemDetected: `Customer discovery funnels recorded ${drop.dropOff} session abandonments between ${drop.from} and ${drop.to} (${drop.conversionRate}% conversion rate).`,
                    whyItMatters: "This transition represents the single highest customer attrition point across your storefront discovery journey.",
                    suggestedAction: `Inspect your ${drop.from} page layout, navigation clarity, and call-to-actions to ease progress toward ${drop.to}.`,
                    sourceModule: "Customer Discovery Journey",
                    sourcePath: "/app/customer-discovery-journey",
                    actionType: "ADDRESS_JOURNEY_DROPOFF",
                    actionDestination: "/app/customer-discovery-journey",
                    proposedChanges,
                    impact,
                    evidenceStrength,
                    actionability: 80,
                    effort: 45,
                    confidenceData: {
                        sampleSize: drop.dropOff + (overview.totals?.customersTracked || 0),
                        sourceVerified: true,
                        recencyDays: 30,
                        dataCompleteness: true,
                    },
                    evidence: [
                        {
                            metric: "Stage Transition",
                            value: `${drop.from} → ${drop.to}`,
                            explanation: "Sequential journey stage where abandonment was highest.",
                        },
                        {
                            metric: "Lost Sessions",
                            value: drop.dropOff,
                            explanation: "Number of shopper sessions that did not progress to the next stage.",
                        },
                        {
                            metric: "Stage Conversion Rate",
                            value: `${drop.conversionRate}%`,
                            explanation: "Percentage of shoppers that successfully converted to the next stage.",
                        },
                    ],
                })
            );
        }
    } catch (err) {
        console.warn("[RecommendationEngine] Journey drop-off adapter warning:", err.message);
    }
    return recommendations;
}

/**
 * Adapter E: Collection Performance Issue
 */
export async function buildCollectionPerformanceRecommendations(shop) {
    const recommendations = [];
    if (mongoose.connection.readyState !== 1) return recommendations;
    try {
        const problems = await getPositioningProblems({ shop });
        if (!Array.isArray(problems)) return recommendations;

        const filtered = problems.filter((p) => p.clicks >= 8 && p.issue).slice(0, 10);

        for (const item of filtered) {
            const impact = 70;
            const evidenceStrength = 85;

            const proposedChanges = {
                action: "REPOSITION_IN_COLLECTION",
                collectionId: item.collectionId,
                collectionTitle: item.collectionTitle,
                productId: item.productId,
                productTitle: item.productTitle,
                currentPosition: item.position,
                recommendedPosition: Math.min(20, item.position + 5),
                description: `Move "${item.productTitle}" from position #${item.position} lower in "${item.collectionTitle}" to elevate higher-converting items.`,
            };

            recommendations.push(
                createRecommendation({
                    shop,
                    type: "COLLECTION_PERFORMANCE",
                    sourceKey: `${item.collectionId}:${item.productId}`,
                    title: `Reposition "${item.productTitle}" in collection "${item.collectionTitle}"`,
                    description: `Product at position #${item.position} converts below the collection average despite receiving shopper clicks.`,
                    problemDetected: `"${item.productTitle}" at position #${item.position} has ${item.clicks} click(s) and converts at ${item.conversionRate || 0}%, falling below collection average.`,
                    whyItMatters: "Top positions in collections drive high traffic; retaining low-converting products at top spots depresses total collection revenue.",
                    suggestedAction: `Consider moving "${item.productTitle}" lower in "${item.collectionTitle}" and elevating a higher-converting product to position #${item.position}.`,
                    sourceModule: "Collection Merchandising Intelligence",
                    sourcePath: `/app/collection-merchandising?collectionId=${encodeURIComponent(item.collectionId)}`,
                    actionType: "REPOSITION_IN_COLLECTION",
                    actionDestination: `/app/collection-merchandising?collectionId=${encodeURIComponent(item.collectionId)}`,
                    proposedChanges,
                    impact,
                    evidenceStrength,
                    actionability: 90,
                    effort: 20,
                    confidenceData: {
                        sampleSize: item.clicks,
                        sourceVerified: true,
                        recencyDays: 30,
                        dataCompleteness: true,
                    },
                    evidence: [
                        {
                            metric: "Collection Position",
                            value: `#${item.position}`,
                            explanation: "Current ordering slot within the collection.",
                        },
                        {
                            metric: "Product Clicks in Collection",
                            value: item.clicks,
                            explanation: "Customer clicks received by this product within the collection.",
                        },
                        {
                            metric: "Product Conversion Rate",
                            value: item.conversionRate !== null ? `${item.conversionRate}%` : "0%",
                            explanation: "Conversion rate calculated from purchases divided by clicks.",
                        },
                    ],
                    affectedProducts: [
                        {
                            productId: item.productId,
                            title: item.productTitle,
                            handle: "",
                        },
                    ],
                    affectedCollections: [
                        {
                            collectionId: item.collectionId,
                            title: item.collectionTitle,
                            handle: "",
                        },
                    ],
                })
            );
        }
    } catch (err) {
        console.warn("[RecommendationEngine] Collection performance adapter warning:", err.message);
    }
    return recommendations;
}

/**
 * Adapter F: Trending Search Opportunity
 */
export async function buildTrendingSearchRecommendations(shop) {
    const recommendations = [];
    if (mongoose.connection.readyState !== 1) return recommendations;
    try {
        const trendData = await calculateTrendingSearches({ shop, days: 30 });
        const trends = trendData?.trends || [];

        const fastGrowing = trends
            .filter((t) => (t.trendType === "Rising" || t.trendType === "New") && t.growthPercent >= 40 && t.currentSearches >= 4)
            .slice(0, 10);

        for (const item of fastGrowing) {
            const impact = Math.min(95, Math.round(item.trendScore || item.growthPercent / 2));
            const evidenceStrength = 80;

            const proposedChanges = {
                action: "PROMOTE_TRENDING_QUERY",
                query: item.query,
                growthPercent: Math.round(item.growthPercent),
                currentSearches: item.currentSearches,
                description: `Promote products matching "${item.query}" in storefront merchandising or collections.`,
            };

            recommendations.push(
                createRecommendation({
                    shop,
                    type: "TRENDING_SEARCH",
                    sourceKey: item.normalizedQuery || item.query,
                    title: `Capitalize on trending search "${item.query}"`,
                    description: `Search demand for "${item.query}" surged ${Math.round(item.growthPercent)}% over the last 30 days (${item.currentSearches} searches).`,
                    problemDetected: `Rising customer demand detected for "${item.query}" (+${Math.round(item.growthPercent)}% increase from ${item.previousSearches} previous searches).`,
                    whyItMatters: "Rapidly rising search phrases represent urgent customer purchase intent that should be highlighted before interest cools.",
                    suggestedAction: `Feature products matching "${item.query}" prominently on your homepage or create a dedicated collection.`,
                    sourceModule: "Trending Searches",
                    sourcePath: `/app/trending-searches?query=${encodeURIComponent(item.query)}`,
                    actionType: "PROMOTE_TRENDING_QUERY",
                    actionDestination: `/app/trending-searches?query=${encodeURIComponent(item.query)}`,
                    targetQuery: item.query,
                    proposedChanges,
                    impact,
                    evidenceStrength,
                    actionability: 85,
                    effort: 25,
                    confidenceData: {
                        sampleSize: item.currentSearches + item.previousSearches,
                        sourceVerified: true,
                        recencyDays: 14,
                        dataCompleteness: true,
                    },
                    evidence: [
                        {
                            metric: "Current Period Searches",
                            value: item.currentSearches,
                            comparisonValue: `Previous: ${item.previousSearches}`,
                            explanation: "Customer search volume observed during current 30-day window.",
                        },
                        {
                            metric: "Demand Growth Rate",
                            value: `+${Math.round(item.growthPercent)}%`,
                            explanation: "Percentage growth compared to preceding 30-day period.",
                        },
                        {
                            metric: "Trend Classification",
                            value: item.trendType,
                            explanation: "Classified using verified search growth thresholds.",
                        },
                    ],
                })
            );
        }
    } catch (err) {
        console.warn("[RecommendationEngine] Trending search adapter warning:", err.message);
    }
    return recommendations;
}

/**
 * Adapter G: Cross-Module Opportunities (Missed Sales Opportunities)
 */
export async function buildCrossModuleRecommendations(shop) {
    const recommendations = [];
    if (mongoose.connection.readyState !== 1) return recommendations;
    try {
        const db = mongoose.connection.db;
        if (!db) return recommendations;

        const opps = await db.collection("tbl_missed_sales_opportunities")
            .find({
                shop,      
                $or: [
                    { opportunityType: "Combined" },
                    { potentialProducts: { $gt: 0 }, zeroResultSearches: { $gt: 0 } },
                ],
            })
            .sort({ impactScore: -1 })
            .limit(10)
            .toArray();

        for (const item of opps) {
            const queryText = item.query || item.normalizedQuery;
            if (!queryText) continue;

            const impact = Math.round(item.impactScore || 65);
            const evidenceStrength = 85;

            let affectedProducts = [];
            try {
                const words = queryText.split(" ").filter((w) => w.length >= 2).slice(0, 3);
                const searchRegex = words.length ? words.map(escapeRegex).join("|") : escapeRegex(queryText);
                const rawMatches = await db.collection("tbl_products").find({
                    shop,
                    $or: [
                        { title: { $regex: searchRegex, $options: "i" } },
                        { handle: { $regex: searchRegex, $options: "i" } },
                    ],
                }).limit(3).toArray();
                affectedProducts = rawMatches.map((p) => ({
                    productId: p.shopifyProductId || String(p._id),
                    title: p.title || "",
                    handle: p.handle || "",
                }));
            } catch (error) {
                console.warn("[RecommendationEngine] Cross-module product lookup failed:", error.message);
            }

            const proposedChanges = {
                action: "CONNECT_SEARCH_CATALOG",
                tag: queryText,
                targetQuery: queryText,
                potentialProducts: item.potentialProducts,
                affectedProducts,
                description: `Tag matching catalog products with "${queryText}" so shoppers find in-stock inventory.`,
            };

            recommendations.push(
                createRecommendation({
                    shop,
                    type: "CROSS_MODULE",
                    sourceKey: queryText,
                    title: `Connect zero-result search "${queryText}" with ${item.potentialProducts} matching products`,
                    description: `Shoppers searched for "${queryText}" with no results, but ${item.potentialProducts} matching products exist in your catalog.`,
                    problemDetected: `Zero-result query "${queryText}" failed to display ${item.potentialProducts} relevant catalog product(s) already in stock.`,
                    whyItMatters: "Vocabulary mismatches between search terms and product titles cause avoidable lost sales on in-stock inventory.",
                    suggestedAction: `Tag the ${item.potentialProducts} matching products with "${queryText}" so they appear in customer search results.`,
                    sourceModule: "Missed Sales Opportunity Finder",
                    sourcePath: `/app/zero-result-searches?query=${encodeURIComponent(queryText)}`,
                    actionType: "CONNECT_SEARCH_CATALOG",
                    actionDestination: `/app/zero-result-searches?query=${encodeURIComponent(queryText)}`,
                    targetQuery: queryText,
                    proposedChanges,
                    impact,
                    evidenceStrength,
                    actionability: 90,
                    effort: 25,
                    confidenceData: {
                        sampleSize: (item.searches || 1) + item.potentialProducts,
                        sourceVerified: true,
                        recencyDays: 30,
                        dataCompleteness: true,
                    },
                    affectedProducts,
                    evidence: [
                        {
                            metric: "Unmet Search Volume",
                            value: item.searches || item.zeroResultSearches,
                            explanation: "Customer searches that returned no products.",
                        },
                        {
                            metric: "Potential Catalog Matches",
                            value: item.potentialProducts,
                            explanation: "Existing catalog products identified that match customer intent.",
                        },
                        {
                            metric: "Opportunity Impact Score",
                            value: Math.round(item.impactScore || 0),
                            explanation: "Score combining demand volume, customer signals, and catalog availability.",
                        },
                    ],
                })
            );
        }
    } catch (err) {
        console.warn("[RecommendationEngine] Cross-module adapter warning:", err.message);
    }
    return recommendations;
}

/**
 * Core generation runner (executed inside concurrency lock).
 */
async function executeGeneration(shop) {
    if (mongoose.connection.readyState !== 1) {
        throw new Error("MongoDB is not connected.");
    }

    const sourceStatus = {
        zeroResult: { status: "pending", count: 0 },
        discoverability: { status: "pending", count: 0 },
        searchEngagement: { status: "pending", count: 0 },
        journeyDropoff: { status: "pending", count: 0 },
        collectionPerformance: { status: "pending", count: 0 },
        trendingSearch: { status: "pending", count: 0 },
        crossModule: { status: "pending", count: 0 },
    };

    const [
        zeroResults,
        discoverability,
        searchEngagement,
        journeyDropoffs,
        collectionPerformance,
        trendingSearches,
        crossModule,
    ] = await Promise.all([
        buildZeroResultRecommendations(shop)
            .then((res) => { sourceStatus.zeroResult = { status: "success", count: res.length }; return res; })
            .catch((err) => { sourceStatus.zeroResult = { status: "failed", error: err.message, count: 0 }; return []; }),

        buildDiscoverabilityRecommendations(shop)
            .then((res) => { sourceStatus.discoverability = { status: "success", count: res.length }; return res; })
            .catch((err) => { sourceStatus.discoverability = { status: "failed", error: err.message, count: 0 }; return []; }),

        buildSearchEngagementRecommendations(shop)
            .then((res) => { sourceStatus.searchEngagement = { status: "success", count: res.length }; return res; })
            .catch((err) => { sourceStatus.searchEngagement = { status: "failed", error: err.message, count: 0 }; return []; }),

        buildJourneyDropOffRecommendations(shop)
            .then((res) => { sourceStatus.journeyDropoff = { status: "success", count: res.length }; return res; })
            .catch((err) => { sourceStatus.journeyDropoff = { status: "failed", error: err.message, count: 0 }; return []; }),

        buildCollectionPerformanceRecommendations(shop)
            .then((res) => { sourceStatus.collectionPerformance = { status: "success", count: res.length }; return res; })
            .catch((err) => { sourceStatus.collectionPerformance = { status: "failed", error: err.message, count: 0 }; return []; }),

        buildTrendingSearchRecommendations(shop)
            .then((res) => { sourceStatus.trendingSearch = { status: "success", count: res.length }; return res; })
            .catch((err) => { sourceStatus.trendingSearch = { status: "failed", error: err.message, count: 0 }; return []; }),

        buildCrossModuleRecommendations(shop)
            .then((res) => { sourceStatus.crossModule = { status: "success", count: res.length }; return res; })
            .catch((err) => { sourceStatus.crossModule = { status: "failed", error: err.message, count: 0 }; return []; }),
    ]);

    const generated = [
        ...zeroResults,
        ...discoverability,
        ...searchEngagement,
        ...journeyDropoffs,
        ...collectionPerformance,
        ...trendingSearches,
        ...crossModule,
    ];

    let created = 0;
    let updated = 0;
    let autoSolved = 0;
    let unchanged = 0;

    const now = new Date();
    const activeFingerprints = new Set(generated.map((rec) => rec.fingerprint));

    for (const rec of generated) {
        const existing = await MerchandisingRecommendation.findOne({
            shop,
            fingerprint: rec.fingerprint,
        }).lean();

        if (existing) {
            // Strictly preserve merchant's decisions on existing recommendations!
            // Never reset REVIEWED, COMPLETED, or DISMISSED status back to PENDING.
            const updates = {
                title: rec.title,
                description: rec.description,
                problemDetected: rec.problemDetected,
                whyItMatters: rec.whyItMatters,
                suggestedAction: rec.suggestedAction,
                sourceModule: rec.sourceModule,
                sourcePath: rec.sourcePath,
                actionType: rec.actionType,
                actionDestination: rec.actionDestination,
                targetQuery: rec.targetQuery,
                proposedChanges: rec.proposedChanges,
                priority: rec.priority,
                priorityScore: rec.priorityScore,
                priorityReason: rec.priorityReason,
                priorityBreakdown: rec.priorityBreakdown,
                confidence: rec.confidence,
                confidenceLevel: rec.confidenceLevel,
                confidenceReason: rec.confidenceReason,
                evidence: rec.evidence,
                affectedProducts: rec.affectedProducts,
                affectedCollections: rec.affectedCollections,
                lastDetectedAt: now,
                lastEvidenceAt: now,
            };

            await MerchandisingRecommendation.updateOne(
                { _id: existing._id, shop },
                { $set: updates }
            );

            updated += 1;
        } else {
            await MerchandisingRecommendation.create(rec);
            created += 1;
        }
    }

    // Auto-solve: Any recommendation previously PENDING or REVIEWED whose problem
    // is no longer detected in the current scan has been resolved in the store data.
    const resolvedResult = await MerchandisingRecommendation.updateMany(
        {
            shop,
            status: { $in: ["PENDING", "REVIEWED"] },
            fingerprint: { $nin: Array.from(activeFingerprints) },
        },
        {
            $set: {
                status: "COMPLETED",
                completedAt: now,
            },
            $push: {
                lifecycleHistory: {
                    status: "COMPLETED",
                    reason: "Auto-solved: Problem condition has been resolved and is no longer detected in live store data.",
                    changedAt: now,
                },
            },
        }
    );
    autoSolved = resolvedResult.modifiedCount || 0;

    const totalScanned =
        zeroResults.length +
        discoverability.length +
        searchEngagement.length +
        journeyDropoffs.length +
        collectionPerformance.length +
        trendingSearches.length +
        crossModule.length;

    return {
        shop,
        scanned: totalScanned,
        generated: generated.length,
        created,
        updated,
        autoSolved,
        unchanged,
        sources: sourceStatus,
        message:
            generated.length === 0
                ? "No actionable recommendations were detected from the current store data."
                : `Successfully refreshed recommendations (${created} created, ${updated} updated${autoSolved > 0 ? `, ${autoSolved} auto-solved` : ""}).`,
    };
}

/**
 * Public refresh entry point with per-shop concurrency locking.
 */
export async function generateRecommendations(shopInput) {
    const shop = normalizeShop(shopInput);

    if (!shop) {
        throw new Error("Authenticated Shopify shop is required.");
    }

    // Check if an existing refresh promise is in-flight for this shop
    if (activeRefreshes.has(shop)) {
        return activeRefreshes.get(shop);
    }

    const refreshPromise = (async () => {
        try {
            return await executeGeneration(shop);
        } finally {
            activeRefreshes.delete(shop);
        }
    })();

    activeRefreshes.set(shop, refreshPromise);
    return refreshPromise;
}

export default {
    generateRecommendations,
    normalizeShop,
    makeFingerprint,
    buildZeroResultRecommendations,
    buildDiscoverabilityRecommendations,
    buildSearchEngagementRecommendations,
    buildJourneyDropOffRecommendations,
    buildCollectionPerformanceRecommendations,
    buildTrendingSearchRecommendations,
    buildCrossModuleRecommendations,
};