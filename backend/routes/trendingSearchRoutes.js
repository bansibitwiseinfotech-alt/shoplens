import express from "express";

import {
    getTrendingOverviewController,
    getTrendingSearchListController,
} from "../controllers/trendingSearchController.js";

import {
    validateTrendingSearchQuery,
} from "../validators/trendingSearchValidator.js";
import { authenticateShop } from "../middleware/authenticateShop.js";
import { requireFeature } from "../middleware/billingMiddleware.js";
import { FEATURES } from "../config/billingPlans.js";

const router = express.Router();

router.use(authenticateShop);
router.use(requireFeature(FEATURES.TRENDING_SEARCH));

router.get(
    "/overview",
    validateTrendingSearchQuery,
    getTrendingOverviewController
);

router.get(
    "/list",
    validateTrendingSearchQuery,
    getTrendingSearchListController
);
                                                                                                                                        
export default router;                                                                                              