import Store from "../models/Store.js";
import { syncShopData } from "../services/syncService.js";

export const runScheduledSync = async () => {
  try {
    const stores = await Store.find({
      installed: true,
    });

    for (const store of stores) {
      try {
        console.log(
          `Starting scheduled sync: ${store.shop}`
        );

        await syncShopData(store.shop);

        console.log(
          `Scheduled sync completed: ${store.shop}`
        );
      } catch (error) {
        console.error(
          `Scheduled sync failed: ${store.shop}`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error(
      "Scheduled sync error:",
      error.message
    );
  }
};