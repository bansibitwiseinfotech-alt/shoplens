import express from "express";

import {
    getDiscoverability,
    getDiscoverabilitySummary,
    calculateDiscoverability,
} from "../controllers/productDiscoverabilityController.js";
import {
    authenticateShop,
    requireShopifyAccessToken,
    requireStoreScopes,
} from "../middleware/authenticateShop.js";

const router = express.Router();
router.use(authenticateShop, requireStoreScopes("read_products"), requireShopifyAccessToken);

/**
 * GET /api/product-discoverability
 *
 * Lowest discoverability first by default.
 */
router.get(
    "/",
    getDiscoverability
);

/**
 * GET /api/product-discoverability/summary
 */
router.get(
    "/summary",
    getDiscoverabilitySummary
);

/**
 * POST /api/product-discoverability/calculate
 */
router.post(
    "/calculate",
    calculateDiscoverability
);

export default router;