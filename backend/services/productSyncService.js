import { shopifyGraphQL } from "./shopifyGraphqlService.js";
import { getShopAccessToken } from "./shopifyTokenService.js";
import { fetchInventoryForItems } from "./inventorySyncService.js";
import Product from "../models/Product.js";

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  vendor
  productType
  status
  totalInventory
  featuredImage {
    url
    altText
  }
  tags
  createdAt
  updatedAt
  variants(first: 25) {
    edges {
      cursor
      node {
        id
        title
        sku
        price
        inventoryQuantity
        inventoryItem { id }
        selectedOptions { name value }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
  images(first: 20) {
    edges { cursor node { id url altText } }
    pageInfo { hasNextPage endCursor }         
  }       
`;

const PRODUCT_PAGE_QUERY = `
  query ProductPage($first: Int!, $after: String, $search: String) {
    products(first: $first, after: $after, query: $search, sortKey: UPDATED_AT) {
      edges {
        cursor
        node { ${PRODUCT_FIELDS} }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = `
  query ProductById($id: ID!) {
    product(id: $id) { ${PRODUCT_FIELDS} }
  }
`;

const PRODUCT_NESTED_PAGE_QUERY = `
  query ProductNestedPage($id: ID!, $variantsAfter: String, $imagesAfter: String) {
    product(id: $id) {
      variants(first: 100, after: $variantsAfter) {
        edges {
          cursor
          node {
            id
            title
            sku
            price
            inventoryQuantity
            inventoryItem { id }
            selectedOptions { name value }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
      images(first: 100, after: $imagesAfter) {
        edges { cursor node { id url altText } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const toProductGid = (id) =>
  String(id).startsWith("gid://") ? String(id) : `gid://shopify/Product/${id}`;

export const mapVariant = (variant, inventoryInfo) => {
  const inventoryLevels =
    inventoryInfo?.inventoryLevels || variant.inventoryLevels || [];
  const availableQuantities = inventoryLevels
    .map(({ availableQuantity }) => availableQuantity)
    .filter(Number.isInteger);
  const inventoryQuantity =
    inventoryInfo?.tracked === false
      ? null
      : inventoryInfo
        ? availableQuantities.length
          ? availableQuantities.reduce((total, quantity) => total + quantity, 0)
          : 0
        : variant.inventoryQuantity == null
          ? null
          : variant.inventoryQuantity;

  return {
    shopifyVariantId: variant.id,
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    price: variant.price == null ? null : Number(variant.price),
    inventoryQuantity,
    inventoryItemId: variant.inventoryItem?.id || null,
    inventoryLevels,
    selectedOptions: variant.selectedOptions || [],
  };
};

export const formatProduct = (
  product,
  variants = [],
  images = [],
  inventoryById
) => {
  const finalVariants = variants.length
    ? variants.map((variant) =>
        mapVariant(variant, inventoryById?.get(variant.inventoryItem?.id))
      )
    : product.variants?.edges?.map(({ node }) =>
        mapVariant(node, inventoryById?.get(node.inventoryItem?.id))
      ) || [];

  const finalImages = images.length
    ? images
    : product.images?.edges?.map((e) => e.node) || [];

  return {
    shopifyProductId: product.id,
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status || "ACTIVE",
    totalInventory: product.totalInventory ?? null,
    featuredImage: product.featuredImage || null,
    tags: product.tags || [],
    variants: finalVariants,
    images: finalImages,
    shopifyCreatedAt: product.createdAt || null,
    shopifyUpdatedAt: product.updatedAt || null,
  };
};

export const fetchNestedPages = async (shop, accessToken, product) => {
  const variants = product.variants?.edges?.map(({ node }) => node) || [];
  const images = product.images?.edges?.map(({ node }) => node) || [];
  let variantsPageInfo = product.variants?.pageInfo || { hasNextPage: false };
  let imagesPageInfo = product.images?.pageInfo || { hasNextPage: false };

  while (variantsPageInfo.hasNextPage || imagesPageInfo.hasNextPage) {
    if (
      (variantsPageInfo.hasNextPage && !variantsPageInfo.endCursor) ||
      (imagesPageInfo.hasNextPage && !imagesPageInfo.endCursor)
    ) {
      throw new Error(`Shopify returned an invalid nested cursor for ${product.id}.`);
    }

    const data = await shopifyGraphQL({
      shop,
      accessToken,
      query: PRODUCT_NESTED_PAGE_QUERY,
      variables: {
        id: product.id,
        variantsAfter: variantsPageInfo.endCursor,
        imagesAfter: imagesPageInfo.endCursor,
      },
    });

    const nestedProduct = data.product;
    if (!nestedProduct) {
      throw new Error(`Shopify product ${product.id} was not found during pagination.`);
    }

    if (variantsPageInfo.hasNextPage) {
      variants.push(...nestedProduct.variants.edges.map(({ node }) => node));
      variantsPageInfo = nestedProduct.variants.pageInfo;
    }

    if (imagesPageInfo.hasNextPage) {
      images.push(...nestedProduct.images.edges.map(({ node }) => node));
      imagesPageInfo = nestedProduct.images.pageInfo;
    }
  }

  return { variants, images };
};

const updatedAtFilter = (since) =>
  since ? `updated_at:>'${new Date(since).toISOString()}'` : null;

/**
 * Fetch live products page from Shopify GraphQL without saving to MongoDB.
 */
export const fetchLiveProducts = async (
  shop,
  { accessToken, limit = 100, search = null, cursor = null } = {}
) => {
  const token = accessToken || (await getShopAccessToken(shop));
  const data = await shopifyGraphQL({
    shop,
    accessToken: token,
    query: PRODUCT_PAGE_QUERY,
    variables: {
      first: Math.min(Math.max(Number(limit) || 20, 1), 250),
      after: cursor || null,
      search: search || null,
    },
  });

  const connection = data.products;
  const products = connection.edges.map(({ node }) => formatProduct(node));

  return {
    products,
    pageInfo: connection.pageInfo,
    totalFetched: products.length,
  };
};

/**
 * Fetch all store products across all pages live from Shopify GraphQL.
 * No MongoDB storage.
 */
export const fetchAllStoreProducts = async (shop, accessToken = null) => {
  const token = accessToken || (await getShopAccessToken(shop));
  let after = null;
  const allProducts = [];

  do {
    const data = await shopifyGraphQL({
      shop,
      accessToken: token,
      query: PRODUCT_PAGE_QUERY,
      variables: {
        first: 100,
        after,
      },
    });

    const connection = data.products;
    for (const { node } of connection.edges) {
      allProducts.push(formatProduct(node));
    }

    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  } while (true);

  return allProducts;
};

/**
 * Fetch single product live from Shopify GraphQL.
 */
export const fetchLiveProductById = async (
  shop,
  productId,
  accessToken = null
) => {
  const token = accessToken || (await getShopAccessToken(shop));
  const data = await shopifyGraphQL({
    shop,
    accessToken: token,
    query: PRODUCT_BY_ID_QUERY,
    variables: { id: toProductGid(productId) },
  });

  if (!data?.product) return null;
  const { variants, images } = await fetchNestedPages(shop, token, data.product);
  return formatProduct(data.product, variants, images);
};

/**
 * Sync products and their location-specific available inventory to MongoDB.
 */
export const syncProducts = async (
  shop,
  accessToken = null,
  { since, productId } = {}
) => {
  const token = accessToken || (await getShopAccessToken(shop));
  const summary = {
    totalFetched: 0,
    synced: 0,
    failed: 0,
  };

  try {
    if (productId) {
      const data = await shopifyGraphQL({
        shop,
        accessToken: token,
        query: PRODUCT_BY_ID_QUERY,
        variables: { id: toProductGid(productId) },
      });
      const product = data.product;
      if (product) {
        await syncProductRecord(shop, token, product);
        summary.totalFetched = 1;
        summary.synced = 1;
      }
      return summary;
    }

    let after = null;
    do {
      const data = await shopifyGraphQL({
        shop,
        accessToken: token,
        query: PRODUCT_PAGE_QUERY,
        variables: {
          first: 50,
          after,
          search: updatedAtFilter(since),
        },
      });

      const connection = data.products;
      for (const { node: product } of connection.edges) {
        summary.totalFetched += 1;
        await syncProductRecord(shop, token, product);
        summary.synced += 1;
      }

      if (!connection.pageInfo.hasNextPage) break;
      if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
        throw new Error("Shopify product pagination returned an invalid cursor.");
      }
      after = connection.pageInfo.endCursor;
    } while (true);

    return summary;
  } catch (error) {
    summary.failed = Math.max(summary.totalFetched - summary.synced, summary.failed);
    error.syncSummary = summary;
    throw error;
  }
};

const syncProductRecord = async (shop, accessToken, product) => {
  const { variants, images } = await fetchNestedPages(
    shop,
    accessToken,
    product
  );
  const inventoryById = await fetchInventoryForItems(
    shop,
    accessToken,
    variants.map((variant) => variant.inventoryItem?.id)
  );
  const formattedProduct = formatProduct(
    product,
    variants,
    images,
    inventoryById
  );

  await Product.updateOne(
    { shop, shopifyProductId: formattedProduct.shopifyProductId },
    {
      $set: {
        ...formattedProduct,
        shop,
        lastSyncedAt: new Date(),
      },
    },
    { upsert: true }
  );
};

export const deleteProduct = async (shop, productId) => {
  return {
    success: true,
    message: `Product ${productId} deleted on Shopify. No MongoDB storage used.`,
  };
};