import express from "express";

import {
    overview,
    detail,
    positioningProblems,
} from "../controllers/collectionMerchandisingController.js";
import { authenticateShop } from "../middleware/authenticateShop.js";
import { requireFeature } from "../middleware/billingMiddleware.js";
import { FEATURES } from "../config/billingPlans.js";

const router = express.Router();

router.use(authenticateShop);

const requireCollectionMerchandising = requireFeature(FEATURES.COLLECTION_MERCHANDISING);

router.get("/overview", requireCollectionMerchandising, overview);
router.get("/positioning/problems", requireCollectionMerchandising, positioningProblems);
router.get("/collections/:collectionId", requireCollectionMerchandising, detail);

export default router;
