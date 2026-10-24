import { syncProducts } from "../services/productSyncService.js";
import { syncCollections } from "../services/collectionSyncService.js";
import { syncOrders } from "../services/orderSyncService.js";
import Store from "../models/Store.js";

const handleShopifyWebhook = async (req, res) => {
  try {
    const topic = req.headers["x-shopify-topic"];
    const shop = req.headers["x-shopify-shop-domain"];

    const store = await Store.findOne({ shop });

    if (!store) {
      return res.status(404).send("Store not found");
    }

    switch (topic) {
      case "products/create":
      case "products/update":
        await syncProducts(
          shop,
          store.accessToken
        );
        break;

      case "products/delete":
        // Delete logic can be added here
        break;

      case "collections/create":
      case "collections/update":
        await syncCollections(
          shop,
          store.accessToken
        );
        break;

      case "orders/create":
      case "orders/updated":
        await syncOrders(
          shop,
          store.accessToken
        );
        break;

      default:
        console.log(`Unhandled webhook: ${topic}`);
    }

    return res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).send("Webhook processing failed");
  }
};

export { handleShopifyWebhook };