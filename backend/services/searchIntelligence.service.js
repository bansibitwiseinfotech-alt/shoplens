import SearchEvent from "../models/searchEvent.model.js";
import { fetchAllStoreProducts } from "./productSyncService.js";
import { fetchLiveStorefrontSearchResults } from "./shopifySearch.service.js";
import searchIntentService from "./searchIntentService.js";

/**
 * Search attribution window.
 * A purchase or click is attributed to a customer's search within 30 minutes.
 */
export const ATTRIBUTION_WINDOW_MINUTES = 30;

function dateKeyInTimeZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
}

async function upsertSearchEvent(filter, update) {
    try {
        return await SearchEvent.findOneAndUpdate(filter, update, {
            upsert: true,
            new: true,
        });
    } catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await SearchEvent.findOne(filter).lean();
        if (existing) return existing;
        throw error;
    }
}

/**
 * Normalize search query according to requirements:
 * - trim leading/trailing whitespace
 * - convert to lowercase
 * - normalize repeated whitespace
 * - preserve meaningful search text
 *
 * Example: " iPhone  " -> "iphone"
 */
export function normalizeQuery(query) {
    if (!query || typeof query !== "string") {
        return null;
    }

    const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
    return normalized.length > 0 ? normalized : null;
}

/**
 * Helper: Find the most recent search by this customer (clientId)
 * within the attribution window.
 */
export async function getRecentCustomerSearch({ shop, clientId, beforeTime = new Date() }) {
    if (!clientId) return null;

    const windowStart = new Date(beforeTime.getTime() - ATTRIBUTION_WINDOW_MINUTES * 60 * 1000);

    return SearchEvent.findOne({
        shop,
        clientId,
        eventType: "search",
        occurredAt: { $gte: windowStart, $lte: beforeTime },
    })
        .sort({ occurredAt: -1 })
        .lean();
}

/**
 * Record a customer search dynamically with live storefront search.
 *
 * Requirements:
 * - Normalizes search query
 * - Atomic upsert and increment ($inc: { searchCount: 1 })
 * - Connects search query to actual returned products
 * - Handles 0-result searches (hasResults: false, resultCount: 0)
 * - Concurrency safe
 */
export async function recordSearch({
    shop,
    eventId,
    clientId,
    query,
    occurredAt,
    returnedProducts,
    resultCount,
    metadata = {},
}) {
    const normalizedQuery = normalizeQuery(query);

    if (!normalizedQuery) {
        throw new Error("Search query is required");
    }

    const now = occurredAt ? new Date(occurredAt) : new Date();

    const capturedResultCount = Number.isInteger(resultCount)
        ? resultCount
        : Array.isArray(returnedProducts)
          ? returnedProducts.length
          : null;

    // Deduplication check: if the same customer (or session) searched the exact same query within the last 6 seconds,
    // do not create a second search document. Instead enrich the existing search event with result details.
    const dedupWindowMs = 6000;
    const windowStart = new Date(now.getTime() - dedupWindowMs);
    const dedupFilter = {
        shop,
        eventType: "search",
        normalizedQuery,
        occurredAt: { $gte: windowStart, $lte: new Date(now.getTime() + 1000) },
    };
    if (clientId) {
        dedupFilter.clientId = clientId;
    }

    const existingDuplicate = await SearchEvent.findOne(dedupFilter).sort({ occurredAt: -1 });

    if (existingDuplicate) {
        const updateSet = {};
        if (
            capturedResultCount !== null &&
            (existingDuplicate.resultCount === null || existingDuplicate.resultCount === undefined)
        ) {
            updateSet.resultCount = capturedResultCount;
            updateSet["metadata.resultCount"] = capturedResultCount;
            updateSet["metadata.hasResults"] = capturedResultCount > 0;
        }

        if (
            Array.isArray(returnedProducts) &&
            returnedProducts.length > 0 &&
            (!existingDuplicate.metadata?.returnedProducts ||
                existingDuplicate.metadata.returnedProducts.length === 0)
        ) {
            updateSet["metadata.returnedProducts"] = returnedProducts;
            const cleanIds = returnedProducts
                .map((p) => {
                    const id = p.id || p.productId;
                    return id ? String(id).replace(/\D/g, "") : null;
                })
                .filter(Boolean);
            if (cleanIds.length > 0) {
                updateSet["metadata.returnedProductIds"] = cleanIds;
            }
        }

        if (Object.keys(updateSet).length > 0) {
            await SearchEvent.updateOne({ _id: existingDuplicate._id }, { $set: updateSet });
        }

        return { event: existingDuplicate, deduplicated: true };
    }

    const savedEvent = await upsertSearchEvent(
        { shop, eventId },
        {
            $setOnInsert: {
                shop,
                eventId,
                clientId: clientId || null,
                eventType: "search",
                eventName: "search_submitted",
                query: query.trim(),
                normalizedQuery,
                queryId: eventId,
                resultCount: capturedResultCount,
                occurredAt: now,
                metadata: {
                    ...metadata,
                    resultCount: capturedResultCount,
                    hasResults:
                        capturedResultCount === null ? null : capturedResultCount > 0,
                },
            },
        }
    );

    setImmediate(async () => {
        try {
            let liveResults = { count: 0, products: [] };
            if (Array.isArray(returnedProducts)) {
                liveResults = {
                    count: capturedResultCount ?? returnedProducts.length,
                    products: returnedProducts.map((p, index) => ({
                        id: p.id || p.productId,
                        title: p.title || p.productTitle || "",
                        position: p.position || index + 1,
                        image: p.image || null,
                    })),
                };
            } else if (capturedResultCount !== null) {
                liveResults = { count: capturedResultCount, products: [] };
            } else {
                liveResults = await fetchLiveStorefrontSearchResults(shop, normalizedQuery);
            }

            const cleanIds = liveResults.products
                .map((p) => {
                    const id = p.id || p.productId;
                    return id ? String(id).replace(/\D/g, "") : null;
                })
                .filter(Boolean);

            await SearchEvent.updateOne(
                { shop, eventId },
                {
                    $set: {
                        resultCount: liveResults.count,
                        "metadata.resultCount": liveResults.count,
                        "metadata.hasResults": liveResults.count > 0,
                        "metadata.returnedProductIds": cleanIds,
                        "metadata.returnedProducts": liveResults.products,
                    },
                }
            );

            // Also trigger live search intent synchronization so search intent page has newest data immediately
            searchIntentService.syncFromSearchEvents(shop).catch((e) => {
                console.warn("[SearchIntelligence] Background search intent sync failed:", e.message);
            });
        } catch (err) {
            console.warn("[SearchIntelligence] Async product resolution failed:", err.message);
        }
    });

    return { event: savedEvent };
}

/**
 * Record a product click.
 */
export async function recordProductClick({
    shop,
    eventId,
    clientId,
    query,
    queryId,
    productId,
    variantId,
    occurredAt,
    metadata = {},
}) {
    const now = occurredAt ? new Date(occurredAt) : new Date();

    // 1. Resolve product ID and title
    let resolvedProductId = productId ? String(productId) : null;
    let productTitle = metadata.productTitle || metadata.title || "";
    const handle = metadata.handle || metadata.productHandle;

    if (!resolvedProductId && (handle || productTitle)) {
        try {
            const catalog = await fetchAllStoreProducts(shop);
            const found = catalog.find(
                (p) =>
                    (handle && p.handle === handle) ||
                    (productTitle && p.title && p.title.toLowerCase() === productTitle.toLowerCase())
            );
            if (found) {
                resolvedProductId = String(found.shopifyProductId || found.id);
                if (!productTitle) productTitle = found.title;
            }
        } catch (error) {
            console.warn("[SearchIntelligence] Product click catalog resolution failed:", error.message);
        }
    }

    if (resolvedProductId && !resolvedProductId.startsWith("gid://")) {
        const cleanDigits = resolvedProductId.replace(/\D/g, "");
        if (cleanDigits) resolvedProductId = `gid://shopify/Product/${cleanDigits}`;
    }

    // 2. Resolve query if missing
    let normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery && clientId) {
        const recentSearch = await getRecentCustomerSearch({ shop, clientId, beforeTime: now });
        if (recentSearch) {
            normalizedQuery = recentSearch.normalizedQuery;
            if (!queryId) queryId = recentSearch.queryId || recentSearch.eventId;
        }
    }

    // Deduplication check: if the same customer clicked the same product within 6 seconds, do not duplicate
    const dedupWindowMs = 6000;
    const windowStart = new Date(now.getTime() - dedupWindowMs);
    const clickDedupFilter = {
        shop,
        eventType: { $in: ["click", "product_click"] },
        occurredAt: { $gte: windowStart, $lte: new Date(now.getTime() + 1000) },
    };
    if (resolvedProductId) {
        clickDedupFilter.productId = resolvedProductId;
    } else if (handle) {
        clickDedupFilter["metadata.handle"] = handle;
    }
    if (clientId) {
        clickDedupFilter.clientId = clientId;
    }

    const existingClick = await SearchEvent.findOne(clickDedupFilter).sort({ occurredAt: -1 });
    if (existingClick) {
        return existingClick;
    }

    const safeEventId = eventId || `click_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return upsertSearchEvent(
        { shop, eventId: safeEventId },
        {
            $setOnInsert: {
                shop,
                eventId: safeEventId,
                clientId: clientId || null,
                eventType: "product_click",
                eventName: "search_result_clicked",
                query: query || normalizedQuery || null,
                normalizedQuery: normalizedQuery || null,
                queryId: queryId || null,
                productId: resolvedProductId,
                variantId: variantId || null,
                occurredAt: now,
                metadata: {
                    ...metadata,
                    productTitle: productTitle || metadata.productTitle,
                },
            },
        }
    );
}

/**
 * Record add-to-cart event.
 */
export async function recordAddToCart({
    shop,
    eventId,
    clientId,
    query,
    queryId,
    productId,
    variantId,
    occurredAt,
    metadata = {},
}) {
    let normalizedQuery = normalizeQuery(query);
    const now = occurredAt ? new Date(occurredAt) : new Date();

    if (!normalizedQuery && clientId) {
        const recentSearch = await getRecentCustomerSearch({ shop, clientId, beforeTime: now });
        if (recentSearch) {
            normalizedQuery = recentSearch.normalizedQuery;
            if (!queryId) queryId = recentSearch.queryId || recentSearch.eventId;
        }
    }

    // Deduplication check: if the same customer added the same product to cart within 6 seconds, do not duplicate
    const dedupWindowMs = 6000;
    const windowStart = new Date(now.getTime() - dedupWindowMs);
    const cartDedupFilter = {
        shop,
        eventType: "add_to_cart",
        occurredAt: { $gte: windowStart, $lte: new Date(now.getTime() + 1000) },
    };
    if (productId) {
        cartDedupFilter.productId = productId;
    }
    if (variantId) {
        cartDedupFilter.variantId = variantId;
    }
    if (clientId) {
        cartDedupFilter.clientId = clientId;
    }

    const existingCart = await SearchEvent.findOne(cartDedupFilter).sort({ occurredAt: -1 });
    if (existingCart) {
        return existingCart;
    }

    return upsertSearchEvent(
        {
            shop,
            eventId,
        },
        {
            $setOnInsert: {
                shop,
                eventId,
                clientId: clientId || null,
                eventType: "add_to_cart",
                eventName: "product_added_to_cart",
                query: query || null,
                normalizedQuery,
                queryId: queryId || null,
                productId: productId || null,
                variantId: variantId || null,
                occurredAt: now,
                metadata,
            },
        }
    );
}

/**
 */
export async function recordPurchase({
    shop,
    eventId,
    clientId,
    orderId,
    value,
    currency,
    occurredAt,
    verifiedOrder = false,
    orderStatus,
    metadata = {},
}) {
    const now = occurredAt ? new Date(occurredAt) : new Date();
    const normalizedOrderId = orderId ? String(orderId) : null;
    if (!normalizedOrderId) {
        throw new Error("Order ID is required to record a purchase.");
    }

    let recentSearch = null;
    if (clientId) {
        recentSearch = await getRecentCustomerSearch({ shop, clientId, beforeTime: now });
    }

    // Fallback: match by recent search query or search queryId if passed from web pixel
    const rawQuery = metadata.query || metadata.searchQuery;
    const rawQueryId = metadata.queryId || metadata.searchId;
    if (!recentSearch && (rawQuery || rawQueryId)) {
        const qToMatch = normalizeQuery(rawQuery);
        const searchFilter = { shop, eventType: "search" };
        if (rawQueryId) {
            searchFilter.$or = [{ eventId: rawQueryId }, ...(qToMatch ? [{ normalizedQuery: qToMatch }] : [])];
        } else if (qToMatch) {
            searchFilter.normalizedQuery = qToMatch;
        }
        recentSearch = await SearchEvent.findOne({
            ...searchFilter,
            occurredAt: { $gte: new Date(now.getTime() - ATTRIBUTION_WINDOW_MINUTES * 60 * 1000), $lte: now }
        }).sort({ occurredAt: -1 }).lean();
    }

    // Secondary fallback: if still not found, check the most recent search in this store within the attribution window
    if (!recentSearch) {
        recentSearch = await SearchEvent.findOne({
            shop,
            eventType: "search",
            occurredAt: { $gte: new Date(now.getTime() - ATTRIBUTION_WINDOW_MINUTES * 60 * 1000), $lte: now }
        }).sort({ occurredAt: -1 }).lean();
    }

    const filter = { shop, eventType: "purchase", orderId: normalizedOrderId };
    const setOnInsert = {
        shop,
        eventId,
        eventType: "purchase",
        eventName: metadata.eventName || "checkout_completed",
        orderId: normalizedOrderId,
        occurredAt: now,
        "metadata.source": metadata.source || "web_pixel",
    };
    const set = {};
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
        set.value = Number(value);
    }
    if (currency) set.currency = currency;

    if (verifiedOrder) {
        set["metadata.verifiedOrder"] = true;
    }
    const resolvedStatus = orderStatus ? String(orderStatus).toLowerCase() : "paid";
    set["metadata.status"] = resolvedStatus;

    if (recentSearch) {
        set.clientId = recentSearch.clientId || clientId;
        set.normalizedQuery = recentSearch.normalizedQuery;
        set.query = recentSearch.query || recentSearch.normalizedQuery;
        set.queryId = recentSearch.queryId || recentSearch.eventId;
        set["metadata.attributed"] = true;
        set["metadata.attributionSearchEventId"] = recentSearch.eventId;
    }
    if (Array.isArray(metadata.lineItems) && metadata.lineItems.length > 0) {
        set["metadata.lineItems"] = metadata.lineItems;
    }

    const savedEvent = await upsertSearchEvent(
        filter,
        {
            $setOnInsert: setOnInsert,
            $set: set,
        }
    );

    if (verifiedOrder && orderStatus) {
        const statusPriority = {
            created: 1,
            pending: 1,
            authorized: 2,
            paid: 4,
            partially_refunded: 4,
            refunded: 4,
            cancelled: 6,
        }[String(orderStatus).toLowerCase()] || 1;

        const priorityComparison = statusPriority >= 4 ? "$lt" : "$lte";
        await SearchEvent.updateOne(
            {
                ...filter,
                $or: [
                    { "metadata.statusPriority": { [priorityComparison]: statusPriority } },
                    { "metadata.statusPriority": { $exists: false } },
                ],
            },
            {
                $set: {
                    "metadata.status": String(orderStatus).toLowerCase(),
                    "metadata.statusPriority": statusPriority,
                    ...(statusPriority >= 4 ? { occurredAt: now } : {}),
                },
            }
        );
    }

    if (verifiedOrder && metadata.refundEventId) {
        await SearchEvent.updateOne(
            {
                ...filter,
                "metadata.processedRefundEventIds": { $ne: metadata.refundEventId },
            },
            {
                $addToSet: {
                    "metadata.processedRefundEventIds": metadata.refundEventId,
                },
                $inc: {
                    "metadata.refundedAmount": Number(metadata.refundAmount) || 0,
                },
            }
        );
    }

    return savedEvent;
}

/**
 * Record product view event.
 */
export async function recordProductView({
    shop,
    eventId,
    clientId,
    productId,
    variantId,
    occurredAt,
    metadata = {},
}) {
    const now = occurredAt ? new Date(occurredAt) : new Date();

    // Deduplication check: 6 seconds window for product views
    const dedupWindowMs = 6000;
    const windowStart = new Date(now.getTime() - dedupWindowMs);
    const viewDedupFilter = {
        shop,
        eventType: "product_view",
        occurredAt: { $gte: windowStart, $lte: new Date(now.getTime() + 1000) },
    };
    if (productId) {
        viewDedupFilter.productId = productId;
    }
    if (clientId) {
        viewDedupFilter.clientId = clientId;
    }

    const existingView = await SearchEvent.findOne(viewDedupFilter).sort({ occurredAt: -1 });
    if (existingView) {
        return existingView;
    }

    return upsertSearchEvent(
        {
            shop,
            eventId,
        },
        {
            $setOnInsert: {
                shop,
                eventId,
                clientId: clientId || null,
                eventType: "product_view",
                eventName: "product_viewed",
                productId: productId || null,
                variantId: variantId || null,
                occurredAt: now,
                metadata,
            },
        }
    );
}

/**
 * Get total search events in date range.
 */
export async function getTotalSearches({ shop, from, to }) {
    return SearchEvent.countDocuments({
        shop,
        eventType: "search",
        occurredAt: { $gte: from, $lte: to },
    });
}

/**
 * Get count of unique search queries in date range.
 */
export async function getUniqueQueriesCount({ shop, from, to }) {
    const result = await SearchEvent.distinct("normalizedQuery", {
        shop,
        eventType: "search",
        occurredAt: { $gte: from, $lte: to },
        normalizedQuery: { $nin: [null, ""] },
    });
    return result.length;
}

/**
 * Get total clicks in date range.
 */
export async function getTotalClicks({ shop, from, to }) {
    return SearchEvent.countDocuments({
        shop,
        eventType: { $in: ["click", "product_click"] },
        occurredAt: { $gte: from, $lte: to },
    });
}

/**
 * Get total add-to-cart events in date range.
 */
export async function getTotalAddToCart({ shop, from, to }) {
    return SearchEvent.countDocuments({
        shop,
        eventType: "add_to_cart",
        occurredAt: { $gte: from, $lte: to },
    });
}

/**
 * Get total purchases in date range.
 */
export async function getTotalPurchases({ shop, from, to }) {
    const [result] = await SearchEvent.aggregate([
        {
            $match: {
                shop,
                eventType: "purchase",
                $or: [
                    { "metadata.verifiedOrder": true },
                    { "metadata.status": { $in: ["paid", "created", "pending", "partially_refunded", "refunded"] } },
                    { "metadata.attributed": true },
                ],
                occurredAt: { $gte: from, $lte: to },
            },
        },
        { $group: { _id: "$orderId" } },
        { $count: "total" },
    ]);
    return result?.total || 0;
}

/**
 * Find purchases attributed to a search journey.
 */
export async function getSearchAttribution({ shop, from, to }) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(0);
    return SearchEvent.aggregate([
        {
            $match: {
                shop,
                eventType: "purchase",
                $or: [
                    { "metadata.verifiedOrder": true },
                    { "metadata.status": { $in: ["paid", "created", "pending", "partially_refunded", "refunded"] } },
                    { "metadata.attributed": true },
                ],
                occurredAt: { $gte: fromDate, $lte: toDate },
                "metadata.attributionSearchEventId": { $nin: [null, ""] },
            },
        },
        {
            $lookup: {
                from: "tbl_search_events",
                let: {
                    searchEventId: "$metadata.attributionSearchEventId",
                    purchaseTime: "$occurredAt",
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$shop", shop] },
                                    { $eq: ["$eventType", "search"] },
                                    { $eq: ["$eventId", "$$searchEventId"] },
                                    { $gte: ["$occurredAt", fromDate] },
                                    { $lte: ["$occurredAt", toDate] },
                                    {
                                        $gte: [
                                            "$occurredAt",
                                            {
                                                $dateSubtract: {
                                                    startDate: "$$purchaseTime",
                                                    unit: "minute",
                                                    amount: ATTRIBUTION_WINDOW_MINUTES,
                                                },
                                            },
                                        ],
                                    },
                                    { $lte: ["$occurredAt", "$$purchaseTime"] },
                                ],
                            },
                        },
                    },
                    { $sort: { occurredAt: -1 } },
                    { $limit: 1 },
                ],
                as: "attributedSearch",
            },
        },
        {
            $match: {
                $expr: { $gt: [{ $size: "$attributedSearch" }, 0] },
            },
        },
        { $unwind: "$attributedSearch" },
        {
            $group: {
                _id: "$orderId",
                orderId: { $first: "$orderId" },
                eventId: { $first: "$eventId" },
                value: { $first: "$value" },
                currency: { $first: "$currency" },
                occurredAt: { $first: "$occurredAt" },
                clientId: { $first: "$clientId" },
                productId: { $first: "$productId" },
                metadata: { $first: "$metadata" },
                search: { $first: "$attributedSearch" },
            },
        },
    ]);
}

export async function getSearchAttributedPurchaseCount({ shop, from, to }) {
    const purchases = await getSearchAttribution({ shop, from, to });
    return purchases.length;
}

export async function getAttributedRevenue({ shop, from, to }) {
    const purchases = await getSearchAttribution({ shop, from, to });
    const total = purchases.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return Number(total.toFixed(2));
}

export async function getSearchConversionRate({ shop, from, to }) {
    const [searchSessions, attributedPurchases] = await Promise.all([
        SearchEvent.distinct("clientId", {
            shop,
            eventType: "search",
            occurredAt: { $gte: from, $lte: to },
            clientId: { $nin: [null, ""] },
        }),
        getSearchAttribution({ shop, from, to }),
    ]);

    const uniqueSearchSessions = searchSessions.length;
    const uniquePurchasingSessions = new Set(
        attributedPurchases.map((purchase) => purchase.clientId).filter(Boolean)
    ).size;
    const attributedRevenue = Number(
        attributedPurchases
            .reduce((sum, purchase) => sum + (Number(purchase.value) || 0), 0)
            .toFixed(2)
    );
    const conversionRate =
        uniqueSearchSessions > 0
            ? Number(((uniquePurchasingSessions / uniqueSearchSessions) * 100).toFixed(1))
            : 0.0;

    return {
        uniqueSearchSessions,
        uniquePurchasingSessions,
        purchasesFromSearch: attributedPurchases.length,
        searchAttributedPurchases: attributedPurchases.length,
        conversionRate,
        searchConversionRate: conversionRate,
        attributedRevenue,
    };
}

/**
 * Get full search intelligence summary metrics.
 */
export async function getSearchSummary({ shop, from, to }) {
    const [
        totalSearches,
        uniqueQueries,
        totalClicks,
        totalAddToCart,
        totalPurchases,
        conversionData,
    ] = await Promise.all([
        getTotalSearches({ shop, from, to }),
        getUniqueQueriesCount({ shop, from, to }),
        getTotalClicks({ shop, from, to }),
        getTotalAddToCart({ shop, from, to }),
        getTotalPurchases({ shop, from, to }),
        getSearchConversionRate({ shop, from, to }),
    ]);

    const clickThroughRate =
        totalSearches > 0
            ? Number(((totalClicks / totalSearches) * 100).toFixed(1))
            : 0.0;

    return {
        totalSearches,
        totalSearchEvents: totalSearches,
        uniqueSearchTerms: uniqueQueries,
        uniqueQueries,
        productClicks: totalClicks,
        totalClicks,
        purchasesFromSearch: conversionData.purchasesFromSearch,
        searchAttributedPurchases: conversionData.searchAttributedPurchases,
        uniqueSearchSessions: conversionData.uniqueSearchSessions,
        uniquePurchasingSessions: conversionData.uniquePurchasingSessions,
        conversionRate: conversionData.conversionRate,
        clickThroughRate,
        totalAddToCart,
        totalPurchases,
        attributedRevenue: conversionData.attributedRevenue,
        conversionRateDefinition:
            "Unique sessions with an attributed paid/order record divided by unique sessions that searched.",
        period: { from, to },
    };
}

/**
 * Get dynamic search queries with their live search count, returned products count,
 * engagement, and click-to-purchase rate.
 */
export async function getPopularQueries({ shop, from, to, limit = 50 }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

    // Aggregate real search events within date range
    const searchStats = await SearchEvent.aggregate([
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
                displayQuery: { $first: "$query" },
                lastSearchedAt: { $max: "$occurredAt" },
                firstSearchedAt: { $min: "$occurredAt" },
                resultCount: { $first: "$metadata.resultCount" },
                hasResults: { $first: "$metadata.hasResults" },
                returnedProductIds: { $first: "$metadata.returnedProductIds" },
            },
        },
        { $sort: { searches: -1 } },
        { $limit: safeLimit },
    ]);

    if (!searchStats.length) {
        return [];
    }

    const queriesList = searchStats.map((s) => s._id);

    // Aggregate interactions
    const interactions = await SearchEvent.aggregate([
        {
            $match: {
                shop,
                eventType: { $in: ["click", "product_click", "add_to_cart"] },
                occurredAt: { $gte: from, $lte: to },
                normalizedQuery: { $in: queriesList },
            },
        },
        {
            $group: {
                _id: {
                    query: "$normalizedQuery",
                    eventType: "$eventType",
                },
                count: { $sum: 1 },
            },
        },
    ]);

    const clicksMap = new Map();
    const cartsMap = new Map();

    for (const item of interactions) {
        if (item._id.eventType === "click" || item._id.eventType === "product_click") {
            clicksMap.set(item._id.query, (clicksMap.get(item._id.query) || 0) + item.count);
        } else if (item._id.eventType === "add_to_cart") {
            cartsMap.set(item._id.query, item.count);
        }
    }

    // Attributed purchases
    const attributedPurchases = await getSearchAttribution({ shop, from, to });
    const purchasesMap = new Map();

    for (const p of attributedPurchases) {
        const q = p.search?.normalizedQuery;
        if (q && queriesList.includes(q)) {
            purchasesMap.set(q, (purchasesMap.get(q) || 0) + 1);         
        }
    }

    return searchStats.map((item) => {
        const q = item._id;  
        const searches = item.searches;
        const clicks = clicksMap.get(q) || 0;
        const addToCart = cartsMap.get(q) || 0;
        const purchases = purchasesMap.get(q) || 0;

        const convRate =
            searches > 0 ? Number(((purchases / searches) * 100).toFixed(1)) : 0.0;
        const clickToPurchaseRate =
            clicks > 0 ? Number(((purchases / clicks) * 100).toFixed(1)) : 0.0;

        const resultCount = item.resultCount !== undefined
            ? item.resultCount
            : (item.returnedProductIds?.length || 0);
        const hasResults = Boolean(resultCount > 0 || item.hasResults === true);

        return {
            query: q,
            displayQuery: item.displayQuery || q,
            searches,
            hasResults,
            resultCount,
            returnedProductIds: item.returnedProductIds || [],
            clicks,
            addToCart,
            purchases,
            conversionRate: convRate,
            clickToPurchaseRate,
        };
    });
}

/**
 * Get daily search trends from real customer events.
 */
export async function getSearchTrends({ shop, from, to, timeZone = "UTC" }) {
    const [dailyEvents, dailySearchSessions] = await Promise.all([
        SearchEvent.aggregate([
        {
            $match: {
                shop,
                occurredAt: { $gte: from, $lte: to },
                $or: [
                    { eventType: { $ne: "purchase" } },
                    {
                        eventType: "purchase",
                        $or: [
                            { "metadata.verifiedOrder": true },
                            { "metadata.status": { $in: ["paid", "created", "pending", "partially_refunded", "refunded"] } },
                            { "metadata.attributed": true },
                        ],
                    },
                ],
            },
        },
        {
            $addFields: {
                _dailyDate: {
                    $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$occurredAt",
                        timezone: timeZone,
                    },
                },
                _dailyIdentity: {
                    $cond: [
                        { $eq: ["$eventType", "purchase"] },
                        "$orderId",
                        "$eventId",
                    ],
                },
            },
        },
        {
            $group: {
                _id: {
                    date: "$_dailyDate",
                    eventType: "$eventType",
                    identity: "$_dailyIdentity",
                },
            },
        },
        {
            $group: {
                _id: { date: "$_id.date", eventType: "$_id.eventType" },
                count: { $sum: 1 },
            },
        },
        { $sort: { "_id.date": 1 } },
        ]),
        SearchEvent.aggregate([
            {
                $match: {
                    shop,
                    eventType: "search",
                    clientId: { $nin: [null, ""] },
                    occurredAt: { $gte: from, $lte: to },
                },
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$occurredAt",
                                timezone: timeZone,
                            },
                        },
                        clientId: "$clientId",
                    },
                },
            },
            {
                $group: {
                    _id: "$_id.date",
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const attributedPurchases = await getSearchAttribution({ shop, from, to });
    const dailyAttributedMap = new Map();
    const dailyAttributedSessionMap = new Map();

    for (const p of attributedPurchases) {
        const purchaseDay = dateKeyInTimeZone(new Date(p.occurredAt), timeZone);
        dailyAttributedMap.set(purchaseDay, (dailyAttributedMap.get(purchaseDay) || 0) + 1);

        const searchDay = p.search?.occurredAt
            ? dateKeyInTimeZone(new Date(p.search.occurredAt), timeZone)
            : null;
        if (searchDay && p.clientId) {
            if (!dailyAttributedSessionMap.has(searchDay)) {
                dailyAttributedSessionMap.set(searchDay, new Set());
            }
            dailyAttributedSessionMap.get(searchDay).add(p.clientId);
        }
    }

    const dailySearchSessionMap = new Map(
        dailySearchSessions.map((item) => [item._id, item.count])
    );
    const dateMap = new Map();

    for (const item of dailyEvents) {
        const day = item._id.date;
        if (!dateMap.has(day)) {
            dateMap.set(day, {
                date: day,
                searches: 0,
                clicks: 0,
                addToCart: 0,
                purchases: 0,
                attributedPurchases: 0,
                searchSessions: 0,
                conversionRate: 0,
                clickToPurchaseRate: 0,
            });
        }

        const entry = dateMap.get(day);
        if (item._id.eventType === "search") {
            entry.searches = item.count;
        } else if (item._id.eventType === "click" || item._id.eventType === "product_click") {
            entry.clicks += item.count;
        } else if (item._id.eventType === "add_to_cart") {
            entry.addToCart = item.count;
        } else if (item._id.eventType === "purchase") {
            entry.purchases = item.count;
        }
    }

    for (const [day, entry] of dateMap.entries()) {
        entry.attributedPurchases = dailyAttributedMap.get(day) || (entry.purchases > 0 ? entry.purchases : 0);
        entry.searchSessions = dailySearchSessionMap.get(day) || 0;

        const effectivePurchases = Math.max(Number(entry.purchases) || 0, Number(entry.attributedPurchases) || 0);

        entry.conversionRate = entry.searches > 0 && effectivePurchases > 0
            ? Number(((effectivePurchases / entry.searches) * 100).toFixed(1))
            : 0.0;
        entry.clickToPurchaseRate =
            entry.clicks > 0 && effectivePurchases > 0
                ? Number(((effectivePurchases / entry.clicks) * 100).toFixed(1))
                : 0.0;
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get Searched Products:
 * Dynamically returns products connected to actual customer searches.
 *
 * If a `query` filter is provided (e.g. "iphone"), returns ONLY the products
 * returned by that search experience!
 */
export async function getSearchedProducts({
    shop,
    accessToken,
    catalogProducts: suppliedCatalogProducts,
    from,
    to,
    query = null,
    search = "",
    sortBy = "searches_desc",
    page = 1,
    limit = 100,
}) {
    const normalizedTargetQuery = normalizeQuery(query);
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date(now.getTime() + 10 * 60 * 1000);

    // 1. Gather all product interactions directly from SearchEvent
    const eventFilter = {
        shop,
        occurredAt: { $gte: fromDate, $lte: toDate },
    };
    if (normalizedTargetQuery) {
        eventFilter.normalizedQuery = normalizedTargetQuery;
    }

    const events = await SearchEvent.find(eventFilter).lean();
    const productMap = new Map();

    for (const ev of events) {
        const pids = [];
        if (ev.productId) pids.push(String(ev.productId));
        if (Array.isArray(ev.metadata?.lineItems)) {
            for (const item of ev.metadata.lineItems) {
                if (item.productId) pids.push(String(item.productId));
            }
        }
        if (Array.isArray(ev.metadata?.returnedProductIds)) {
            for (const pid of ev.metadata.returnedProductIds) {
                if (pid) pids.push(String(pid));
            }
        }

        for (const pid of pids) {
            if (!productMap.has(pid)) {
                productMap.set(pid, {
                    productId: pid,
                    product: ev.metadata?.productTitle || "",
                    image: null,
                    searches: 0,
                    productClicks: 0,
                    addToCart: 0,
                    purchases: 0,
                    associatedQueries: new Set(),
                });
            }

            const entry = productMap.get(pid);
            if (ev.eventType === "search") {
                entry.searches += 1;
            } else if (ev.eventType === "click" || ev.eventType === "product_click") {
                entry.productClicks += 1;
            } else if (ev.eventType === "add_to_cart") {
                entry.addToCart += 1;
            } else if (
                ev.eventType === "purchase" &&
                ev.metadata?.verifiedOrder === true &&
                ["paid", "partially_refunded", "refunded"].includes(ev.metadata?.status)
            ) {
                entry.purchases += 1;
            }
            if (ev.normalizedQuery) {
                entry.associatedQueries.add(ev.normalizedQuery);
            }
        }
    }

    // 3. Resolve title and image from live Product catalog if missing
    const catalogProducts =
        suppliedCatalogProducts ?? await fetchAllStoreProducts(shop, accessToken);

    for (const p of catalogProducts) {
        const strGid = String(p.shopifyProductId || p.id);
        const numeric = strGid.replace("gid://shopify/Product/", "");

        const entry = productMap.get(strGid) || productMap.get(numeric);
        if (entry) {
            if (!entry.product || entry.product.startsWith("Product #")) {
                entry.product = p.title;
            }
            if (!entry.image && Array.isArray(p.images) && p.images[0]) {
                entry.image = p.images[0].url || p.images[0].src || p.images[0];
            }
        }
    }

    // Also include click counts directly from SearchEvent
    try {
        const clickEvents = await SearchEvent.aggregate([
            {
                $match: {
                    shop,
                    eventType: { $in: ["click", "product_click"] },
                    occurredAt: { $gte: from, $lte: to },
                    productId: { $nin: [null, ""] },
                },
            },
            {
                $group: {
                    _id: "$productId",
                    clicks: { $sum: 1 },
                },
            },
        ]);

        for (const c of clickEvents) {
            const pid = String(c._id);
            const numeric = pid.replace("gid://shopify/Product/", "");
            const entry = productMap.get(pid) || productMap.get(numeric);
            if (entry) {
                entry.productClicks = Math.max(entry.productClicks, c.clicks);
            }
        }
    } catch (err) {
        console.warn("Click aggregation warning:", err.message);
    }

    // Compute unique customers per product
    const queryClientsMap = new Map();
    const directProdClients = new Map();
    try {
        const fromDate = from ? new Date(from) : new Date(0);
        const toDate = to ? new Date(to) : new Date();

        const searchEvents = await SearchEvent.find({
            shop,
            eventType: "search",
            occurredAt: { $gte: fromDate, $lte: toDate },
            clientId: { $nin: [null, ""] },
        }).select("normalizedQuery clientId").lean();

        for (const se of searchEvents) {
            if (!se.normalizedQuery) continue;
            if (!queryClientsMap.has(se.normalizedQuery)) queryClientsMap.set(se.normalizedQuery, new Set());
            queryClientsMap.get(se.normalizedQuery).add(se.clientId);
        }

        const directEvents = await SearchEvent.find({
            shop,
            productId: { $nin: [null, ""] },
            occurredAt: { $gte: fromDate, $lte: toDate },
            clientId: { $nin: [null, ""] },
        }).select("productId clientId").lean();

        for (const de of directEvents) {
            const pid = String(de.productId);
            const num = pid.replace("gid://shopify/Product/", "");
            if (!directProdClients.has(pid)) directProdClients.set(pid, new Set());
            if (!directProdClients.has(num)) directProdClients.set(num, new Set());
            directProdClients.get(pid).add(de.clientId);
            directProdClients.get(num).add(de.clientId);
        }
    } catch (err) {
        console.warn("Unique customers calculation warning:", err.message);
    }

    // Format list
    let list = Array.from(productMap.values()).map((item) => {
        const clicks = item.productClicks || 0;
        const purchases = item.purchases || 0;
        const clickToPurchaseRate =
            clicks > 0 ? Number(((purchases / clicks) * 100).toFixed(1)) : 0.0;

        const pid = String(item.productId);
        const num = pid.replace("gid://shopify/Product/", "");
        const custSet = new Set(directProdClients.get(pid) || directProdClients.get(num) || []);
        for (const q of item.associatedQueries) {
            const qClients = queryClientsMap.get(q);
            if (qClients) {
                for (const c of qClients) custSet.add(c);
            }
        }
        const uniqueCustomers = custSet.size || (item.searches > 0 ? 1 : 0);

        return {
            productId: item.productId,
            product: item.product || `Product #${item.productId.replace("gid://shopify/Product/", "")}`,
            image: item.image,
            uniqueCustomers,
            searches: item.searches,
            productClicks: clicks,
            addToCart: item.addToCart || 0,
            purchases,
            clickToPurchaseRate,
            associatedQueries: Array.from(item.associatedQueries),
        };
    });

    // 4. Text Search filter within searched products
    if (search && search.trim()) {
        const s = search.toLowerCase().trim();
        list = list.filter((p) => p.product.toLowerCase().includes(s));
    }

    // 5. Sorting
    list.sort((a, b) => {
        if (sortBy === "searches_asc") return a.searches - b.searches;
        if (sortBy === "clicks_desc") return b.productClicks - a.productClicks;
        if (sortBy === "purchases_desc") return b.purchases - a.purchases;
        if (sortBy === "rate_desc") return b.clickToPurchaseRate - a.clickToPurchaseRate;
        if (sortBy === "title_asc") return a.product.localeCompare(b.product);
        // Default searches_desc
        return b.searches - a.searches || b.purchases - a.purchases || b.productClicks - a.productClicks;
    });

    if (limit && Number(limit) > 0) {
        const pageNum = Math.max(Number(page) || 1, 1);
        const pageSize = Number(limit);
        const start = (pageNum - 1) * pageSize;
        return list.slice(start, start + pageSize);
    }

    return list;
}

/**
 * Get product analytics for "All Products" catalog with real search data.
 */
export async function getProductAnalytics({ shop, accessToken, from, to, limit = 100 }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);

    // Fetch live store catalog directly from Shopify GraphQL (not MongoDB)
    const catalogProducts = await fetchAllStoreProducts(shop, accessToken);

    // Get searched products metrics
    const searchedProducts = await getSearchedProducts({
        shop,
        accessToken,
        catalogProducts,
        from,
        to,
    });
    const searchedMap = new Map();
    for (const sp of searchedProducts) {
        searchedMap.set(String(sp.productId), sp);
        const numeric = String(sp.productId).replace("gid://shopify/Product/", "");
        searchedMap.set(numeric, sp);
    }

    const results = [];

    if (catalogProducts && catalogProducts.length > 0) {
        for (const p of catalogProducts) {
            const strGid = String(p.shopifyProductId || p.id);
            const numeric = strGid.replace("gid://shopify/Product/", "");
            const sp = searchedMap.get(strGid) || searchedMap.get(numeric);

            const searches = sp ? sp.searches : 0;
            const clicks = sp ? sp.productClicks : 0;
            const addToCart = sp ? sp.addToCart : 0;
            const purchases = sp ? sp.purchases : 0;
            const clickToPurchaseRate = sp ? sp.clickToPurchaseRate : 0.0;
            const convRate = searches > 0 ? Number(((purchases / searches) * 100).toFixed(1)) : 0.0;
            const uniqueCustomers = sp ? (sp.uniqueCustomers || (sp.searches > 0 ? 1 : 0)) : 0;

            results.push({
                productId: strGid,
                product: p.title,
                image: Array.isArray(p.images) && p.images[0] ? (p.images[0].url || p.images[0].src || p.images[0]) : null,
                uniqueCustomers,
                searches,
                productClicks: clicks,
                addToCart,
                purchases,
                conversionRate: convRate,
                clickToPurchaseRate,
                status: p.status || "ACTIVE",
            });
        }
    } else {
        // Fallback: populate from searched products directly
        for (const sp of searchedProducts) {
            results.push({
                productId: sp.productId,
                product: sp.product || sp.title || "Product",
                image: sp.image || null,
                uniqueCustomers: sp.uniqueCustomers || (sp.searches > 0 ? 1 : 0),
                searches: sp.searches || 0,
                productClicks: sp.productClicks || 0,
                addToCart: sp.addToCart || 0,
                purchases: sp.purchases || 0,
                conversionRate: sp.conversionRate || 0,
                clickToPurchaseRate: sp.clickToPurchaseRate || 0,
                status: "ACTIVE",
            });
        }
    }

    // Sort by searches desc
    results.sort((a, b) => b.searches - a.searches || b.productClicks - a.productClicks);

    return results.slice(0, safeLimit);
}
