import Collection from "../models/Collection.js";
import SearchEvent from "../models/searchEvent.model.js";
import { fetchAllStoreProducts } from "./productSyncService.js";

/**
 * Normalizes Shopify Product IDs to a numeric string.
 *
 * Example:
 * "gid://shopify/Product/7634929811543" -> "7634929811543"
 * "7634929811543"                      -> "7634929811543"
 */
export const normalizeShopifyProductId = (id) => {
    if (!id) return "";
    const str = String(id).trim();
    const match = str.match(/Product\/(\d+)/i);
    if (match) return match[1];
    return str.replace(/\D/g, "") || str;
};

/**
 * Ensures a standard Shopify Product GID string format.
 *
 * Example:
 * "7634929811543"                      -> "gid://shopify/Product/7634929811543"
 * "gid://shopify/Product/7634929811543" -> "gid://shopify/Product/7634929811543"
 */
export const formatShopifyProductGid = (id) => {
    if (!id) return "";
    const str = String(id).trim();
    if (str.startsWith("gid://shopify/Product/")) return str;
    const norm = normalizeShopifyProductId(str);
    return norm ? `gid://shopify/Product/${norm}` : str;
};

/**
 * Clamps numeric values between min and max.
 */
const clamp = (value, min = 0, max = 100) => {
    if (isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
};

/**
 * Smooth logarithmic normalization for count-based metrics.
 * Prevents a single high-count product (e.g. 100 searches or purchases) from
 * driving every other product to a score of 0.
 */
export const logNormalize = (value, maximum) => {
    if (!value || value <= 0 || !maximum || maximum <= 0 || isNaN(value)) {
        return 0;
    }
    if (value >= maximum) return 100;
    const score = (Math.log1p(value) / Math.log1p(maximum)) * 100;
    return clamp(score);
};

/**
 * Collection placement scoring signal (0-100).
 * Placement in collections is a structural merchandising signal.
 * - 0 collections: 0
 * - 1 collection:  50
 * - 2 collections: 75
 * - 3+ collections: 100
 */
export const normalizeCollectionScore = (count) => {
    if (!count || count <= 0) return 0;
    if (count === 1) return 50;
    if (count === 2) return 75;
    return 100;
};

/**
 * Determines merchant-friendly status:
 * 80-100 = easy (Easy to Find)
 * 60-79  = needs_improvement (Needs Improvement)
 * 0-59   = hard_to_find (Hard to Find)
 */
export const getStatus = (score) => {
    if (score >= 80) return "easy";
    if (score >= 60) return "needs_improvement";
    return "hard_to_find";
};

/**
 * Splits text into significant search tokens (lowercase, min 2 chars).
 */
const extractTokens = (text) => {
    if (!text || typeof text !== "string") return [];
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2);
};

/**
 * Calculates discoverability scores from Shopify's live product catalog
 * and real customer storefront analytics within the requested date range.
 *
 * @param {Object} options
 * @param {string} options.shop - Shopify domain (e.g. promobile-hub.myshopify.com)
 * @param {string} [options.accessToken] - Shopify OAuth access token
 * @param {string|Date} [options.from] - Date boundary start (defaults to 30 days ago)
 * @param {string|Date} [options.to] - Date boundary end (defaults to now)
 */
export const calculateProductDiscoverability = async ({
    shop,
    accessToken,
    from,
    to,
}) => {
    if (!shop) {
        throw new Error("Shop domain is required");
    }

    const normalizedShop = shop.toLowerCase().trim();
    const shopRegex = new RegExp(`^${normalizedShop}$`, "i");

    // 1. Establish date range boundaries (properly supporting Last 30 days, 7 days, Today, etc.)
    const now = new Date();
    const fromDate = from
        ? new Date(from)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date(now.getTime() + 10 * 60 * 1000);

    // 2. Fetch live store catalog directly from Shopify Admin GraphQL
    const products = await fetchAllStoreProducts(normalizedShop, accessToken);

    if (!products || products.length === 0) {
        return [];
    }

    // 3. Build multi-key product lookup dictionaries (numeric ID, GID, handle, and normalized title)
    const normIdToProduct = new Map();
    const titleToNormId = new Map();
    const handleToNormId = new Map();
    const productTokensMap = new Map(); // normId -> Set of lowercase tokens

    for (const p of products) {
        const norm = normalizeShopifyProductId(p.shopifyProductId || p.id);
        if (!norm) continue;

        normIdToProduct.set(norm, p);
        if (p.title) {
            titleToNormId.set(p.title.toLowerCase().trim(), norm);
        }
        if (p.handle) {
            handleToNormId.set(p.handle.toLowerCase().trim(), norm);
        }

        // Tokenize title, vendor, tags for query matching
        const tokenSet = new Set([
            ...extractTokens(p.title),
            ...extractTokens(p.vendor),
            ...extractTokens(p.productType),
            ...(Array.isArray(p.tags) ? p.tags.flatMap(extractTokens) : []),
        ]);
        productTokensMap.set(norm, tokenSet);
    }

    // 4. Load real Shopify collections from MongoDB tbl_collections
    const collections = await Collection.find({
        shop: { $regex: shopRegex },
    }).lean();

    const collectionCounts = {};
    for (const coll of collections) {
        if (Array.isArray(coll.productIds)) {
            for (const rawPid of coll.productIds) {
                const normPid = normalizeShopifyProductId(rawPid);
                if (normPid) {
                    collectionCounts[normPid] = (collectionCounts[normPid] || 0) + 1;
                }
            }
        }
    }

    // 5. Load real customer events within the requested date window
    const events = await SearchEvent.find({
        shop: { $regex: shopRegex },
        occurredAt: { $gte: fromDate, $lte: toDate },
    }).lean();

    const eventViews = new Map();
    const eventClicks = new Map();
    const eventAddToCart = new Map();
    const eventPurchases = new Map();
    const prodQueryAppearances = new Map(); // normPid -> Map of (query -> appearanceCount)

    for (const ev of events) {
        let directNormId = normalizeShopifyProductId(ev.productId);
        if (!directNormId && ev.metadata?.productTitle) {
            directNormId = titleToNormId.get(ev.metadata.productTitle.toLowerCase().trim());
        }
        if (!directNormId && ev.metadata?.handle) {
            directNormId = handleToNormId.get(ev.metadata.handle.toLowerCase().trim());
        }

        const eventType = (ev.eventType || "").toLowerCase();
        const eventName = (ev.eventName || "").toLowerCase();

        // 5a. Product Views
        if (
            eventType === "product_view" ||
            eventType === "view" ||
            eventName === "product_viewed"
        ) {
            if (directNormId) {
                eventViews.set(directNormId, (eventViews.get(directNormId) || 0) + 1);
            }
        }
        // 5b. Product Clicks
        else if (
            eventType === "click" ||
            eventName === "search_result_clicked" ||
            eventName === "product_clicked"
        ) {
            if (directNormId) {
                eventClicks.set(directNormId, (eventClicks.get(directNormId) || 0) + 1);
            }
        }
        // 5c. Add to Cart
        else if (
            eventType === "add_to_cart" ||
            eventName === "product_added_to_cart" ||
            eventName === "add_to_cart_clicked"
        ) {
            if (directNormId) {
                eventAddToCart.set(directNormId, (eventAddToCart.get(directNormId) || 0) + 1);
            }
        }
        // 5d. Purchases / Conversions
        else if (
            eventType === "purchase" ||
            eventName === "checkout_completed"
        ) {
            const lineItems = ev.metadata?.lineItems;
            if (Array.isArray(lineItems) && lineItems.length > 0) {
                for (const item of lineItems) {
                    let itemPid = normalizeShopifyProductId(item.productId);
                    if (!itemPid && item.title) {
                        itemPid = titleToNormId.get(item.title.toLowerCase().trim());
                    }
                    const qty = Math.max(1, Number(item.quantity) || 1);
                    if (itemPid) {
                        eventPurchases.set(itemPid, (eventPurchases.get(itemPid) || 0) + qty);
                    }
                }
            } else if (directNormId) {
                eventPurchases.set(directNormId, (eventPurchases.get(directNormId) || 0) + 1);
            }
        }
        // 5e. Search Visibility & Impressions
        else if (
            eventType === "search" ||
            eventName === "search_submitted" ||
            eventName === "search_input_submitted"
        ) {
            const pids = new Set();
            if (directNormId) pids.add(directNormId);

            if (Array.isArray(ev.metadata?.returnedProductIds)) {
                for (const rpid of ev.metadata.returnedProductIds) {
                    const normRpid = normalizeShopifyProductId(rpid);
                    if (normRpid) pids.add(normRpid);
                }
            }
            if (Array.isArray(ev.metadata?.returnedProducts)) {
                for (const rp of ev.metadata.returnedProducts) {
                    const normRpid = normalizeShopifyProductId(rp.id || rp.productId);
                    if (normRpid) pids.add(normRpid);
                }
            }

            // Fallback for search queries without explicit returnedProductIds:
            // Match search keywords against catalog product tokens (e.g. "iphone", "vivo", "realme")
            const q = (ev.normalizedQuery || ev.query || "").toLowerCase().trim();
            if (pids.size === 0 && q) {
                const queryTokens = extractTokens(q);
                if (queryTokens.length > 0) {
                    for (const [normPid, tokenSet] of productTokensMap.entries()) {
                        // Match if all query words or significant brand/model words appear in product tokens
                        const matchedTokens = queryTokens.filter((qt) => tokenSet.has(qt));
                        const isMatch =
                            matchedTokens.length === queryTokens.length ||
                            (queryTokens.length > 1 && matchedTokens.length >= 2) ||
                            (queryTokens.length === 1 && tokenSet.has(queryTokens[0]));

                        if (isMatch) {
                            pids.add(normPid);
                        }
                    }
                }
            }

            const qLabel = q || "default";
            for (const pid of pids) {
                if (!prodQueryAppearances.has(pid)) {
                    prodQueryAppearances.set(pid, new Map());
                }
                const qMap = prodQueryAppearances.get(pid);
                qMap.set(qLabel, (qMap.get(qLabel) || 0) + 1);
            }
        }
    }

    // 6. Combine metrics per catalog product
    const rawProducts = products.map((p) => {
        const normId = normalizeShopifyProductId(p.shopifyProductId || p.id);

        let searchVisibility = 0;
        if (prodQueryAppearances.has(normId)) {
            for (const count of prodQueryAppearances.get(normId).values()) {
                searchVisibility += count;
            }
        }

        const directViews = eventViews.get(normId) || 0;
        const clicks = eventClicks.get(normId) || 0;
        const purchases = eventPurchases.get(normId) || 0;
        const addToCart = eventAddToCart.get(normId) || 0;
        const collectionCount = collectionCounts[normId] || 0;

        // Logical view attribution: Viewing is a prerequisite for clicking or purchasing
        const views = Math.max(directViews, clicks + purchases);

        return {
            productId: formatShopifyProductGid(p.shopifyProductId || p.id),
            productTitle: p.title || "Untitled Product",
            productHandle: p.handle || "",
            vendor: p.vendor || "",
            productStatus: p.status || null,
            featuredImage: p.featuredImage || null,
            totalInventory: p.totalInventory ?? null,
            searchVisibility,
            views,
            clicks,
            addToCart,
            purchases,
            collectionCount,
        };
    });

    // 7. Store maximums for normalization
    const maxSearchVisibility = Math.max(0, ...rawProducts.map((p) => p.searchVisibility));
    const maxViews = Math.max(0, ...rawProducts.map((p) => p.views));
    const maxClicks = Math.max(0, ...rawProducts.map((p) => p.clicks));
    const maxAddToCart = Math.max(0, ...rawProducts.map((p) => p.addToCart));
    const maxPurchases = Math.max(0, ...rawProducts.map((p) => p.purchases));

    // 8. Balanced Scoring Weights
    // Base signal weights:
    // Search Visibility: 25%, Views: 20%, Clicks: 15%, Collections: 15%, Add to Cart: 15%, Purchases: 10%
    const baseWeights = {
        searchVisibility: 0.25,
        views: 0.20,
        clicks: 0.15,
        collectionPlacement: 0.15,
        addToCart: 0.15,
        purchases: 0.10,
    };

    // Calculate active weights: If a signal has zero activity storewide (e.g. no views tracked yet),
    // redistribute its weight proportionally across active signals so catalog products aren't penalized.
    const hasData = {
        searchVisibility: maxSearchVisibility > 0,
        views: maxViews > 0,
        clicks: maxClicks > 0,
        collectionPlacement: Object.keys(collectionCounts).length > 0,
        addToCart: maxAddToCart > 0,
        purchases: maxPurchases > 0,
    };

    let totalActiveBaseWeight = 0;
    for (const [key, active] of Object.entries(hasData)) {
        if (active) {
            totalActiveBaseWeight += baseWeights[key];
        }
    }

    const effectiveWeights = {};
    for (const [key, baseW] of Object.entries(baseWeights)) {
        if (totalActiveBaseWeight > 0 && hasData[key]) {
            effectiveWeights[key] = baseW / totalActiveBaseWeight;
        } else {
            effectiveWeights[key] = baseW;
        }
    }

    // 9. Calculate individual signal scores (0-100) and composite discoverability score
    const records = rawProducts.map((product) => {
        const searchVisibilityScore = logNormalize(product.searchVisibility, maxSearchVisibility);
        const viewsScore = logNormalize(product.views, maxViews);
        const clicksScore = logNormalize(product.clicks, maxClicks);
        const collectionPlacementScore = normalizeCollectionScore(product.collectionCount);
        const addToCartScore = logNormalize(product.addToCart, maxAddToCart);
        const purchasesScore = logNormalize(product.purchases, maxPurchases);

        const compositeScore =
            searchVisibilityScore * effectiveWeights.searchVisibility +
            viewsScore * effectiveWeights.views +
            clicksScore * effectiveWeights.clicks +
            collectionPlacementScore * effectiveWeights.collectionPlacement +
            addToCartScore * effectiveWeights.addToCart +
            purchasesScore * effectiveWeights.purchases;

        const discoverabilityScore = Math.round(clamp(compositeScore));
        const discoverabilityStatus = getStatus(discoverabilityScore);

        return {
            shop: normalizedShop,
            productId: product.productId,
            productTitle: product.productTitle,
            productHandle: product.productHandle,
            vendor: product.vendor,
            productStatus: product.productStatus,
            featuredImage: product.featuredImage,
            totalInventory: product.totalInventory,

            searchVisibility: product.searchVisibility,
            views: product.views,
            clicks: product.clicks,
            addToCart: product.addToCart,
            purchases: product.purchases,
            collectionCount: product.collectionCount,

            searchVisibilityScore: Math.round(searchVisibilityScore),
            viewsScore: Math.round(viewsScore),
            clicksScore: Math.round(clicksScore),
            collectionPlacementScore: Math.round(collectionPlacementScore),
            addToCartScore: Math.round(addToCartScore),
            purchasesScore: Math.round(purchasesScore),

            discoverabilityScore,
            discoverabilityStatus,

            calculatedAt: now,
        };
    });

    return records;
};

export default {
    calculateProductDiscoverability,
    normalizeShopifyProductId,
    formatShopifyProductGid,
    logNormalize,
    normalizeCollectionScore,
    getStatus,
};