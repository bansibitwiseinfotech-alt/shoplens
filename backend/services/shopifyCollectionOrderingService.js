
const COLLECTION_QUERY = `#graphql
  query MerchandisingCollection($id: ID!) {
    collection(id: $id) {
      id
      title
      sortOrder
      products(first: 250) {
        nodes {
          id
          title
          createdAt
          totalInventory
        }
      }
    }
  }
`;

const SET_MANUAL_ORDER = `#graphql
  mutation SetManualCollectionOrder($input: CollectionInput!) {
    collectionUpdate(input: $input) {
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

const REORDER_PRODUCTS = `#graphql
  mutation ReorderCollectionProducts(
    $id: ID!,
    $moves: [MoveInput!]!
  ) {
    collectionReorderProducts(id: $id, moves: $moves) {
      job {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function runGraphQL(adminGraphql, query, variables) {
  const response = await adminGraphql(query, { variables });
  const result = typeof response?.json === "function"
    ? await response.json()
    : response;

  if (result?.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join("; "));
  }

  return result?.data ?? result;
}

export async function getCollection(adminGraphql, collectionId) {
  const data = await runGraphQL(adminGraphql, COLLECTION_QUERY, {
    id: collectionId,
  });

  if (!data?.collection) {
    throw new Error(`Shopify collection not found: ${collectionId}`);
  }

  const collection = data.collection;

  return {
    id: collection.id,
    title: collection.title,
    sortOrder: collection.sortOrder,
    products: collection.products.nodes.map((product, index) => ({
      id: product.id,
      title: product.title,
      createdAt: product.createdAt,
      availableQuantity: Number(product.totalInventory ?? 0),
      originalPosition: index + 1,
    })),
  };
}

export async function applyCollectionOrder(
  adminGraphql,
  collectionId,
  proposedProducts
) {
  // Shopify must support manual ordering for this collection.
  const manualResult = await runGraphQL(adminGraphql, SET_MANUAL_ORDER, {
    input: { id: collectionId, sortOrder: "MANUAL" },
  });

  const manualPayload = manualResult.collectionUpdate;
  if (manualPayload?.userErrors?.length) {
    throw new Error(
      manualPayload.userErrors.map((e) => e.message).join("; ")
    );
  }

  const moves = proposedProducts
    .map((product, index) => ({
      id: product.id,
      newPosition: String(index),
    }));

  // Shopify limits each mutation's move list. Keep requests bounded.
  for (let start = 0; start < moves.length; start += 250) {
    const chunk = moves.slice(start, start + 250);

    const result = await runGraphQL(adminGraphql, REORDER_PRODUCTS, {
      id: collectionId,
      moves: chunk,
    });

    const payload = result.collectionReorderProducts;
    if (payload?.userErrors?.length) {
      throw new Error(
        payload.userErrors.map((e) => e.message).join("; ")
      );
    }
  }

  // Read back Shopify data; do not claim success from the mutation alone.
  const verified = await getCollection(adminGraphql, collectionId);
  const expected = proposedProducts.map((p) => p.id);
  const actual = verified.products.map((p) => p.id);

  if (expected.some((id, index) => actual[index] !== id)) {
    throw new Error(
      `Shopify order verification failed for collection ${collectionId}.`
    );
  }

  return verified;
}
