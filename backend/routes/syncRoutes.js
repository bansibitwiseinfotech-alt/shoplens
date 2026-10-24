import express from "express";

import {
    syncStore,
    syncOrdersController,
    getLiveOrdersController,
    syncCustomersController,
    getLiveCustomersController,
    syncCollectionsController,
} from "../controllers/syncController.js";
import {
    authenticateShop,
    requireShopifyAccessToken,
    requireStoreScopes,
} from "../middleware/authenticateShop.js";

const router = express.Router();

router.use(authenticateShop);
router.post("/store", syncStore);
router.post("/orders", requireStoreScopes("read_orders"), requireShopifyAccessToken, syncOrdersController);
router.get("/orders", requireStoreScopes("read_orders"), requireShopifyAccessToken, getLiveOrdersController);
router.get("/customers", requireStoreScopes("read_customers"), requireShopifyAccessToken, getLiveCustomersController);
router.post("/customers", requireStoreScopes("read_customers"), requireShopifyAccessToken, syncCustomersController);
router.post("/collections", requireStoreScopes("read_products"), requireShopifyAccessToken, syncCollectionsController);

export default router;