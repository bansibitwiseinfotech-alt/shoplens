import Collection from "../models/Collection.js";
import MerchandisingEvent from "../models/MerchandisingEvent.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

const PURCHASE_IGNORED_STATUSES = new Set([
    "AUTHORIZED",
    "EXPIRED",
    "PENDING",
    "REFUNDED",
    "UNPAID",
    "VOIDED",
]);

function normalizeShop(shop) {
    return String(shop || "").trim().toLowerCase();
}

function normalizeId(id) {
    return String(id || "").split("/").pop();
}

function round(value) {
    return Number(Number(value || 0).toFixed(2));
}

function conversionRate(clicks, purchases) {
    return clicks > 0 ? (purchases / clicks) * 100 : 0;
}

function isSuccessfulOrder(order) {
    if (!order || order.cancelledAt) return false;
    const status = String(order.financialStatus || "").toUpperCase();
    return !PURCHASE_IGNORED_STATUSES.has(status);
}

function emptyMetrics() {
    return { views: 0, productClicks: 0, purchases: 0, revenue: 0 };
}

function emptyProductMetrics() {
    return { clicks: 0, purchases: 0, revenue: 0 };
}

function getPerformance(metrics, storeRate) {
    if (metrics.productClicks >= 10 && metrics.purchases === 0) return "No Sales";
    if (metrics.productClicks < 10) return "Not Enough Data";
    const rate = conversionRate(metrics.productClicks, metrics.purchases);
    return rate >= storeRate ? "Good" : "Needs Attention";
}

function analyzePosition({
    clicks,
    productRate,
    collectionRate,
}) {
    if (clicks < 10) {
        return {
            issue: null,
            action: "Not Enough Data",
            recommendation: "Not enough data yet to suggest a change.",
        };
    }

    if (productRate < collectionRate) {
        return {
            issue: "Below collection average",
            action: "Consider Moving Lower",
            recommendation: "This product converts below the collection average.",
        };
    }

    if (collectionRate > 0 && productRate >= collectionRate * 1.25) {
        return {
            issue: "Above collection average",
            action: "Consider Moving Higher",
            recommendation: "This product converts well above the collection average.",
        };
    }

    return {
        issue: null,
        action: "Performing Well",
        recommendation: "This product is converting in line with the collection.",
    };
}

async function loadMerchandisingData(shop, startDate, endDate) {
    const normalizedShop = normalizeShop(shop);
    const [collections, eventGroups] = await Promise.all([
        Collection.find({ shop: normalizedShop }).lean(),
        MerchandisingEvent.aggregate([
            {
                $match: {
                    shop: normalizedShop,
                    occurredAt: { $gte: startDate, $lte: endDate },
                },
            },
            {
                $group: {
                    _id: {
                        collectionId: "$collectionId",
                        productId: "$productId",
                        eventType: "$eventType",
                        orderId: "$orderId",
                    },
                    count: { $sum: 1 },
                    revenue: { $sum: "$revenue" },
                },
            },
        ]),
    ]);

    const orderIds = [
        ...new Set(
            eventGroups
                .filter((event) => event._id.eventType === "purchase" && event._id.orderId)
                .map((event) => event._id.orderId)
        ),
    ];
    const orders = orderIds.length
        ? await Order.find({
              shop: normalizedShop,
              shopifyOrderId: { $in: orderIds },
          }).lean()
        : [];
    const ordersById = new Map(orders.map((order) => [order.shopifyOrderId, order]));
    const collectionMetrics = new Map();
    const productMetrics = new Map();
    const acceptedPurchaseGroups = [];
    const successfulOrderIds = new Set();
    const collectionPurchaseOrders = new Map();
    const productPurchaseOrders = new Map();
    let storeClicks = 0;

    for (const event of eventGroups) {
        const { collectionId, productId, eventType, orderId } = event._id;
        if (eventType === "purchase") {
            const order = orderId ? ordersById.get(orderId) : null;
            if (order && !isSuccessfulOrder(order)) continue;
            if (orderId) {
                successfulOrderIds.add(orderId);
                if (collectionId) {
                    const collectionOrders = collectionPurchaseOrders.get(collectionId) || new Set();
                    collectionOrders.add(orderId);
                    collectionPurchaseOrders.set(collectionId, collectionOrders);
                }
                if (collectionId && productId) {
                    const key = `${collectionId}::${normalizeId(productId)}`;
                    const productOrders = productPurchaseOrders.get(key) || new Set();
                    productOrders.add(orderId);
                    productPurchaseOrders.set(key, productOrders);
                }
            }
            if (collectionId && productId) acceptedPurchaseGroups.push(event);
        } else if (eventType === "product_click") {
            storeClicks += event.count;
        }

        if (!collectionId) continue;

        const metrics = collectionMetrics.get(collectionId) || emptyMetrics();
        if (eventType === "collection_view") {
            metrics.views += event.count;
        } else if (eventType === "product_click") {
            metrics.productClicks += event.count;
        }
        collectionMetrics.set(collectionId, metrics);

        if (!productId || (eventType !== "product_click" && eventType !== "purchase")) {
            continue;
        }

        const key = `${collectionId}::${normalizeId(productId)}`;
        const product = productMetrics.get(key) || emptyProductMetrics();
        if (eventType === "product_click") {
            product.clicks += event.count;
        }
        productMetrics.set(key, product);
    }

    for (const [collectionId, orderIdsForCollection] of collectionPurchaseOrders.entries()) {
        const metrics = collectionMetrics.get(collectionId) || emptyMetrics();
        metrics.purchases = orderIdsForCollection.size;
        collectionMetrics.set(collectionId, metrics);
    }

    for (const [productKey, orderIdsForProduct] of productPurchaseOrders.entries()) {
        const product = productMetrics.get(productKey) || emptyProductMetrics();
        product.purchases = orderIdsForProduct.size;
        productMetrics.set(productKey, product);
    }

    const storePurchases = successfulOrderIds.size;

    const revenueKeys = new Set();
    for (const event of acceptedPurchaseGroups) {
        if (event._id.orderId) {
            revenueKeys.add(
                `${event._id.orderId}::${event._id.collectionId}::${event._id.productId}`
            );
        }
    }

    for (const key of revenueKeys) {
        const [orderId, collectionId, productId] = key.split("::");
        const order = ordersById.get(orderId);
        if (order && !isSuccessfulOrder(order)) continue;

        let revenue = 0;
        if (order && Array.isArray(order.lineItems) && order.lineItems.length > 0) {
            revenue = (order.lineItems || []).reduce((total, item) => {
                if (normalizeId(item.productId) !== normalizeId(productId)) return total;
                const price = Number(item.price);
                const quantity = Number(item.quantity);
                if (!Number.isFinite(price) || !Number.isFinite(quantity)) return total;
                return total + price * quantity;
            }, 0);
        } else {
            const matchEvent = acceptedPurchaseGroups.find(
                (e) =>
                    e._id.orderId === orderId &&
                    e._id.collectionId === collectionId &&
                    normalizeId(e._id.productId) === normalizeId(productId)
            );
            revenue = matchEvent?.revenue || 0;
        }

        const metrics = collectionMetrics.get(collectionId);
        if (metrics) metrics.revenue += revenue;

        const product = productMetrics.get(`${collectionId}::${normalizeId(productId)}`);
        if (product) product.revenue += revenue;
    }

    const allProductIds = [
        ...new Set(collections.flatMap((collection) => collection.productIds || [])),
    ];
    const productIdAliases = [
        ...new Set([...allProductIds, ...allProductIds.map(normalizeId)]),
    ];
    const productDocs = productIdAliases.length
        ? await Product.find({
              shop: normalizedShop,
              shopifyProductId: { $in: productIdAliases },
          }).lean()
        : [];
    const productTitles = new Map(
        productDocs.map((product) => [normalizeId(product.shopifyProductId), product.title])
    );

    return {
        collections,
        collectionMetrics,
        productMetrics,
        productTitles,
        storeClicks,
        storePurchases,
        currency: orders.find(
            (order) => isSuccessfulOrder(order) && order.currencyCode
        )?.currencyCode,
    };
}

function getCollectionProducts(collection, data) {
    const productIds = collection.productIds || [];
    const metrics = data.collectionMetrics.get(collection.shopifyCollectionId) || emptyMetrics();
    const collectionRate = conversionRate(metrics.productClicks, metrics.purchases);

    return productIds.map((productId, index) => {
        const productMetrics =
            data.productMetrics.get(
                `${collection.shopifyCollectionId}::${normalizeId(productId)}`
            ) ||
            emptyProductMetrics();
        const productRate = conversionRate(productMetrics.clicks, productMetrics.purchases);
        const analysis = analyzePosition({
            clicks: productMetrics.clicks,
            productRate,
            collectionRate,
        });

        return {
            productId,
            productTitle: data.productTitles.get(normalizeId(productId)) || "Untitled product",
            position: index + 1,
            clicks: productMetrics.clicks,
            purchases: productMetrics.purchases,
            revenue: round(productMetrics.revenue),
            conversionRate: productMetrics.clicks > 0 ? round(productRate) : null,
            ...analysis,
        };
    });
}

export async function getCollectionOverview({ shop, startDate, endDate }) {
    const data = await loadMerchandisingData(shop, startDate, endDate);
    const storeRate = conversionRate(data.storeClicks, data.storePurchases);

    const collectionResults = data.collections.map((collection) => {
        const metrics =
            data.collectionMetrics.get(collection.shopifyCollectionId) || emptyMetrics();
        const performance = getPerformance(metrics, storeRate);
        return {
            collectionId: collection.shopifyCollectionId,
            title: collection.title || "",
            handle: collection.handle || "",
            revenue: round(metrics.revenue),
            products: collection.productIds?.length || 0,
            views: metrics.views,
            productClicks: metrics.productClicks,
            purchases: metrics.purchases,
            conversionRate:
                metrics.productClicks > 0
                    ? round(conversionRate(metrics.productClicks, metrics.purchases))
                    : null,
            performance,
            action: performance === "Needs Attention" ? "Review Products" : "View Details",
        };
    });

    let productsToReposition = 0;
    for (const collection of data.collections) {
        productsToReposition += getCollectionProducts(collection, data).filter(
            (product) => product.issue
        ).length;
    }

    return {
        summary: {
            totalCollections: collectionResults.filter((item) => item.products > 0).length,
            collectionsWithSales: collectionResults.filter((item) => item.purchases > 0).length,
            underperformingCollections: collectionResults.filter(
                (item) => item.performance === "Needs Attention"
            ).length,
            productsToReposition,
        },
        currency: data.currency || null,
        collections: collectionResults.sort((a, b) => b.revenue - a.revenue),
    };
}

export async function getCollectionDetail({ shop, collectionId, startDate, endDate }) {
    const normalizedShop = normalizeShop(shop);
    const collection = await Collection.findOne({
        shop: normalizedShop,
        shopifyCollectionId: collectionId,
    }).lean();

    if (!collection) {
        const error = new Error("Collection not found.");
        error.statusCode = 404;
        throw error;
    }

    const data = await loadMerchandisingData(shop, startDate, endDate);
    const metrics = data.collectionMetrics.get(collectionId) || emptyMetrics();
    const products = getCollectionProducts(collection, data);
    const recommendations = products.filter((product) => product.issue);
    const storeConversionRate = conversionRate(data.storeClicks, data.storePurchases);
    const collectionConversionRate = conversionRate(
        metrics.productClicks,
        metrics.purchases
    );
    const performanceStatus = getPerformance(metrics, storeConversionRate);

    return {
        currency: data.currency || null,
        collection: {
            id: collection.shopifyCollectionId,
            title: collection.title || "",
            handle: collection.handle || "",
            description: collection.description || "",
            image: collection.image || null,
            products: collection.productIds?.length || 0,
        },
        performance: {
            views: metrics.views,
            productClicks: metrics.productClicks,
            purchases: metrics.purchases,
            revenue: round(metrics.revenue),
            conversionRate:
                metrics.productClicks > 0 ? round(collectionConversionRate) : null,
            status: performanceStatus,
            storeConversionRate: data.storeClicks > 0 ? round(storeConversionRate) : null,
            percentagePointsFromAverage:
                metrics.productClicks >= 10 && data.storeClicks > 0
                    ? round(Math.abs(collectionConversionRate - storeConversionRate))
                    : null,
        },
        products,
        recommendations,
        topProducts: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
        weakProducts: products
            .filter((product) => product.clicks > 0)
            .sort((a, b) => a.conversionRate - b.conversionRate)
            .slice(0, 5),
    };
}

export async function getPositioningProblems({ shop, startDate, endDate }) {
    const data = await loadMerchandisingData(shop, startDate, endDate);
    const problems = [];

    for (const collection of data.collections) {
        for (const product of getCollectionProducts(collection, data)) {
            if (!product.issue) continue;
            problems.push({
                productId: product.productId,
                productTitle: product.productTitle,
                collectionId: collection.shopifyCollectionId,
                collectionTitle: collection.title || "",
                position: product.position,
                clicks: product.clicks,
                purchases: product.purchases,
                conversionRate: product.conversionRate,
                issue: product.issue,
                action: product.action,
                recommendation: product.recommendation,
            });
        }
    }

    return problems.sort(
        (a, b) =>
            a.collectionTitle.localeCompare(b.collectionTitle) || a.position - b.position
    );
}
