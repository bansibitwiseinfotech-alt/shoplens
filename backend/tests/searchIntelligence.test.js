/* global globalThis */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import SearchEvent from "../models/searchEvent.model.js";
import searchIntentService from "../services/searchIntentService.js";
import {
  getSearchConversionRate,
  getSearchTrends,
  getTotalPurchases,
  recordAddToCart,
  recordProductClick,
  recordPurchase,
  recordSearch,
} from "../services/searchIntelligence.service.js";
import { ingestEvent } from "../controllers/searchIntelligence.controller.js";
import {
  createAppProxySignature,
  isValidAppProxyRequest,
  isValidInternalEventSignature,
  normalizeEventPayload,
  SearchEventValidationError,
} from "../utils/searchIntelligenceEvent.js";
import { forwardShopifyOrderWebhook } from "../../app/services/searchIntelligence.server.js";

const originals = {
  aggregate: SearchEvent.aggregate,
  distinct: SearchEvent.distinct,
  findOneAndUpdate: SearchEvent.findOneAndUpdate,
  updateOne: SearchEvent.updateOne,
  syncFromSearchEvents: searchIntentService.syncFromSearchEvents,
  fetch: globalThis.fetch,
  secret: process.env.SHOPIFY_API_SECRET,
  backendUrl: process.env.BACKEND_URL,
  consoleError: console.error,
};

afterEach(() => {
  SearchEvent.aggregate = originals.aggregate;
  SearchEvent.distinct = originals.distinct;
  SearchEvent.findOneAndUpdate = originals.findOneAndUpdate;
  SearchEvent.updateOne = originals.updateOne;
  searchIntentService.syncFromSearchEvents = originals.syncFromSearchEvents;
  globalThis.fetch = originals.fetch;
  process.env.SHOPIFY_API_SECRET = originals.secret;
  process.env.BACKEND_URL = originals.backendUrl;
  console.error = originals.consoleError;
});

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("event validation accepts genuine zero-result searches and normalizes shop identity", () => {
  const normalized = normalizeEventPayload(
    {
      trackingId: "store.myshopify.com",
      event: {
        id: "search-event-1",
        name: "search",
        timestamp: new Date().toISOString(),
        clientId: "session-1",
        data: { query: "  No match  ", resultCount: 0, returnedProducts: [] },
      },
    },
    "STORE.myshopify.com"
  );

  assert.equal(normalized.shop, "store.myshopify.com");
  assert.equal(normalized.eventType, "search");
  assert.equal(normalized.eventData.resultCount, 0);
  assert.equal(normalized.clientId, "session-1");
  assert.throws(
    () =>
      normalizeEventPayload(
        { event: { id: "invalid", name: "unsupported" } },
        "store.myshopify.com"
      ),
    SearchEventValidationError
  );
});

test("App Proxy and internal signatures reject tampering", () => {
  const secret = "test-shopify-secret";
  const params = new URLSearchParams({
    shop: "store.myshopify.com",
    path_prefix: "/apps/search-intelligence",
    timestamp: "1792764000",
  });
  params.set("signature", createAppProxySignature(params, secret));
  assert.equal(
    isValidAppProxyRequest(
      `/apps/search-intelligence/events?${params.toString()}`,
      secret
    ),
    "store.myshopify.com"
  );
  params.set("timestamp", "1792764001");
  assert.equal(
    isValidAppProxyRequest(
      `/apps/search-intelligence/events?${params.toString()}`,
      secret
    ),
    null
  );

  const rawBody = Buffer.from('{"trackingId":"store.myshopify.com"}');
  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  assert.equal(isValidInternalEventSignature(rawBody, signature, secret), true);
  const tamperedSignature = `${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`;
  assert.equal(
    isValidInternalEventSignature(rawBody, tamperedSignature, secret),
    false
  );
});

test("search persistence is idempotent and preserves a zero result count", async () => {
  let upsertArgs;
  let asyncUpdate;
  SearchEvent.findOneAndUpdate = async (...args) => {
    upsertArgs = args;
    return { eventId: "search-event-1" };
  };
  SearchEvent.updateOne = async (...args) => {
    asyncUpdate = args;
  };
  searchIntentService.syncFromSearchEvents = async () => {};

  const result = await recordSearch({
    shop: "store.myshopify.com",
    eventId: "search-event-1",
    clientId: "session-1",
    query: " No match ",
    occurredAt: "2026-10-23T12:00:00.000Z",
    returnedProducts: [],
    resultCount: 0,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.event.eventId, "search-event-1");
  assert.deepEqual(upsertArgs[0], {
    shop: "store.myshopify.com",
    eventId: "search-event-1",
  });
  assert.equal(upsertArgs[1].$setOnInsert.resultCount, 0);
  assert.equal(upsertArgs[2].upsert, true);
  assert.deepEqual(asyncUpdate[1].$set["metadata.hasResults"], false);
  assert.equal(asyncUpdate[1].$set.resultCount, 0);
});

test("purchase persistence avoids conflicting update paths and advances only verified paid orders", async () => {
  let insert;
  let update;
  SearchEvent.findOneAndUpdate = async (filter, changes) => {
    insert = { filter, changes };
    return { orderId: filter.orderId };
  };
  SearchEvent.updateOne = async (...args) => {
    update = args;
  };

  await recordPurchase({
    shop: "store.myshopify.com",
    eventId: "order-event-1",
    orderId: "gid://shopify/Order/123",
    occurredAt: "2026-10-23T12:05:00.000Z",
    verifiedOrder: true,
    orderStatus: "paid",
    metadata: {
      source: "shopify_webhook",
      lineItems: [{ productId: "gid://shopify/Product/45", quantity: 1 }],
    },
  });

  assert.equal(insert.changes.$set["metadata.lineItems"].length, 1);
  assert.equal(
    Object.hasOwn(insert.changes.$setOnInsert, "metadata.lineItems"),
    false
  );
  assert.deepEqual(update[0].$or, [
    { "metadata.statusPriority": { $lt: 4 } },
    { "metadata.statusPriority": { $exists: false } },
  ]);
  assert.equal(update[1].$set["metadata.status"], "paid");
  assert.equal(update[1].$set["metadata.verifiedOrder"], undefined);
});

test("search-result clicks and search-attributed cart adds persist canonical event types", async () => {
  const saved = [];
  SearchEvent.findOneAndUpdate = async (filter, update, options) => {
    saved.push({ filter, update, options });
    return { eventId: filter.eventId };
  };

  await recordProductClick({
    shop: "store.myshopify.com",
    eventId: "click-event-1",
    clientId: "session-1",
    query: "boots",
    productId: "gid://shopify/Product/45",
  });
  await recordAddToCart({
    shop: "store.myshopify.com",
    eventId: "cart-event-1",
    clientId: "session-1",
    query: "boots",
    productId: "gid://shopify/Product/45",
    variantId: "gid://shopify/ProductVariant/67",
  });

  assert.equal(saved.length, 2);
  assert.equal(saved[0].update.$setOnInsert.eventType, "product_click");
  assert.equal(saved[1].update.$setOnInsert.eventType, "add_to_cart");
  assert.equal(saved[1].update.$setOnInsert.normalizedQuery, "boots");
  assert.equal(saved[1].options.upsert, true);
});

test("order counts are shop/date scoped and deduplicated by stable order ID", async () => {
  let pipeline;
  SearchEvent.aggregate = async (value) => {
    pipeline = value;
    return [{ total: 2 }];
  };
  const from = new Date("2026-10-01T00:00:00.000Z");
  const to = new Date("2026-10-31T23:59:59.999Z");

  const count = await getTotalPurchases({
    shop: "store.myshopify.com",
    from,
    to,
  });

  assert.equal(count, 2);
  assert.deepEqual(pipeline[0].$match.occurredAt, { $gte: from, $lte: to });
  assert.deepEqual(pipeline[1], { $group: { _id: "$orderId" } });
});

test("conversion rate uses unique searched sessions and unique attributed purchasers", async () => {
  let attributionPipeline;
  SearchEvent.distinct = async () => ["s1", "s2", "s3"];
  SearchEvent.aggregate = async (pipeline) => {
    attributionPipeline = pipeline;
    return [
      { orderId: "o1", clientId: "s1", value: 10 },
      { orderId: "o2", clientId: "s1", value: 5 },
      { orderId: "o3", clientId: "s2", value: 20 },
    ];
  };
  const from = new Date("2026-10-01T00:00:00.000Z");
  const to = new Date("2026-10-31T23:59:59.999Z");

  const conversion = await getSearchConversionRate({
    shop: "store.myshopify.com",
    from,
    to,
  });

  const lookupConditions =
    attributionPipeline[1].$lookup.pipeline[0].$match.$expr.$and;
  assert.equal(conversion.uniqueSearchSessions, 3);
  assert.equal(conversion.uniquePurchasingSessions, 2);
  assert.equal(conversion.purchasesFromSearch, 3);
  assert.equal(conversion.conversionRate, 66.7);
  assert.equal(conversion.attributedRevenue, 35);
  assert.ok(lookupConditions.some((condition) => "$gte" in condition));
  assert.ok(lookupConditions.some((condition) => "$lte" in condition));
  assert.deepEqual(attributionPipeline[0].$match.occurredAt, { $gte: from, $lte: to });
});

test("daily trends group in the shop timezone and calculate session conversion", async () => {
  let aggregateCall = 0;
  let dailyPipeline;
  SearchEvent.aggregate = async (pipeline) => {
    aggregateCall += 1;
    if (aggregateCall === 1) {
      dailyPipeline = pipeline;
      return [
        { _id: { date: "2026-03-07", eventType: "search" }, count: 5 },
        { _id: { date: "2026-03-07", eventType: "product_click" }, count: 2 },
        { _id: { date: "2026-03-07", eventType: "purchase" }, count: 2 },
      ];
    }
    if (aggregateCall === 2) {
      return [{ _id: "2026-03-07", count: 2 }];
    }
    return [
      {
        orderId: "order-1",
        clientId: "session-1",
        occurredAt: new Date("2026-03-08T01:00:00.000Z"),
        search: { occurredAt: new Date("2026-03-07T22:00:00.000Z") },
      },
      {
        orderId: "order-2",
        clientId: "session-1",
        occurredAt: new Date("2026-03-08T01:30:00.000Z"),
        search: { occurredAt: new Date("2026-03-07T22:00:00.000Z") },
      },
    ];
  };

  const trends = await getSearchTrends({
    shop: "store.myshopify.com",
    from: new Date("2026-03-01T00:00:00.000Z"),
    to: new Date("2026-03-31T23:59:59.999Z"),
    timeZone: "America/New_York",
  });

  assert.ok(JSON.stringify(dailyPipeline).includes("America/New_York"));
  assert.equal(trends[0].date, "2026-03-07");
  assert.equal(trends[0].searches, 5);
  assert.equal(trends[0].clicks, 2);
  assert.equal(trends[0].attributedPurchases, 2);
  assert.equal(trends[0].searchSessions, 2);
  assert.equal(trends[0].conversionRate, 50);
});

test("invalid ingestion bodies return 400, while database failures remain 500", async () => {
  const invalidResponse = createResponse();
  await ingestEvent(
    { body: null, verifiedShop: "store.myshopify.com" },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);

  SearchEvent.findOneAndUpdate = async () => {
    throw new Error("database unavailable");
  };
  console.error = () => {};
  const databaseResponse = createResponse();
  await ingestEvent(
    {
      verifiedShop: "store.myshopify.com",
      body: {
        trackingId: "store.myshopify.com",
        event: {
          id: "search-event-2",
          name: "search",
          timestamp: new Date().toISOString(),
          clientId: "session-2",
          data: { query: "boots", resultCount: 0 },
        },
      },
    },
    databaseResponse
  );

  assert.equal(databaseResponse.statusCode, 500);
  assert.equal(databaseResponse.body.success, false);
});

test("verified order webhooks are forwarded with a body signature and stable order identity", async () => {
  process.env.SHOPIFY_API_SECRET = "test-secret";
  process.env.BACKEND_URL = "http://backend.test";
  const forwardedRequests = [];
  globalThis.fetch = async (url, options) => {
    forwardedRequests.push({ url, options });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ success: true }),
    };
  };

  await forwardShopifyOrderWebhook({
    shop: "store.myshopify.com",
    topic: "orders/paid",
    webhookId: "webhook-1",
    payload: {
      id: 123,
      created_at: "2026-10-23T12:00:00.000Z",
      updated_at: "2026-10-23T12:05:00.000Z",
      financial_status: "paid",
      total_price: "25.00",
      currency: "USD",
      line_items: [{ product_id: 45, variant_id: 67, title: "Boots", quantity: 1 }],
    },
  });

  await forwardShopifyOrderWebhook({
    shop: "store.myshopify.com",
    topic: "refunds/create",
    webhookId: "refund-webhook-1",
    payload: {
      id: 999,
      order_id: 123,
      created_at: "2026-10-23T12:10:00.000Z",
      transactions: [{ kind: "refund", amount: "5.00" }],
    },
  });

  const forwardedRequest = forwardedRequests[0];
  const body = JSON.parse(forwardedRequest.options.body);
  assert.equal(forwardedRequest.url, "http://backend.test/api/search-intelligence/events");
  assert.equal(body.event.data.orderId, "gid://shopify/Order/123");
  assert.equal(body.event.timestamp, "2026-10-23T12:05:00.000Z");
  assert.equal(body.event.data.orderStatus, "paid");
  assert.equal(body.event.data.verifiedOrder, true);
  assert.equal(body.event.data.lineItems[0].productId, "gid://shopify/Product/45");
  assert.equal(
    isValidInternalEventSignature(
      Buffer.from(forwardedRequest.options.body),
      forwardedRequest.options.headers["X-ShopLens-Internal-Signature"],
      "test-secret"
    ),
    true
  );
  const refundBody = JSON.parse(forwardedRequests[1].options.body);
  assert.equal(refundBody.event.id, body.event.id);
  assert.equal(refundBody.event.data.orderId, body.event.data.orderId);
  assert.equal(refundBody.event.data.refundEventId, "refund-webhook-1");
  assert.equal(refundBody.event.data.refundAmount, 5);
});
