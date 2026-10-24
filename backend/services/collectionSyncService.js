import Collection from "../models/Collection.js";
import { shopifyGraphQL } from "./shopifyGraphqlService.js";

const COLLECTION_PAGE_QUERY = `
  query CollectionPage($first: Int!, $after: String, $search: String) {
    collections(first: $first, after: $after, query: $search, sortKey: UPDATED_AT) {
      edges {
        cursor
        node {
          id
          title
          handle
          description
          updatedAt
          image { url altText }
          products(first: 25) {
            edges { cursor node { id } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const COLLECTION_BY_ID_QUERY = `
  query CollectionById($id: ID!) {
    collection(id: $id) {
      id
      title
      handle
      description
      updatedAt
      image { url altText }
      products(first: 25) {
        edges { cursor node { id } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const COLLECTION_PRODUCTS_PAGE_QUERY = `
  query CollectionProductsPage($id: ID!, $after: String) {
    collection(id: $id) {
      products(first: 100, after: $after) {
        edges { cursor node { id } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const emptySummary = () => ({
  totalFetched: 0,
  created: 0,
  updated: 0,
  failed: 0,
});

const toCollectionGid = (id) =>
  String(id).startsWith("gid://") ? String(id) : `gid://shopify/Collection/${id}`;

const fetchProductIds = async (shop, accessToken, collection) => {
  const productIds = collection.products.edges.map(({ node }) => node.id);
  let pageInfo = collection.products.pageInfo;

  while (pageInfo.hasNextPage) {
    if (!pageInfo.endCursor) {
      throw new Error(`Shopify returned a missing product cursor for collection ${collection.id}.`);
    }

    const data = await shopifyGraphQL({
      shop,
      accessToken,
      query: COLLECTION_PRODUCTS_PAGE_QUERY,
      variables: { id: collection.id, after: pageInfo.endCursor },
    });

    if (!data.collection) {
      throw new Error(`Shopify collection ${collection.id} was not found during pagination.`);
    }

    productIds.push(...data.collection.products.edges.map(({ node }) => node.id));
    pageInfo = data.collection.products.pageInfo;
  }

  return productIds;
};

const upsertCollection = async (shop, accessToken, collection) => {
  const productIds = await fetchProductIds(shop, accessToken, collection);
  const result = await Collection.updateOne(
    { shop, shopifyCollectionId: collection.id },
    {
      $set: {
        title: collection.title,
        handle: collection.handle,
        description: collection.description,
        image: collection.image?.url || null,
        imageAltText: collection.image?.altText || null,
        collectionType: "flexible",
        productIds,
        shopifyUpdatedAt: collection.updatedAt || null,
        lastSyncedAt: new Date(),
      },
      $setOnInsert: { shop, shopifyCollectionId: collection.id },
    },
    { upsert: true }
  );

  return result.upsertedCount === 1 ? "created" : "updated";
};

const updatedAtFilter = (since) =>
  since ? `updated_at:>'${new Date(since).toISOString()}'` : null;

export const syncCollections = async (shop, accessToken, { since, collectionId } = {}) => {
  const summary = emptySummary();

  try {
    if (collectionId) {
      const data = await shopifyGraphQL({
        shop,
        accessToken,
        query: COLLECTION_BY_ID_QUERY,
        variables: { id: toCollectionGid(collectionId) },
      });

      if (!data.collection) return summary;
      summary.totalFetched = 1;
      summary[await upsertCollection(shop, accessToken, data.collection)] += 1;
      return summary;
    }

    let after = null;
    do {
      const data = await shopifyGraphQL({
        shop,
        accessToken,
        query: COLLECTION_PAGE_QUERY,
        variables: {
          first: 10,
          after,
          search: updatedAtFilter(since),
        },
      });

      const connection = data.collections;
      for (const { node: collection } of connection.edges) {
        summary.totalFetched += 1;
        try {
          summary[await upsertCollection(shop, accessToken, collection)] += 1;
        } catch (error) {
          summary.failed += 1;
          console.error(`Collection sync failed for ${collection.id}:`, error.message);
        }
      }

      if (!connection.pageInfo.hasNextPage) break;
      if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
        throw new Error("Shopify collection pagination returned an invalid cursor.");
      }
      after = connection.pageInfo.endCursor;
    } while (true);

    return summary;
  } catch (error) {
    error.syncSummary = summary;
    throw error;
  }
};

export const deleteCollection = async (shop, collectionId) =>
  Collection.deleteOne({ shop, shopifyCollectionId: toCollectionGid(collectionId) });