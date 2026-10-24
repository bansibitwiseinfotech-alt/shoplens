import { shopifyGraphQL } from "./shopifyGraphqlService.js";
import { getShopAccessToken } from "./shopifyTokenService.js";

const ORDER_FIELDS = `
  id
  name
  createdAt
  updatedAt
  processedAt
  cancelledAt
  currencyCode
  lineItems(first: 25) {
    edges {
      cursor
      node {
        id
        title
        quantity
        sku
        product { id }
        variant { id }
        originalUnitPriceSet { shopMoney { amount currencyCode } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  totalDiscountsSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  displayFinancialStatus
  displayFulfillmentStatus
`;

const ORDER_PAGE_QUERY = `
  query OrderPage($first: Int!, $after: String, $search: String) {
    orders(first: $first, after: $after, query: $search, sortKey: UPDATED_AT) {
      edges { cursor node { ${ORDER_FIELDS} } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_BY_ID_QUERY = `
  query OrderById($id: ID!) {
    order(id: $id) { ${ORDER_FIELDS} }
  }
`;

const ORDER_LINE_ITEMS_PAGE_QUERY = `
  query OrderLineItemsPage($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: 100, after: $after) {
        edges {
          cursor
          node {
            id
            title
            quantity
            sku
            product { id }
            variant { id }
            originalUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const toOrderGid = (id) =>
  String(id).startsWith("gid://") ? String(id) : `gid://shopify/Order/${id}`;

const moneyAmount = (moneyBag) =>
  moneyBag?.shopMoney?.amount == null ? null : Number(moneyBag.shopMoney.amount);

export const formatOrder = (order, lineItems = []) => {
  const items = lineItems.length
    ? lineItems
    : order.lineItems?.edges?.map((e) => e.node) || [];

  return {
    shopifyOrderId: order.id,
    id: order.id,
    orderNumber: order.name,
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.displayName,
          email: order.customer.defaultEmailAddress?.emailAddress || null,
        }
      : null,
    lineItems: items.map((item) => ({
      productId: item.product?.id || null,
      variantId: item.variant?.id || null,
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
      price: moneyAmount(item.originalUnitPriceSet),
    })),
    currencyCode: order.currencyCode || null,
    subtotal: moneyAmount(order.subtotalPriceSet),
    totalPrice: moneyAmount(order.totalPriceSet),
    totalTax: moneyAmount(order.totalTaxSet),
    totalDiscount: moneyAmount(order.totalDiscountsSet),
    totalShipping: moneyAmount(order.totalShippingPriceSet),
    financialStatus: order.displayFinancialStatus || "PAID",
    fulfillmentStatus: order.displayFulfillmentStatus || "UNFULFILLED",
    processedAt: order.processedAt || null,
    cancelledAt: order.cancelledAt || null,
    shopifyCreatedAt: order.createdAt || null,
    shopifyUpdatedAt: order.updatedAt || null,
  };
};

export const fetchLineItems = async (shop, accessToken, order) => {
  const lineItems = order.lineItems?.edges?.map(({ node }) => node) || [];
  let pageInfo = order.lineItems?.pageInfo || { hasNextPage: false };

  while (pageInfo.hasNextPage) {
    if (!pageInfo.endCursor) break;

    const data = await shopifyGraphQL({
      shop,
      accessToken,
      query: ORDER_LINE_ITEMS_PAGE_QUERY,
      variables: { id: order.id, after: pageInfo.endCursor },
    });

    if (!data?.order) break;

    lineItems.push(...(data.order.lineItems?.edges?.map(({ node }) => node) || []));
    pageInfo = data.order.lineItems?.pageInfo || { hasNextPage: false };
  }

  return lineItems;
};

/**
 * Fetch live orders from Shopify GraphQL without saving to MongoDB.
 */
export const fetchLiveOrders = async (
  shop,
  { accessToken, limit = 50, since, cursor, search } = {}
) => {
  const token = accessToken || (await getShopAccessToken(shop));
  const searchQuery = search || (since ? `updated_at:>'${new Date(since).toISOString()}'` : null);

  const data = await shopifyGraphQL({
    shop,
    accessToken: token,
    query: ORDER_PAGE_QUERY,
    variables: {
      first: Math.min(Math.max(Number(limit) || 20, 1), 100),
      after: cursor || null,
      search: searchQuery || null,
    },
  });

  const connection = data.orders;
  const orders = connection.edges.map(({ node }) => formatOrder(node));

  return {
    orders,
    pageInfo: connection.pageInfo,
    totalFetched: orders.length,
  };
};

/**
 * Fetch single order live from Shopify GraphQL.
 */
export const fetchLiveOrderById = async (shop, orderId, accessToken = null) => {
  const token = accessToken || (await getShopAccessToken(shop));
  const data = await shopifyGraphQL({
    shop,
    accessToken: token,
    query: ORDER_BY_ID_QUERY,
    variables: { id: toOrderGid(orderId) },
  });

  if (!data?.order) return null;
  const lineItems = await fetchLineItems(shop, token, data.order);
  return formatOrder(data.order, lineItems);
};

const processOrderForEvents = async (shop, accessToken, order) => {
  const lineItems = await fetchLineItems(shop, accessToken, order);
  const formatted = formatOrder(order, lineItems);

  try {
    const { recordPurchase } = await import("./searchIntelligence.service.js");
    await recordPurchase({
      shop,
      eventId: `order_${order.id}`,
      orderId: order.id,
      value: moneyAmount(order.totalPriceSet),
      currency: order.currencyCode,
      occurredAt: order.processedAt || order.createdAt || new Date(),
      verifiedOrder: true,
      orderStatus: (order.displayFinancialStatus || "PAID").toLowerCase(),
      metadata: {
        source: "order_sync",
        orderName: order.name,
        lineItems: formatted.lineItems,
        verifiedOrder: true,
        status: (order.displayFinancialStatus || "PAID").toLowerCase(),
      },
    });
  } catch (err) {
    // Non-blocking for analytics
  }

  return formatted;
};

const updatedAtFilter = (since) =>
  since ? `updated_at:>'${new Date(since).toISOString()}'` : null;

/**
 * Sync orders directly from Shopify GraphQL.
 * Orders are NOT stored in MongoDB tbl_orders.
 */
export const syncOrders = async (
  shop,
  accessToken = null,
  { since, orderId } = {}
) => {
  const token = accessToken || (await getShopAccessToken(shop));
  const summary = {
    totalFetched: 0,
    synced: 0,
    failed: 0,
  };

  try {
    if (orderId) {
      const data = await shopifyGraphQL({
        shop,
        accessToken: token,
        query: ORDER_BY_ID_QUERY,
        variables: { id: toOrderGid(orderId) },
      });

      if (!data?.order) return summary;
      summary.totalFetched = 1;
      await processOrderForEvents(shop, token, data.order);
      summary.synced = 1;
      return summary;
    }

    let after = null;
    do {
      const data = await shopifyGraphQL({
        shop,
        accessToken: token,
        query: ORDER_PAGE_QUERY,
        variables: {
          first: 20,
          after,
          search: updatedAtFilter(since),
        },
      });

      const connection = data.orders;
      for (const { node: order } of connection.edges) {
        summary.totalFetched += 1;
        try {
          await processOrderForEvents(shop, token, order);
          summary.synced += 1;
        } catch (error) {
          summary.failed += 1;
          console.error(`Order sync process failed for ${order.id}:`, error.message);
        }
      }

      if (!connection.pageInfo.hasNextPage) break;
      if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
        break;
      }
      after = connection.pageInfo.endCursor;
    } while (true);

    return summary;
  } catch (error) {
    error.syncSummary = summary;
    throw error;
  }
};

export const deleteOrder = async (shop, orderId) => {
  return {
    success: true,
    message: `Order ${orderId} deleted on Shopify. No MongoDB storage used.`,
  };
};