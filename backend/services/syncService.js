import Store from "../models/Store.js";

import { syncProducts } from "./productSyncService.js";
import { syncCollections } from "./collectionSyncService.js";
import { syncOrders } from "./orderSyncService.js";
import { syncCustomers } from "./customerSyncService.js";
import { getFreshAccessToken } from "./shopifyTokenService.js";
import {
  getMissingShopifyScopes,
  SYNC_REQUIRED_SHOPIFY_SCOPES,
} from "../utils/shopifyScopes.js";
import { fetchCurrentGrantedScopes } from "./shopifyScopeService.js";

export const syncShopData = async (shop, overrides = {}) => {
  const {
    findStore = (query) => Store.findOne(query),
    updateStore = (query, update) => Store.findOneAndUpdate(query, update),
    getAccessToken = getFreshAccessToken,
    fetchGrantedScopes = fetchCurrentGrantedScopes,
    syncProducts: syncProductsFn = syncProducts,
    syncCollections: syncCollectionsFn = syncCollections,
    syncOrders: syncOrdersFn = syncOrders,
    syncCustomers: syncCustomersFn = syncCustomers,
  } = overrides;
  const normalizedShop = shop.toLowerCase().trim();

  const store = await findStore({
    shop: normalizedShop,
    installed: true,
  });

  if (!store) {
    throw new Error("Shop not found or app is not installed.");
  }

  await updateStore(
    { shop: normalizedShop },
    {
      syncStatus: "syncing",
      syncError: null,
    }
  );

  try {
    const accessToken = await getAccessToken(store);
    const grantedScopes = await fetchGrantedScopes(
      normalizedShop,
      accessToken
    );
    const grantedScopeSet = new Set(grantedScopes);
    const grantedScopeString = [...grantedScopeSet].join(",");
    const missingScopes = getMissingShopifyScopes(
      grantedScopeString,
      SYNC_REQUIRED_SHOPIFY_SCOPES
    );

    if (missingScopes.length > 0) {
      const error = new Error(
        `Shopify access token is missing required scopes: ${missingScopes.join(", ")}. Reauthorize the app and approve the requested permissions.`
      );
      error.reauthorizationRequired = true;
      await updateStore(
        { shop: normalizedShop, installed: true },
        {
          $set: {
            scope: grantedScopeString,
            reauthorizationRequired: true,
            syncError: error.message,
          },
        }
      );
      throw error;
    }

    await updateStore(
      { shop: normalizedShop, installed: true },
      {
        $set: {
          scope: grantedScopeString,
          reauthorizationRequired: false,
          syncError: null,
        },
      }
    );

    /*
     * Product synchronization
     */
    const products = await syncProductsFn(
      normalizedShop,
      accessToken
    );

    /*
     * Collection synchronization
     */
    const collections = await syncCollectionsFn(
      normalizedShop,
      accessToken
    );

    /*
     * Order synchronization
     */
    const orders = await syncOrdersFn(
      normalizedShop,
      accessToken
    );

    /*
     * Customer synchronization (optional, skipped if scope not granted or denied)
     */
    let customers = { totalFetched: 0, failed: 0 };
    if (grantedScopeSet.has("read_customers")) {
      try {
        customers = await syncCustomersFn(
          normalizedShop,
          accessToken
        );
      } catch (customerErr) {
        console.warn(
          `[Sync] Optional customer sync skipped for ${normalizedShop}:`,
          customerErr.message
        );
      }
    }

    /*
     * Update final sync status
     */
    await updateStore(
      { shop: normalizedShop },
      {
        $set: {
          syncStatus: "success",
          lastSyncAt: new Date(),
          syncError: null,
          reauthorizationRequired: false,
          syncStats: {
            products,
            collections,
            orders,
            customers,
          },
        },
      },
    );

    return {
      products,
      collections,
      orders,
      customers,
    };
  } catch (error) {
    console.error(
      `Shop data synchronization failed for ${normalizedShop}:`,
      error.message
    );

    const reauthorizationRequired =
      error.reauthorizationRequired ||
      /refresh token is (missing|expired)|refresh was rejected|reconnect this store|legacy non-expiring/i.test(
        error.message
      );
    await updateStore(
      { shop: normalizedShop },
      {
        $set: {
          syncStatus: "failed",
          syncError: error.message,
          ...(reauthorizationRequired ? { reauthorizationRequired: true } : {}),
        },
      }
    );

    throw error;
  }
};