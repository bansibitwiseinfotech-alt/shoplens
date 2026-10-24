import crypto from "node:crypto";

const backendUrl = () =>
  process.env.BACKEND_URL || "http://127.0.0.1:5000";

export async function forwardSearchIntelligenceEvent(payload) {
  // Prefer INTERNAL_API_SECRET so this works regardless of how the Shopify CLI
  // overrides SHOPIFY_API_SECRET during `shopify app dev`.
  const secret =
    process.env.INTERNAL_API_SECRET ||
    process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    const err = new Error(
      "Neither INTERNAL_API_SECRET nor SHOPIFY_API_SECRET is configured for internal event forwarding."
    );
    err.statusCode = 503;
    throw err;
  }

  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const response = await fetch(
    `${backendUrl()}/api/search-intelligence/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ShopLens-Internal-Signature": signature,
      },
      body,
    }
  );

  let data;
  try {
    data = await response.json();
  } catch (error) {
    const parseError = new Error(
      `Search Intelligence backend returned invalid JSON (HTTP ${response.status}): ${error.message}`
    );
    parseError.statusCode = 502;
    throw parseError;
  }
  if (!response.ok || data?.success === false) {
    const rejectionError = new Error(
      `Search Intelligence backend rejected event (HTTP ${response.status}): ${data?.message || response.statusText}`
    );
    rejectionError.statusCode = response.status;
    throw rejectionError;
  }
  return data;
}

function shopifyGid(resource, id) {
  if (id === null || id === undefined || id === "") return null;
  const value = String(id);
  return value.startsWith("gid://") ? value : `gid://shopify/${resource}/${value}`;
}

export async function forwardShopifyOrderWebhook({ shop, topic, payload, webhookId }) {
  const refund = topic === "refunds/create";
  const rawOrderId = refund
    ? payload.order_id
    : payload.admin_graphql_api_id || payload.id;
  if (!rawOrderId) {
    throw new Error(`Shopify ${topic} webhook did not contain an order ID.`);
  }
  const orderId = shopifyGid("Order", rawOrderId);

  const eventNameByTopic = {
    "orders/create": "order_created",
    "orders/paid": "order_paid",
    "orders/updated": "order_updated",
    "orders/edited": "order_updated",
    "orders/cancelled": "order_cancelled",
    "refunds/create": "order_refunded",
  };
  const eventName = eventNameByTopic[topic];
  if (!eventName) {
    throw new Error(`Unsupported Search Intelligence order webhook: ${topic}`);
  }

  const lineItems = refund
    ? []
    : (payload.line_items || []).map((item) => ({
        productId: shopifyGid("Product", item.product_id),
        variantId: shopifyGid("ProductVariant", item.variant_id),
        title: item.title,
        quantity: item.quantity,
      }));
  const refundAmount = refund
    ? (payload.transactions || [])
        .filter((transaction) => transaction.kind === "refund")
        .reduce((total, transaction) => total + (Number(transaction.amount) || 0), 0)
    : undefined;
  const orderStatus =
    topic === "orders/cancelled"
      ? "cancelled"
      : topic === "orders/paid"
        ? "paid"
        : topic === "refunds/create"
          ? "refunded"
          : payload.financial_status || "created";
  const occurredAt =
    topic === "orders/create"
        ? payload.created_at
        : payload.updated_at || payload.created_at;

  return forwardSearchIntelligenceEvent({
    trackingId: shop,
    event: {
      id: `shopify-order-${String(orderId)}`,
      name: eventName,
      timestamp: occurredAt || new Date().toISOString(),
      data: {
        orderId: String(orderId),
        value: refund ? undefined : Number(payload.total_price),
        currency: payload.currency || null,
        orderStatus,
        lineItems,
        source: "shopify_webhook",
        verifiedOrder: true,
        refundEventId: refund ? webhookId || String(payload.id) : undefined,
        refundAmount,
      },
    },
  });
}
