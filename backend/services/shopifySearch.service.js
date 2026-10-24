import Store from "../models/Store.js";

/**
 * Fetch live search results directly from Shopify Admin GraphQL API
 * or fallback to local synced catalog.
 *
 * @param {string} shop - Shopify domain (e.g. promobile-hub.myshopify.com)
 * @param {string} query - The search query term
 * @returns {Promise<{ count: number, products: Array<{ id: string, title: string, position: number, image: string|null, status: string }> }>}
 */
export async function fetchLiveStorefrontSearchResults(shop, query) {
  if (!query || typeof query !== "string" || !query.trim()) {
    return { count: 0, products: [] };
  }

  const cleanQuery = query.trim();

  try {
    const store = await Store.findOne({ shop }).lean();
    let accessToken = store?.accessToken;

    // Fallback: If no accessToken in Store or if it might be stale, check Prisma SQLite
    if (!accessToken) {
      try {
        const { PrismaClient } = await import("@prisma/client");
        const prisma = new PrismaClient();
        const session = await prisma.session.findFirst({
          where: { shop, isOnline: false },
        });
        if (session?.accessToken) {
          accessToken = session.accessToken;
          // Sync back to MongoDB Store model
          await Store.findOneAndUpdate(
            { shop },
            { $set: { accessToken, installed: true } },
            { upsert: true }
          );
        }
      } catch (e) {
        // Ignore Prisma fallback error if not present
      }
    }

    if (accessToken) {
      const graphqlQuery = `
        query searchLiveProducts($query: String!) {
          products(first: 20, query: $query) {
            edges {
              node {
                id
                title
                status
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${shop}/admin/api/2024-07/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { query: cleanQuery },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const edges = json?.data?.products?.edges || [];
        const products = edges.map((edge, index) => ({
          id: edge.node.id,
          title: edge.node.title,
          position: index + 1,
          image: edge.node.featuredImage?.url || null,
          status: edge.node.status || "ACTIVE",
        }));

        return {
          count: products.length,
          products,
        };
      }
    }
  } catch (err) {
    console.warn(`[ShopifySearchService] Live API search failed for "${cleanQuery}":`, err.message);
  }

  return { count: 0, products: [] };
}
