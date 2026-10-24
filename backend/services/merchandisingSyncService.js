/**
 * Merchandising Sync Service
 *
 * Syncs real Shopify orders → tbl_merchandising_events (purchase events).
 * Maps each purchased product to its collection(s) via tbl_collections.
 * Uses orderId + productId + collectionId as idempotency key to avoid duplicates.
 */

import Collection from "../models/Collection.js";
import MerchandisingEvent from "../models/MerchandisingEvent.js";
import { shopifyGraphQL } from "./shopifyGraphqlService.js";
import { getShopAccessToken } from "./shopifyTokenService.js";

// ─── GraphQL Queries ──────────────────────────────────────────────────────────

const ORDERS_QUERY = `
  query MerchandisingOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT) {
      edges {
        cursor
        node {
          id
          name
          processedAt
          currencyCode
          cancelledAt
          lineItems(first: 50) {
            edges {
              node {
                id
                quantity
                product { id }
                originalUnitPriceSet { shopMoney { amount currencyCode } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_LINE_ITEMS_QUERY = `
  query OrderLineItemsPage($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: 100, after: $after) {
        edges {
          node {
            id
            quantity
            product { id }
            originalUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeShop(shop) {
    return String(shop || "").trim().toLowerCase();
}

function moneyAmount(moneyBag) {
    const val = moneyBag?.shopMoney?.amount;
    return val == null ? 0 : Number(val);
}

/**
 * Fetch all line items for a single order (handles pagination).
 */
async function fetchAllLineItems(shop, accessToken, order) {
    const lineItems = order.lineItems.edges.map((e) => e.node);
    let pageInfo = order.lineItems.pageInfo;

    while (pageInfo.hasNextPage && pageInfo.endCursor) {
        const data = await shopifyGraphQL({
            shop,
            accessToken,
            query: ORDER_LINE_ITEMS_QUERY,
            variables: { id: order.id, after: pageInfo.endCursor },
        });
        if (!data?.order) break;
        lineItems.push(...(data.order.lineItems.edges.map((e) => e.node) || []));
        pageInfo = data.order.lineItems.pageInfo;
    }

    return lineItems;
}

/**
 * Build a product → [collectionIds] reverse map from tbl_collections.
 */
async function buildProductCollectionMap(shop) {
    const collections = await Collection.find({ shop }).lean();
    const map = new Map(); // productId → Set<collectionId>

    for (const col of collections) {
        const cId = col.shopifyCollectionId;
        if (!cId) continue;
        for (const pId of col.productIds || []) {
            if (!map.has(pId)) map.set(pId, new Set());
            map.get(pId).add(cId);
        }
    }

    return map;
}

/**
 * Check which (orderId, productId, collectionId) combos already exist in tbl_merchandising_events.
 * Returns a Set of strings like "orderId::productId::collectionId".
 */
async function getExistingPurchaseKeys(shop, orderIds) {
    if (!orderIds.length) return new Set();

    const existing = await MerchandisingEvent.find(
        {
            shop,
            eventType: "purchase",
            orderId: { $in: orderIds },
        },
        { orderId: 1, productId: 1, collectionId: 1, _id: 0 }
    ).lean();

    return new Set(existing.map((e) => `${e.orderId}::${e.productId}::${e.collectionId}`));
}

// ─── Main Sync Function ───────────────────────────────────────────────────────

/**
 * Sync Shopify orders as purchase merchandising events.
 *
 * @param {string} shop  - Shop domain
 * @param {object} opts  - { since: ISO date string, accessToken }
 * @returns {object}     - { synced, skipped, failed, ordersProcessed }
 */
export async function syncMerchandisingFromOrders(shop, { since, accessToken } = {}) {
    const normalizedShop = normalizeShop(shop);
    const token = accessToken || (await getShopAccessToken(normalizedShop));

    // Build product → collections map from MongoDB
    const productCollectionMap = await buildProductCollectionMap(normalizedShop);

    const summary = {
        synced: 0,
        skipped: 0,
        failed: 0,
        ordersProcessed: 0,
    };

    // Only fetch orders that haven't been cancelled
    const queryStr = since
        ? `processed_at:>'${new Date(since).toISOString()}' -financial_status:voided`
        : `-financial_status:voided`;

    let after = null;
    const allOrderIds = [];

    // Phase 1: collect all orders
    const allOrders = [];

    do {
        let data;
        try {
            data = await shopifyGraphQL({
                shop: normalizedShop,
                accessToken: token,
                query: ORDERS_QUERY,
                variables: { first: 50, after, query: queryStr },
            });
        } catch (err) {
            console.error("[MerchandisingSync] Orders fetch error:", err.message);
            break;
        }

        const connection = data.orders;
        for (const { node: order } of connection.edges) {
            // Skip cancelled orders
            if (order.cancelledAt) continue;
            allOrders.push(order);
            allOrderIds.push(order.id);
        }

        if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
        if (connection.pageInfo.endCursor === after) break;
        after = connection.pageInfo.endCursor;
    } while (true);

    // Phase 2: check existing events to avoid duplicates
    const existingKeys = await getExistingPurchaseKeys(normalizedShop, allOrderIds);

    // Phase 3: create purchase events for each line item × collection
    const eventsToInsert = [];

    for (const order of allOrders) {
        summary.ordersProcessed++;

        let lineItems;
        try {
            lineItems = await fetchAllLineItems(normalizedShop, token, order);
        } catch (err) {
            console.error(`[MerchandisingSync] Line items fetch error for ${order.id}:`, err.message);
            summary.failed++;
            continue;
        }

        for (const item of lineItems) {
            const productId = item.product?.id;
            if (!productId) continue;

            const collections = productCollectionMap.get(productId);
            if (!collections || collections.size === 0) {
                // Product not in any synced collection — still record with null collectionId
                const key = `${order.id}::${productId}::null`;
                if (existingKeys.has(key)) {
                    summary.skipped++;
                    continue;
                }
                eventsToInsert.push({
                    shop: normalizedShop,
                    eventType: "purchase",
                    collectionId: null,
                    productId,
                    orderId: order.id,
                    sessionId: null,
                    customerId: null,
                    quantity: item.quantity || 1,
                    revenue: moneyAmount(item.originalUnitPriceSet) * (item.quantity || 1),
                    currency: order.currencyCode || "INR",
                    occurredAt: new Date(order.processedAt || Date.now()),
                    metadata: { orderName: order.name, source: "order_sync" },
                });
                existingKeys.add(key);
                continue;
            }

            for (const collectionId of collections) {
                const key = `${order.id}::${productId}::${collectionId}`;
                if (existingKeys.has(key)) {
                    summary.skipped++;
                    continue;
                }

                eventsToInsert.push({
                    shop: normalizedShop,
                    eventType: "purchase",
                    collectionId,
                    productId,
                    orderId: order.id,
                    sessionId: null,
                    customerId: null,
                    quantity: item.quantity || 1,
                    revenue: moneyAmount(item.originalUnitPriceSet) * (item.quantity || 1),
                    currency: order.currencyCode || "INR",
                    occurredAt: new Date(order.processedAt || Date.now()),
                    metadata: { orderName: order.name, source: "order_sync" },
                });
                existingKeys.add(key);
            }
        }
    }

    // Phase 4: bulk insert
    if (eventsToInsert.length > 0) {
        try {
            const result = await MerchandisingEvent.insertMany(eventsToInsert, {
                ordered: false, // continue on duplicates
            });
            summary.synced = result.length;
        } catch (err) {
            // Partial insert — some docs may have succeeded
            if (err.insertedDocs?.length) {
                summary.synced = err.insertedDocs.length;
            }
            if (err.writeErrors?.length) {
                summary.failed += err.writeErrors.length;
            }
            if (!err.insertedDocs && !err.writeErrors) {
                summary.failed += eventsToInsert.length;
                console.error("[MerchandisingSync] Insert error:", err.message);
            }
        }
    }

    return summary;
}
