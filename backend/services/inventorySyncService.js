import { shopifyGraphQL } from "./shopifyGraphqlService.js";

const INVENTORY_ITEMS_QUERY = `
  query InventoryItems($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on InventoryItem {
        id
        tracked
        inventoryLevels(first: 100) {
          edges {
            node {
              id
              quantities(names: ["available"]) {
                name
                quantity
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
  }
`;

const INVENTORY_ITEM_LEVELS_QUERY = `
  query InventoryItemLevels($id: ID!, $after: String) {
    inventoryItem(id: $id) {
      id
      tracked
      inventoryLevels(first: 100, after: $after) {
        edges {
          node {
            id
            quantities(names: ["available"]) {
              name
              quantity
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

const INVENTORY_BATCH_SIZE = 5;

const getLevels = (connection) =>
  connection.edges.map(({ node }) => {
    const available = node.quantities.find(
      ({ name }) => name === "available"
    )?.quantity;

    return {
      inventoryLevelId: node.id,
      availableQuantity: Number.isInteger(available) ? available : null,
    };
  });

const fetchRemainingLevels = async (
  shop,
  accessToken,
  inventoryItemId,
  inventoryItem
) => {
  const levels = getLevels(inventoryItem.inventoryLevels);
  let pageInfo = inventoryItem.inventoryLevels.pageInfo;

  while (pageInfo.hasNextPage) {
    if (!pageInfo.endCursor) {
      throw new Error(
        `Shopify returned a missing inventory cursor for ${inventoryItemId}.`
      );
    }

    const data = await shopifyGraphQL({
      shop,
      accessToken,
      query: INVENTORY_ITEM_LEVELS_QUERY,
      variables: { id: inventoryItemId, after: pageInfo.endCursor },
    });
    const nextItem = data.inventoryItem;

    if (!nextItem || nextItem.id !== inventoryItemId) {
      throw new Error(
        `Shopify inventory item ${inventoryItemId} was not found during pagination.`
      );
    }

    levels.push(...getLevels(nextItem.inventoryLevels));
    if (
      nextItem.inventoryLevels.pageInfo.hasNextPage &&
      (!nextItem.inventoryLevels.pageInfo.endCursor ||
        nextItem.inventoryLevels.pageInfo.endCursor === pageInfo.endCursor)
    ) {
      throw new Error(
        `Shopify returned an invalid inventory cursor for ${inventoryItemId}.`
      );
    }
    pageInfo = nextItem.inventoryLevels.pageInfo;
  }

  return {
    tracked: inventoryItem.tracked,
    inventoryLevels: levels,
  };
};

export const fetchInventoryForItems = async (
  shop,
  accessToken,
  inventoryItemIds
) => {
  const ids = [...new Set(inventoryItemIds.filter(Boolean))];
  const inventoryById = new Map();

  for (let offset = 0; offset < ids.length; offset += INVENTORY_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + INVENTORY_BATCH_SIZE);
    const data = await shopifyGraphQL({
      shop,
      accessToken,
      query: INVENTORY_ITEMS_QUERY,
      variables: { ids: batch },
    });
    const inventoryItems = data.nodes.filter(Boolean);

    for (const inventoryItemId of batch) {
      const inventoryItem = inventoryItems.find(
        (item) => item.id === inventoryItemId
      );
      if (!inventoryItem) {
        throw new Error(
          `Shopify did not return inventory item ${inventoryItemId}.`
        );
      }

      inventoryById.set(
        inventoryItemId,
        await fetchRemainingLevels(
          shop,
          accessToken,
          inventoryItemId,
          inventoryItem
        )
      );
    }
  }

  return inventoryById;
};

export { INVENTORY_ITEMS_QUERY, INVENTORY_ITEM_LEVELS_QUERY };
