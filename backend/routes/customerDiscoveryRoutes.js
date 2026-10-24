import express from "express";

import {
    ingestEvent,
    getCustomerDiscoveryOverview,
} from "../controllers/customerDiscoveryController.js";

import { authenticateShop } from "../middleware/authenticateShop.js";
import { requireFeature } from "../middleware/billingMiddleware.js";
import { FEATURES } from "../config/billingPlans.js";

const router = express.Router();

/**
 * Store real Shopify/Web Pixel customer discovery event
 */
router.post(
    "/events",
    ingestEvent
);

/**
 * Get Customer Discovery Journey overview
 */
router.get(
    "/overview",
    authenticateShop,
    requireFeature(FEATURES.CUSTOMER_DISCOVERY),
    getCustomerDiscoveryOverview
);

export default router;