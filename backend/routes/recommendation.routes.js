import express from "express";

import {
    listRecommendations,
    getRecommendationSummary,
    getRecommendation,
    getRecommendationHistory,
    reviewRecommendation,
    inProgressRecommendation,
    completeRecommendation,
    dismissRecommendation,
    executeAction,
    refreshRecommendations,
    listStoreCollections,
} from "../controllers/recommendationController.js";

import authenticateShop from "../middleware/authenticateShop.js";
import { requireFeature } from "../middleware/billingMiddleware.js";
import { FEATURES } from "../config/billingPlans.js";

const router = express.Router();

// Every endpoint requires Shopify session authentication.
router.use(authenticateShop);
router.use(requireFeature(FEATURES.MERCHANDISING_RECOMMENDATIONS));

// Register literal paths before /:id parameter route.
router.post("/refresh", refreshRecommendations);
router.get("/summary", getRecommendationSummary);
router.get("/collections", listStoreCollections);

router.get("/", listRecommendations);
router.get("/:id", getRecommendation);
router.get("/:id/history", getRecommendationHistory);

router.post("/:id/review", reviewRecommendation);
router.post("/:id/in-progress", inProgressRecommendation);
router.post("/:id/complete", completeRecommendation);
router.post("/:id/dismiss", dismissRecommendation);
router.post("/:id/action/execute", executeAction);

export default router;