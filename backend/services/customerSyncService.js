import Customer from "../models/Customer.js";
import { shopifyGraphQL } from "./shopifyGraphqlService.js";

const CUSTOMER_FIELDS = `
  id
  firstName
  lastName
  displayName
  defaultEmailAddress { emailAddress }
  defaultPhoneNumber { phoneNumber }
  numberOfOrders
  amountSpent { amount currencyCode }
  state
  tags
  note
  verifiedEmail
  createdAt
  updatedAt
`;

const CUSTOMER_PAGE_QUERY = `
  query CustomerPage($first: Int!, $after: String, $search: String) {
    customers(first: $first, after: $after, query: $search, sortKey: UPDATED_AT) {
      edges {
        cursor
        node {
          ${CUSTOMER_FIELDS}
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CUSTOMER_BY_ID_QUERY = `
  query CustomerById($id: ID!) {
    customer(id: $id) {
      ${CUSTOMER_FIELDS}
    }
  }
`;

const emptySummary = () => ({
  totalFetched: 0,
  failed: 0,
});

const toCustomerGid = (id) =>
  String(id).startsWith("gid://")
    ? String(id)
    : `gid://shopify/Customer/${id}`;

const updatedAtFilter = (since) =>
  since ? `updated_at:>'${new Date(since).toISOString()}'` : null;

export const syncCustomers = async (
  shop,
  accessToken,
  { since, customerId } = {}
) => {
  const summary = emptySummary();

  try {
    if (customerId) {
      const data = await shopifyGraphQL({
        shop,
        accessToken,
        query: CUSTOMER_BY_ID_QUERY,
        variables: {
          id: toCustomerGid(customerId),
        },
      });

      if (!data.customer) return summary;

      summary.totalFetched = 1;
      return summary;
    }

    let after = null;

    do {
      const data = await shopifyGraphQL({
        shop,
        accessToken,
        query: CUSTOMER_PAGE_QUERY,
        variables: {
          first: 10,
          after,
          search: updatedAtFilter(since),
        },
      });

      const connection = data.customers;

      summary.totalFetched += connection.edges.length;

      if (!connection.pageInfo.hasNextPage) break;

      if (
        !connection.pageInfo.endCursor ||
        connection.pageInfo.endCursor === after
      ) {
        throw new Error(
          "Shopify customer pagination returned an invalid cursor."
        );
      }

      after = connection.pageInfo.endCursor;
    } while (true);

    return summary;
  } catch (error) {
    error.syncSummary = summary;
    throw error;
  }
};

export const fetchLiveCustomers = async (
  shop,
  { accessToken, limit = 50, search = null, cursor = null } = {}
) => {
  if (!accessToken) {
    throw new Error("A valid Shopify access token is required to fetch customers.");
  }

  const data = await shopifyGraphQL({
    shop,
    accessToken,
    query: CUSTOMER_PAGE_QUERY,
    variables: {
      first: Math.min(Math.max(Number(limit) || 50, 1), 100),
      after: cursor || null,
      search: search || null,
    },
  });

  const connection = data.customers;
  return {
    customers: connection.edges.map(({ node }) => ({
      ...node,
      email: node.defaultEmailAddress?.emailAddress || null,
      phone: node.defaultPhoneNumber?.phoneNumber || null,
    })),
    pageInfo: connection.pageInfo,
    totalFetched: connection.edges.length,
  };
};

export const deleteCustomer = async (shop, customerId) =>
  Customer.deleteOne({
    shop,
    shopifyCustomerId: toCustomerGid(customerId),
  });
