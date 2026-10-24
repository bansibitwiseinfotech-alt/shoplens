import crypto from "node:crypto";

const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const EVENT_TYPES = new Map([
  ["search", "search"],
  ["search_submitted", "search"],
  ["search_input_submitted", "search"],
  ["search_query", "search"],
  ["product_click", "product_click"],
  ["product_clicked", "product_click"],
  ["search_result_clicked", "product_click"],
  ["click", "product_click"],
  ["add_to_cart", "add_to_cart"],
  ["product_added_to_cart", "add_to_cart"],
  ["add_to_cart_clicked", "add_to_cart"],
  ["cart_add", "add_to_cart"],
  ["purchase", "purchase"],
  ["checkout_completed", "purchase"],
  ["order_placed", "purchase"],
  ["order_created", "order_created"],
  ["order_paid", "order_paid"],
  ["order_updated", "order_updated"],
  ["order_cancelled", "order_cancelled"],
  ["order_refunded", "order_refunded"],
  ["product_view", "product_view"],
  ["product_viewed", "product_view"],
  ["view", "product_view"],
  ["collection_view", "collection_view"],
  ["collection_viewed", "collection_view"],
  ["collection_product_clicked", "collection_product_clicked"],
]);

export class SearchEventValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SearchEventValidationError";
    this.statusCode = 400;
  }
}

export function normalizeShopDomain(value) {
  if (typeof value !== "string") return null;
  const shop = value.trim().toLowerCase();
  return SHOP_DOMAIN_REGEX.test(shop) ? shop : null;
}

export function normalizeEventPayload(body, verifiedShop) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SearchEventValidationError("Request body must be a JSON object.");
  }

  const shop = normalizeShopDomain(verifiedShop);
  if (!shop) {
    throw new SearchEventValidationError("Verified Shopify shop domain is missing or invalid.");
  }

  const bodyShop = body.trackingId || body.shop;
  if (bodyShop && normalizeShopDomain(bodyShop) !== shop) {
    throw new SearchEventValidationError("Event shop does not match the verified Shopify shop.");
  }

  const event = body.event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new SearchEventValidationError("Event object is required.");
  }

  const eventId = event.id || event.eventId;
  if (typeof eventId !== "string" || !eventId.trim() || eventId.length > 200) {
    throw new SearchEventValidationError("A valid event ID is required.");
  }

  const rawName = event.name || event.eventName;
  if (typeof rawName !== "string" || !rawName.trim()) {
    throw new SearchEventValidationError("Event name is required.");
  }

  const eventName = rawName.trim().toLowerCase();
  const eventType = EVENT_TYPES.get(eventName);
  if (!eventType) {
    throw new SearchEventValidationError(`Unsupported event type: ${eventName}`);
  }

  const eventData = event.data || event.eventData || {};
  if (typeof eventData !== "object" || Array.isArray(eventData)) {
    throw new SearchEventValidationError("Event data must be a JSON object.");
  }

  const clientId = event.clientId || event.client_id || null;
  if (
    clientId !== null &&
    (typeof clientId !== "string" || clientId.length > 256)
  ) {
    throw new SearchEventValidationError("Client/session ID must be a string of at most 256 characters.");
  }

  const timestamp = event.timestamp || eventData.timestamp;
  if (timestamp !== undefined && typeof timestamp !== "string") {
    throw new SearchEventValidationError("Event timestamp must be an ISO-8601 string.");
  }
  const occurredAt = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new SearchEventValidationError("Event timestamp must be a valid ISO-8601 date.");
  }
  if (occurredAt.getTime() > Date.now() + 10 * 60 * 1000) {
    throw new SearchEventValidationError("Event timestamp cannot be more than 10 minutes in the future.");
  }

  if (eventType === "search") {
    const query =
      eventData.query ||
      eventData.searchQuery ||
      eventData.searchResult?.query;
    if (typeof query !== "string" || !query.trim()) {
      throw new SearchEventValidationError("Search query is required.");
    }
    if (query.length > 500) {
      throw new SearchEventValidationError("Search query cannot exceed 500 characters.");
    }
    const resultCount = eventData.resultCount ?? eventData.resultsCount;
    if (
      resultCount !== undefined &&
      (!Number.isInteger(resultCount) || resultCount < 0)
    ) {
      throw new SearchEventValidationError("Search result count must be a non-negative integer.");
    }
  }

  if (
    ["purchase", "order_created", "order_paid", "order_cancelled", "order_refunded"].includes(
      eventType
    )
  ) {
    const orderId = eventData.orderId || eventData.checkout?.order?.id;
    if (typeof orderId !== "string" && typeof orderId !== "number") {
      throw new SearchEventValidationError("Order ID is required for purchase events.");
    }
    const value = eventData.value ?? eventData.checkout?.totalPrice?.amount;
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw new SearchEventValidationError("Order value must be a non-negative number.");
    }
  }

  return {
    shop,
    event,
    eventId: eventId.trim(),
    eventName,
    eventType,
    eventData,
    clientId,
    occurredAt,
  };
}

function safeEqualHex(expected, received) {
  if (
    typeof received !== "string" ||
    !/^[a-f0-9]{64}$/i.test(received) ||
    !/^[a-f0-9]{64}$/i.test(expected)
  ) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex")
  );
}

export function createAppProxySignature(searchParams, secret, delimiter = "") {
  const parameters = [...searchParams.entries()]
    .filter(([key]) => key !== "signature")
    .sort(([keyA, valueA], [keyB, valueB]) => {
      const keyOrder = keyA.localeCompare(keyB);
      return keyOrder || valueA.localeCompare(valueB);
    });
  const message = parameters.map(([key, value]) => `${key}=${value}`).join(delimiter);
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function isValidAppProxyRequest(requestUrl, secret) {
  if (!secret) return null;
  const url = new URL(requestUrl, "http://localhost");
  const params = url.searchParams;
  const shop = normalizeShopDomain(params.get("shop"));
  const received = params.get("signature");
  if (!shop || !received) return null;

  const expectedNoDelim = createAppProxySignature(params, secret, "");
  if (safeEqualHex(expectedNoDelim, received)) return shop;

  const expectedAmp = createAppProxySignature(params, secret, "&");
  if (safeEqualHex(expectedAmp, received)) return shop;

  return null;
}

export function isValidInternalEventSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
