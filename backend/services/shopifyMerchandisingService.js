import Order from "../models/Order.js";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";

async function graphql(shop, accessToken, query, variables = {}) {
  const response = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    const error = new Error(
      response.status === 403
        ? "Shopify denied this request. Reconnect the app with read_products and write_products permissions."
        : `Shopify API returned HTTP ${response.status}.`
    );
    error.status = 502;
    error.expose = true;
    throw error;
  }

  const result = await response.json();

  if (result.errors?.length) {
    const error = new Error(
      `Shopify GraphQL error: ${result.errors.map((e) => e.message).join("; ")}`
    );
    error.status = 502;
    error.expose = true;
    throw error;
  }

  return result.data;
}

export async function fetchShopCollections(shop, accessToken) {
  const query = `
    query MerchandisingCollections($first: Int!, $after: String) {
      collections(first: $first, after: $after, sortKey: TITLE) {
        nodes {
          id
          title
          productsCount {
            count
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  const collections = [];
  let after = null;

  do {
    const data = await graphql(shop, accessToken, query, { first: 100, after });
    const connection = data?.collections;

    if (!connection) {
      throw new Error("Shopify did not return collections.");
    }

    collections.push(
      ...connection.nodes.map((node) => {
        const item = { id: node.id, title: node.title };
        if (node.productsCount !== undefined) {
          item.productsCount = node.productsCount?.count ?? 0;
        }
        return item;
      })
    );

    if (!connection.pageInfo.hasNextPage) break;
    if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
      throw new Error("Shopify collection pagination returned an invalid cursor.");
    }
    after = connection.pageInfo.endCursor;
  } while (true);

  return collections;
}

export async function fetchCollectionProducts(shop, accessToken, collectionId) {
  const query = `
    query CollectionProducts($id: ID!, $after: String) {
      collection(id: $id) {
        id
        title
        sortOrder
        products(first: 250, after: $after) {
          nodes {
            id
            title
            createdAt
            productType
            vendor
            tags
            totalInventory
            featuredImage {
              url
              altText
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 25) {
              nodes {
                id
                price
                inventoryQuantity
                inventoryItem {
                  unitCost {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const data = await graphql(shop, accessToken, query, {
    id: collectionId,
    after: null,
  });
  const collection = data?.collection;

  if (!collection) {
    throw new Error("Collection not found or inaccessible.");
  }

  const products = [...collection.products.nodes];
  let pageInfo = collection.products.pageInfo;

  while (pageInfo.hasNextPage) {
    if (!pageInfo.endCursor) {
      throw new Error("Shopify returned a missing product cursor.");
    }

    const nextPage = await graphql(shop, accessToken, query, {
      id: collectionId,
      after: pageInfo.endCursor,
    });
    const nextCollection = nextPage?.collection;
    if (!nextCollection) {
      throw new Error("Shopify collection was not found during product pagination.");
    }

    products.push(...nextCollection.products.nodes);
    pageInfo = nextCollection.products.pageInfo;
  }

  return {
    id: collection.id,
    title: collection.title,
    sortOrder: collection.sortOrder,
    products: products.map((product) => {
      const variantNodes = product.variants?.nodes || [];
      const costVariants = variantNodes.filter(
        (v) => v?.inventoryItem?.unitCost?.amount != null
      );
      let cost = null;
      if (costVariants.length > 0) {
        const totalCost = costVariants.reduce(
          (sum, v) => sum + Number(v.inventoryItem.unitCost.amount),
          0
        );
        cost = totalCost / costVariants.length;
      }

      return {
        id: product.id,
        title: product.title,
        imageUrl: product.featuredImage?.url || null,
        imageAlt: product.featuredImage?.altText || null,
        inventory: product.totalInventory,
        createdAt: product.createdAt,
        productType: product.productType,
        vendor: product.vendor,
        tag: product.tags,
        price: Number(product.priceRangeV2?.minVariantPrice?.amount || 0),
        currency: product.priceRangeV2?.minVariantPrice?.currencyCode || "USD",
        cost,
        salesCount: 0,
      };
    }),
  };
}

export async function loadSalesDataForProducts(shop, productIds, timeWindowDays = 30) {
  const cutoff = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);

  const totalOrdersCount = await Order.countDocuments({ shop });
  const hasOrdersInSystem = totalOrdersCount > 0;

  const orders = await Order.find({
    shop,
    financialStatus: { $in: ["PAID", "paid"] },
    processedAt: { $gte: cutoff },
  })
    .select("lineItems")
    .lean();

  const salesMap = new Map();
  for (const id of productIds) {
    salesMap.set(id, 0);
  }

  for (const order of orders) {
    for (const item of order.lineItems || []) {
      if (!item.productId) continue;
      const rawPid = String(item.productId).replace(/^gid:\/\/shopify\/Product\//, "");
      const fullPid = String(item.productId).startsWith("gid://")
        ? String(item.productId)
        : `gid://shopify/Product/${item.productId}`;

      const matchedId = productIds.find(
        (id) => id === fullPid || id === item.productId || id.endsWith(`/${rawPid}`)
      );
      if (matchedId) {
        salesMap.set(
          matchedId,
          (salesMap.get(matchedId) || 0) + (Number(item.quantity) || 0)
        );
      }
    }
  }

  return { salesMap, hasOrdersInSystem, ordersInWindow: orders.length };
}    

async function setCollectionManualOrder(shop, accessToken, collectionId) {
  const mutation = `
    mutation SetCollectionManualOrder($collection: CollectionUpdateInput!) {
      collectionUpdate(collection: $collection) {
        collection {
          id
          sortOrder
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const data = await graphql(shop, accessToken, mutation, {
    collection: { id: collectionId, sortOrder: "MANUAL" },
  });
  const result = data?.collectionUpdate;

  if (result?.userErrors?.length) {
    const error = new Error(
      result.userErrors.map((item) => item.message).join("; ")
    );
    error.status = 502;
    error.expose = true;
    throw error;
  }
  if (!result?.collection) {
    const error = new Error("Shopify did not confirm manual collection ordering.");
    error.status = 502;
    error.expose = true;
    throw error;
  }
}

async function waitForReorderJob(shop, accessToken, jobId) {
  const query = `
    query MerchandisingReorderJob($id: ID!) {
      job(id: $id) {
        id
        done
      }
    }
  `;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const data = await graphql(shop, accessToken, query, { id: jobId });
    if (data?.job?.done) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const error = new Error(
    `Shopify accepted reorder job ${jobId}, but completion was not confirmed before timeout.`
  );
  error.status = 504;
  error.expose = true;
  throw error;
}

export async function updateCollectionOrder(
  shop,
  accessToken,
  collectionId,
  orderedIds,
  originalIds
) {
  if (!Array.isArray(orderedIds) || !Array.isArray(originalIds)) {
    throw new Error("Collection product IDs are required to apply an order.");
  }
  if (
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.length !== originalIds.length ||
    orderedIds.some((id) => !originalIds.includes(id))
  ) {
    throw new Error("The requested order does not match the collection products.");
  }

  await setCollectionManualOrder(shop, accessToken, collectionId);

  const workingOrder = [...originalIds];
  const moves = [];
  for (let targetPosition = 0; targetPosition < orderedIds.length; targetPosition += 1) {
    if (workingOrder[targetPosition] === orderedIds[targetPosition]) continue;

    const currentPosition = workingOrder.indexOf(
      orderedIds[targetPosition],
      targetPosition + 1
    );
    if (currentPosition < 0) {
      throw new Error("The calculated collection order contains an unknown product.");
    }

    const [productId] = workingOrder.splice(currentPosition, 1);
    workingOrder.splice(targetPosition, 0, productId);
    moves.push({ id: productId, newPosition: String(targetPosition) });
  }

  if (moves.length === 0) {
    return { accepted: true, verified: true, jobIds: [] };
  }

  const mutation = `
    mutation ReorderCollection($id: ID!, $moves: [MoveInput!]!) {
      collectionReorderProducts(id: $id, moves: $moves) {
        job {
          id
          done
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const jobIds = [];
  for (let start = 0; start < moves.length; start += 250) {
    const data = await graphql(shop, accessToken, mutation, {
      id: collectionId,
      moves: moves.slice(start, start + 250),
    });
    const result = data?.collectionReorderProducts;

    if (result?.userErrors?.length) {
      const error = new Error(
        result.userErrors.map((item) => item.message).join("; ")
      );
      error.status = 502;
      error.expose = true;
      throw error;
    }
    if (!result?.job?.id) {
      throw new Error("Shopify did not return a collection reorder job.");
    }

    jobIds.push(result.job.id);
    if (!result.job.done) {
      await waitForReorderJob(shop, accessToken, result.job.id);
    }
  }

  const verifiedCollection = await fetchCollectionProducts(
    shop,
    accessToken,
    collectionId
  );
  const verifiedIds = verifiedCollection.products.map((product) => product.id);
  if (
    verifiedIds.length !== orderedIds.length ||
    verifiedIds.some((id, index) => id !== orderedIds[index])
  ) {
    throw new Error("Shopify completed the reorder, but final order verification failed.");
  }

  return {
    accepted: true,
    verified: true,
    jobIds,
  };
}
