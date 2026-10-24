import express from "express";
import {
  startOAuth,
  oauthCallback,
  testConnection,
  getAuthStatus,
} from "../controllers/authController.js";
import { authenticateShop, requireShopifyAccessToken } from "../middleware/authenticateShop.js";

const router = express.Router();

// Public routes for initiating and completing OAuth
router.get("/install", startOAuth);
router.get("/callback", oauthCallback);
router.get("/status", getAuthStatus);

// Protected route to test Shopify API connection
router.get("/test-connection", authenticateShop, requireShopifyAccessToken, testConnection);

export default router;