import express from "express";

import {
    syncProductsController,
    getLiveProductsController,
} from "../controllers/productSyncController.js";
import {
    authenticateShop,
    requireShopifyAccessToken,
    requireStoreScopes,
} from "../middleware/authenticateShop.js";

const router = express.Router();

router.use(authenticateShop, requireStoreScopes("read_products"));
router.post("/products", requireShopifyAccessToken, syncProductsController);
router.get("/products", requireShopifyAccessToken, getLiveProductsController);

export default router;