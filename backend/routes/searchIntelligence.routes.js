import express from "express";
import {
    ingestEvent,
    getSummary,
    getQueries,
    getTrends,
    getProducts,
    getSearchedProductsController,
    getConversions,
} from "../controllers/searchIntelligence.controller.js";
import {
    authenticateShop,
    requireShopifyAccessToken,
    requireStoreScopes,
} from "../middleware/authenticateShop.js";
import { verifySearchIntelligenceRequest } from "../middleware/verifySearchIntelligenceRequest.js";

const router = express.Router();

/**
 * Public Web Pixel / Storefront Event Ingestion
 */
router.post("/events", verifySearchIntelligenceRequest, ingestEvent);

/**
 * Merchant Search Intelligence Analytics Endpoints
 */
router.use(authenticateShop);
router.get("/summary", getSummary);
router.get("/queries", getQueries);
router.get("/trends", getTrends);
router.get("/products", requireStoreScopes("read_products"), requireShopifyAccessToken, getProducts);
router.get("/searched-products", requireStoreScopes("read_products"), requireShopifyAccessToken, getSearchedProductsController);
router.get("/conversions", getConversions);

export default router;
