          import {
    recordSearch,
    recordProductClick,
    recordAddToCart,
    recordPurchase,
    recordProductView,        
    getSearchSummary,
    getPopularQueries,
    getSearchTrends,
    getProductAnalytics,
    getSearchedProducts,
    getSearchConversionRate,
} from "../services/searchIntelligence.service.js";
import Collection from "../models/Collection.js";
import MerchandisingEvent from "../models/MerchandisingEvent.js";
import Product from "../models/Product.js";
import Subscription from "../models/Subscription.js";
import { LIMIT_KEYS, getPlanLimit } from "../config/billingPlans.js";
import {
    normalizeEventPayload,
    SearchEventValidationError,
} from "../utils/searchIntelligenceEvent.js";

/**
 * Validate and parse date range from request query parameters.
 * Defaults to the last 30 days if not provided.
 */
function parseDateRange(req) {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let from = defaultFrom;
    let to = now;

    if (req.query.from) {
        from = new Date(req.query.from);
        if (Number.isNaN(from.getTime())) {
            const err = new Error("Invalid 'from' date format. Please supply a valid ISO date string.");
            err.statusCode = 400;
            throw err;
        }
    }

    if (req.query.to) {
        to = new Date(req.query.to);
        if (Number.isNaN(to.getTime())) {
            const err = new Error("Invalid 'to' date format. Please supply a valid ISO date string.");
            err.statusCode = 400;
            throw err;
        }
    }

    if (from.getTime() > to.getTime()) {
        const err = new Error("'from' date must be before or equal to 'to'.");
        err.statusCode = 400;
        throw err;
    }

    return { from, to };
}

/**
 * Resolve shop domain from request.
 */
function getShop(req) {
    if (typeof req.shop === "string") {
        return req.shop;
    }

    if (req.shop && typeof req.shop === "object") {
        return (
            req.shop.shop ||
            req.shop.shopDomain ||
            req.shop.domain ||
            req.shop.myshopifyDomain ||
            null
        );
    }

    return (
        req.headers["x-shopify-shop-domain"] ||
        req.headers["x-shop-domain"] ||
        req.query?.shop ||
        null
    );
}

/**
 * POST /api/search-intelligence/events
 * Public ingestion endpoint for Shopify Web Pixel and storefront events.
 */
export async function ingestEvent(req, res) {
    try {
        const {
            shop: normalizedShop,
            eventId,
            eventName,
            eventType,
            eventData,
            clientId,
            occurredAt,
        } = normalizeEventPayload(req.body, req.verifiedShop);

        if (eventName === "collection_viewed" || eventName === "collection_view") {
            const collectionId =
                eventData.collectionId || eventData.collection?.id || null;
            const collection = collectionId
                ? await Collection.findOne({
                      shop: normalizedShop,
                      shopifyCollectionId: collectionId,
                  })
                      .select("shopifyCollectionId")
                      .lean()
                : null;

            if (!collection) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: "Collection is not available in the synced catalog.",
                });
            }

            await MerchandisingEvent.findOneAndUpdate(
                {
                    shop: normalizedShop,
                    eventType: "collection_view",
                    "metadata.sourceEventId": eventId,
                },
                {
                    $setOnInsert: {
                        shop: normalizedShop,
                        eventType: "collection_view",
                        collectionId: collection.shopifyCollectionId,
                        sessionId: clientId,
                        occurredAt,
                        metadata: { source: "shopify_web_pixel", sourceEventId: eventId },
                    },
                },
                { upsert: true, new: true }
            );

            return res.status(201).json({
                success: true,
                eventType: "collection_view",
            });
        }

        // 1. SEARCH SUBMITTED
        if (
            eventName === "search_submitted" ||
            eventName === "search_input_submitted" ||
            eventName === "search" ||
            eventName === "search_query"
        ) {
            const query =
                eventData.query ||
                eventData.searchQuery ||
                eventData.searchResult?.query ||
                null;

            if (!query || !query.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Search query is required",
                });
            }

            const returnedProducts =
                eventData.returnedProducts ||
                eventData.products ||
                eventData.searchResult?.products ||
                (Array.isArray(eventData.returnedProductIds)
                    ? eventData.returnedProductIds.map((id) => ({ id }))
                    : null);
            const resultCount = Number.isInteger(eventData.resultCount)
                ? eventData.resultCount
                : Number.isInteger(eventData.resultsCount)
                  ? eventData.resultsCount
                  : Array.isArray(returnedProducts)
                    ? returnedProducts.length
                    : null;

            const result = await recordSearch({
                shop: normalizedShop,
                eventId,
                clientId,
                query,
                occurredAt,
                returnedProducts,
                resultCount,
                metadata: { eventName },
            });

            return res.status(201).json({
                success: true,
                eventType: "search",
                data: result,
            });
        }

        // 2. SEARCH RESULT CLICKED / PRODUCT CLICKED
        if (eventName === "collection_product_clicked") {
            const collectionId = eventData.collectionId;
            const collectionHandle = eventData.collectionHandle;
            const productHandle = eventData.productHandle;
            if (
                typeof productHandle !== "string" ||
                !productHandle ||
                (!collectionId && !collectionHandle)
            ) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: "Collection and product details are required to record this click.",
                });
            }
            const collectionFilter = collectionId
                ? { shop: normalizedShop, shopifyCollectionId: collectionId }
                : { shop: normalizedShop, handle: collectionHandle };
            const [collection, product] = await Promise.all([
                Collection.findOne(collectionFilter)
                    .select("shopifyCollectionId productIds")
                    .lean(),
                Product.findOne({ shop: normalizedShop, handle: productHandle })
                    .select("shopifyProductId")
                    .lean(),
            ]);

            if (
                !collection ||
                !product ||
                !collection.productIds?.some(
                    (productId) =>
                        String(productId).split("/").pop() ===
                        String(product.shopifyProductId).split("/").pop()
                )
            ) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: "The clicked product is not in the synced collection.",
                });
            }

            await MerchandisingEvent.findOneAndUpdate(
                {
                    shop: normalizedShop,
                    eventType: "product_click",
                    "metadata.sourceEventId": eventId,
                },
                {
                    $setOnInsert: {
                        shop: normalizedShop,
                        eventType: "product_click",
                        collectionId: collection.shopifyCollectionId,
                        productId: product.shopifyProductId,
                        sessionId: clientId,
                        occurredAt,
                        metadata: { source: "storefront_collection", sourceEventId: eventId },
                    },
                },
                { upsert: true, new: true }
            );

            return res.status(201).json({
                success: true,
                eventType: "product_click",
            });
        }

        if (
            eventName === "search_result_clicked" ||
            eventName === "product_clicked" ||
            eventName === "click" ||
            eventName === "product_click"
        ) {
            const productId =
                eventData.productId || eventData.product?.id || null;
            const variantId =
                eventData.variantId || eventData.variant?.id || null;
            const query =
                eventData.query ||
                eventData.searchQuery ||
                eventData.searchResult?.query ||
                null;
            const queryId = eventData.queryId || eventData.searchId || null;
            const productTitle =
                eventData.title ||
                eventData.productTitle ||
                eventData.product?.title ||
                null;

            const savedEvent = await recordProductClick({
                shop: normalizedShop,
                eventId,
                clientId,
                query,
                queryId,
                productId,
                variantId,
                occurredAt,
                metadata: { eventName, productTitle },
            });

            return res.status(201).json({
                success: true,
                eventType: "click",
                data: savedEvent,
            });
        }

        // 3. PRODUCT ADDED TO CART
        if (
            eventName === "product_added_to_cart" ||
            eventName === "add_to_cart_clicked" ||
            eventName === "add_to_cart" ||
            eventName === "cart_add"
        ) {
            const productId =
                eventData.productId ||
                eventData.product?.id ||
                eventData.productVariant?.product?.id ||
                eventData.cartLine?.merchandise?.product?.id ||
                null;
            const variantId =
                eventData.variantId ||
                eventData.variant?.id ||
                eventData.productVariant?.id ||
                eventData.cartLine?.merchandise?.id ||
                null;
            const query =
                eventData.query ||
                eventData.searchQuery ||
                eventData.searchResult?.query ||
                null;
            const queryId = eventData.queryId || eventData.searchId || null;
            const productTitle =
                eventData.title ||
                eventData.productTitle ||
                eventData.product?.title ||
                eventData.cartLine?.merchandise?.product?.title ||
                null;

            const savedEvent = await recordAddToCart({
                shop: normalizedShop,
                eventId,
                clientId,
                query,
                queryId,
                productId,
                variantId,
                occurredAt,
                metadata: { eventName, productTitle },
            });

            return res.status(201).json({
                success: true,
                eventType: "add_to_cart",
                data: savedEvent,
            });
        }

        // 4. CHECKOUT COMPLETED (PURCHASE)
        if (
            eventType === "purchase" ||
            eventType === "order_created" ||
            eventType === "order_paid" ||
            eventType === "order_updated" ||
            eventType === "order_cancelled" ||
            eventType === "order_refunded"
        ) {
            const checkout = eventData.checkout || {};
            const orderId = String(checkout.order?.id || eventData.orderId);
            const rawValue = checkout.totalPrice?.amount ?? eventData.value;
            const value =
                rawValue === undefined || rawValue === null
                    ? undefined
                    : Number(rawValue);
            const currency =
                checkout.totalPrice?.currencyCode ||
                checkout.currencyCode ||
                eventData.currency ||
                null;
            const lineItems =
                eventData.lineItems ||
                checkout.lineItems?.map((item) => ({
                    productId: item.variant?.product?.id || item.productId,
                    variantId: item.variant?.id || item.variantId,
                    title: item.title,
                    quantity: item.quantity,
                })) ||
                [];

            const savedEvent = await recordPurchase({
                shop: normalizedShop,
                eventId,
                clientId,
                orderId,
                value,
                currency,
                occurredAt,
                verifiedOrder:
                    Boolean(req.isInternalEvent && eventData.source === "shopify_webhook") ||
                    eventData.source === "shopify_web_pixel" ||
                    Boolean(checkout.order?.id || eventData.orderId),
                orderStatus:
                    eventData.orderStatus ||
                    (eventData.source === "shopify_web_pixel" ? "paid" : undefined) ||
                    (eventType === "order_cancelled"
                        ? "cancelled"
                        : eventType === "order_refunded"
                          ? "refunded"
                          : eventType === "order_paid"
                            ? "paid"
                            : "paid"),
                metadata: {
                    eventName,
                    lineItems,
                    source: eventData.source || "app_proxy",
                    refundEventId:
                        eventType === "order_refunded" ? eventData.refundEventId || eventId : null,
                    refundAmount:
                        eventType === "order_refunded" ? Number(eventData.refundAmount) || 0 : undefined,
                },
            });

            const productIds = [
                ...new Set(
                    lineItems
                        .map((item) => item.productId)
                        .filter((productId) => typeof productId === "string" && productId)
                ),
            ];
            if (eventType === "purchase" && productIds.length > 0) {
                const productIdAliases = [
                    ...new Set([
                        ...productIds,
                        ...productIds.map((productId) => productId.split("/").pop()),
                    ]),
                ];
                const collections = await Collection.find({
                    shop: normalizedShop,
                    productIds: { $in: productIdAliases },
                })
                    .select("shopifyCollectionId productIds")
                    .lean();

                for (const productId of productIds) {
                    for (const collection of collections) {
                        const normalizedProductId = productId.split("/").pop();
                        if (
                            !collection.productIds.some(
                                (collectionProductId) =>
                                    String(collectionProductId).split("/").pop() ===
                                    normalizedProductId
                            )
                        ) {
                            continue;
                        }

                        const purchaseFilter = {
                            shop: normalizedShop,
                            eventType: "purchase",
                            collectionId: collection.shopifyCollectionId,       
                            productId,
                        };
                        if (orderId) {
                            purchaseFilter.orderId = orderId;
                        } else {
                            purchaseFilter["metadata.sourceEventId"] = eventId;
                        }

                        const lineItem = lineItems.find((item) => item.productId === productId);
                        const quantity = Number(lineItem?.quantity);
                        await MerchandisingEvent.findOneAndUpdate(
                            purchaseFilter,
                            {
                                $setOnInsert: {
                                    shop: normalizedShop,
                                    eventType: "purchase",
                                    collectionId: collection.shopifyCollectionId,
                                    productId,
                                    orderId,
                                    sessionId: clientId,
                                    quantity:
                                        Number.isFinite(quantity) && quantity >= 1
                                            ? quantity
                                            : 1,
                                    occurredAt,
                                    metadata: {
                                        source: "shopify_web_pixel",
                                        sourceEventId: eventId,
                                    },
                                },
                            },
                            { upsert: true, new: true }
                        );
                    }
                }
            }

            return res.status(201).json({
                success: true,
                eventType: "purchase",
                data: savedEvent,
            });
        }

        // 5. PRODUCT VIEWED
        if (
            eventName === "product_viewed" ||
            eventName === "product_view" ||
            eventName === "view" ||
            eventName === "collection_product_viewed"
        ) {
            const productId =
                eventData.productId ||
                eventData.product?.id ||
                eventData.productVariant?.product?.id ||
                null;
            const variantId =
                eventData.variantId ||
                eventData.variant?.id ||
                eventData.productVariant?.id ||
                null;
            const productTitle =
                eventData.title ||
                eventData.productTitle ||
                eventData.product?.title ||
                eventData.productVariant?.product?.title ||
                null;

            const savedEvent = await recordProductView({
                shop: normalizedShop,
                eventId,
                clientId,
                productId,
                variantId,
                occurredAt,
                metadata: { eventName, productTitle },
            });

            return res.status(201).json({
                success: true,
                eventType: "product_view",
                data: savedEvent,
            });
        }

        return res.status(400).json({
            success: false,
            message: `Unsupported event: ${eventName}`,
        });
    } catch (error) {
        if (error instanceof SearchEventValidationError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error("Search event ingestion error:", {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            stack: error?.stack,
        });
        return res.status(500).json({
            success: false,
            message: "Failed to record search event",
        });
    }
}

/**
 * GET /api/search-intelligence/summary
 */
export async function getSummary(req, res) {
    try {
        const shop = getShop(req);
        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const { from, to } = parseDateRange(req);

        // Keep orders in sync so newly placed orders appear immediately
        import("../services/orderSyncService.js").then(({ syncOrders }) => {
            syncOrders(shop, null, { since: new Date(Date.now() - 24 * 60 * 60 * 1000) }).catch(() => {});
        }).catch(() => {});

        const summary = await getSearchSummary({ shop, from, to });

        return res.status(200).json({
            success: true,
            data: {
                summary,
                ...summary,
            },
        });
    } catch (error) {
        console.error("Search intelligence summary error:", error);
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to load search summary",
        });
    }
}

/**
 * GET /api/search-intelligence/queries
 */
export async function getQueries(req, res) {
    try {
        const shop = getShop(req);
        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const { from, to } = parseDateRange(req);
        const limit = Number(req.query.limit) || 50;

        const queries = await getPopularQueries({ shop, from, to, limit });

        return res.status(200).json({
            success: true,
            data: queries,
        });
    } catch (error) {
        console.error("Search intelligence queries error:", error);
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to load popular queries",
        });
    }
}

/**
 * GET /api/search-intelligence/searched-products
 * Returns products connected to real customer searches with engagement metrics.
 */
export async function getSearchedProductsController(req, res) {
    try {
        const shop = getShop(req);
        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const subscription = await Subscription.getOrCreateForShop(shop);
        const planId = subscription.isActive() ? subscription.plan : "free";
        const planLimit = getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS);

        const { from, to } = parseDateRange(req);
        const query = req.query.query || null;
        const search = req.query.search || "";
        const sortBy = req.query.sortBy || req.query.sort || "searches_desc";
        const page = Number(req.query.page) || 1;
        const requestedLimit = Number(req.query.limit) || 100;
        const queryLimit = planLimit !== null ? Math.min(requestedLimit, planLimit) : requestedLimit;

        const rawProducts = await getSearchedProducts({
            shop,
            accessToken: req.accessToken,
            from,
            to,
            query,
            search,
            sortBy,
            page,
            limit: queryLimit,
        });

        const isArray = Array.isArray(rawProducts);
        const list = isArray ? rawProducts : (rawProducts?.products || []);
        const totalAvailable = list.length;
        const products = planLimit !== null ? list.slice(0, planLimit) : list;
        const finalData = isArray ? products : { ...rawProducts, products };

        return res.status(200).json({
            success: true,
            plan: planId,
            meta: {
                total: products.length,
                totalAvailable,
                planLimit,
                isLimitedByPlan: planLimit !== null && totalAvailable > planLimit,
                upgradeRequired: planLimit !== null && totalAvailable >= planLimit,
            },
            data: finalData,
        });
    } catch (error) {
        console.error("Search intelligence searched-products error:", error);
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to load searched products",
        });
    }
}

/**
 * GET /api/search-intelligence/trends
 */
export async function getTrends(req, res) {
    try {
        const shop = getShop(req);
        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const subscription = await Subscription.getOrCreateForShop(shop);
        const planId = subscription.isActive() ? subscription.plan : "free";
        const planLimit = getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_TRENDS);

        const { from, to } = parseDateRange(req);
        const timeZone = req.query.timezone || "UTC";
        try {
            new Intl.DateTimeFormat("en-US", { timeZone });
        } catch {
            const err = new Error("Invalid 'timezone' value. Supply a valid IANA time zone.");
            err.statusCode = 400;
            throw err;
        }

        // Keep orders in sync so newly placed orders appear immediately
        import("../services/orderSyncService.js").then(({ syncOrders }) => {
            syncOrders(shop, null, { since: new Date(Date.now() - 24 * 60 * 60 * 1000) }).catch(() => {});
        }).catch(() => {});

        const allTrends = await getSearchTrends({ shop, from, to, timeZone });

        const totalAvailable = Array.isArray(allTrends) ? allTrends.length : 0;
        // Take the most recent trends up to the plan limit (e.g. latest 5 trends for Free, latest 25 for Pro)
        const trends = planLimit !== null && Array.isArray(allTrends)
            ? allTrends.slice(-planLimit)
            : allTrends;

        return res.status(200).json({
            success: true,
            plan: planId,
            meta: {
                total: Array.isArray(trends) ? trends.length : 0,
                totalAvailable,
                planLimit,
                isLimitedByPlan: planLimit !== null,
                upgradeRequired: planLimit !== null,
            },
            data: trends,
        });
    } catch (error) {
        console.error("Search intelligence trends error:", error);
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to load search trends",
        });
    }
}

/**
 * GET /api/search-intelligence/products
 */
export async function getProducts(req, res) {
    try {
        const shop = getShop(req);
        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const subscription = await Subscription.getOrCreateForShop(shop);
        const planId = subscription.isActive() ? subscription.plan : "free";
        const planLimit = getPlanLimit(planId, LIMIT_KEYS.SEARCH_INTELLIGENCE_PRODUCTS);

        const { from, to } = parseDateRange(req);
        const requestedLimit = Number(req.query.limit) || 100;
        const fetchLimit = planLimit !== null ? Math.min(requestedLimit, planLimit) : requestedLimit;

        const allProducts = await getProductAnalytics({
            shop,
            accessToken: req.accessToken,
            from,
            to,
            limit: fetchLimit,
        });

        const totalAvailable = Array.isArray(allProducts) ? allProducts.length : 0;
        const products = planLimit !== null && Array.isArray(allProducts)
            ? allProducts.slice(0, planLimit)
            : allProducts;

        return res.status(200).json({
            success: true,
            plan: planId,
            meta: {
                total: Array.isArray(products) ? products.length : 0,
                totalAvailable,
                planLimit,
                isLimitedByPlan: planLimit !== null && totalAvailable > planLimit,
                upgradeRequired: planLimit !== null && totalAvailable >= planLimit,
            },
            data: products,
        });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to load product analytics",
        });
    }
}

/**
 * GET /api/search-intelligence/conversions
 */
export async function getConversions(req, res) {
    try {
        const shop = getShop(req);
        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const { from, to } = parseDateRange(req);
        const conversions = await getSearchConversionRate({ shop, from, to });

        return res.status(200).json({
            success: true,
            data: conversions,
        });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to load search conversions",
        });
    }
}
