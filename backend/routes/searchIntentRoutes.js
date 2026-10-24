import express from "express";

import {
    analyzeSearch,
    getOverview,
    getSearchIntents,
    getSearchIntentDetails,
    getStructuredIntent,
    matchProducts,
} from "../controllers/searchIntentController.js";

import {
    validateSearchIntent,
} from "../validators/searchIntentValidator.js";
import {
    authenticateShop,
    requireShopifyAccessToken,
    requireStoreScopes,
} from "../middleware/authenticateShop.js";
import { requireFeature } from "../middleware/billingMiddleware.js";
import { FEATURES } from "../config/billingPlans.js";

const router = express.Router();
router.use(authenticateShop);
router.use(requireFeature(FEATURES.SEARCH_INTENT_ANALYZER));

/*
|--------------------------------------------------------------------------
| Analyze and store search intent
|--------------------------------------------------------------------------
*/

router.post(
    "/analyze",
    requireStoreScopes("read_products"),
    requireShopifyAccessToken,
    validateSearchIntent,
    analyzeSearch
);

/*
|--------------------------------------------------------------------------
| Get overview
|--------------------------------------------------------------------------
*/

router.get(
    "/overview",
    getOverview
);

/*
|--------------------------------------------------------------------------
| Get structured intent
|--------------------------------------------------------------------------
| Used by Smart Product Matching
|--------------------------------------------------------------------------
*/

router.post(
    "/structured-intent",
    requireStoreScopes("read_products"),
    requireShopifyAccessToken,
    validateSearchIntent,
    getStructuredIntent
);

/*
|--------------------------------------------------------------------------
| Smart Product Matching
|--------------------------------------------------------------------------
| Find matching Shopify products based on search intent
|--------------------------------------------------------------------------
*/

router.post(
    "/match-products",
    requireStoreScopes("read_products"),
    requireShopifyAccessToken,
    matchProducts
);

/*
|--------------------------------------------------------------------------
| Get all search intents
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    getSearchIntents
);

/*
|--------------------------------------------------------------------------
| Get one search intent
|--------------------------------------------------------------------------
*/

router.get(
    "/:id",
    getSearchIntentDetails
);

export default router;