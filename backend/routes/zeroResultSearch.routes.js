import express from "express";

import {
    getZeroResultSearchesController,
    getZeroResultSummaryController,
    createSearchEventController,
} from "../controllers/zeroResultSearch.controller.js";
import { authenticateShop } from "../middleware/authenticateShop.js";

const router = express.Router();

/**
 * Record Shopify/Web Pixel event.
 *
 * POST /api/search-events
 */
router.post(
    "/search-events",
    createSearchEventController
);

router.use("/zero-result-searches", authenticateShop);

/**
 * Get zero-result search list.
 *
 * GET /api/zero-result-searches
 */
router.get(
    "/zero-result-searches",
    getZeroResultSearchesController
);

/**
 * Get Page 4 dashboard summary.
 *
 * GET /api/zero-result-searches/summary
 */
router.get(
    "/zero-result-searches/summary",
    getZeroResultSummaryController
);

export default router;
