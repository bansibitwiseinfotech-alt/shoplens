import express from "express";
import {
  getPlans,
  getCurrentSubscription,
  subscribe,
  confirmSubscription,
  cancel,
  getUsage,
  getAccess,
} from "../controllers/billingController.js";
import {
  authenticateShop,
  requireShopifyAccessToken,
} from "../middleware/authenticateShop.js";

const router = express.Router();

/**
 * Public/Merchant plan definitions
 * GET /api/billing/plans
 */
router.get("/plans", getPlans);

/**
 * All remaining endpoints require Shopify session authentication
 */
router.use(authenticateShop);

/**
 * Current shop subscription status
 * GET /api/billing/current
 */
router.get("/current", requireShopifyAccessToken, getCurrentSubscription);

/**
 * Initiate subscription or activate Free plan
 * POST /api/billing/subscribe
 */
router.post("/subscribe", requireShopifyAccessToken, subscribe);

/**
 * Confirm/Verify approved subscription
 * GET /api/billing/confirm
 */
router.get("/confirm", requireShopifyAccessToken, confirmSubscription);

/**
 * Cancel active subscription
 * POST /api/billing/cancel
 */
router.post("/cancel", requireShopifyAccessToken, cancel);

/**
 * Usage counters and period limits
 * GET /api/billing/usage
 */
router.get("/usage", getUsage);

/**
 * Feature permissions and access restrictions
 * GET /api/billing/access
 */
router.get("/access", getAccess);

export default router;
