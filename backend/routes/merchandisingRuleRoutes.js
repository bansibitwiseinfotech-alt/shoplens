import { Router } from "express";
import {
  listRules,
  getOverview,
  listShopCollections,
  createRule,
  updateRule,
  deleteRule,
  applyRules,
  previewRule,
} from "../controllers/merchandisingRuleController.js";

import {
  authenticateShop,
  requireShopifyAccessToken,
  requireStoreScopes,
} from "../middleware/authenticateShop.js";
import { requireFeature } from "../middleware/billingMiddleware.js";
import { FEATURES } from "../config/billingPlans.js";

const router = Router();

router.use(authenticateShop);
router.use(requireFeature(FEATURES.SMART_MERCHANDISING_RULES));

// Overview endpoints (both /rules/overview and /overview)
router.get(
  "/rules/overview",
  requireStoreScopes("read_products"),
  getOverview
);

// Collections endpoints
router.get(
  "/rules/collections",
  requireStoreScopes("read_products"),
  requireShopifyAccessToken,
  listShopCollections
);
router.get(
  "/collections",
  requireStoreScopes("read_products"),
  requireShopifyAccessToken,
  listShopCollections
);

// Rule CRUD endpoints
router.get("/rules", requireStoreScopes("read_products"), listRules);
router.post("/rules", requireStoreScopes("read_products"), createRule);
router.patch(
  "/rules/:id",
  requireStoreScopes("read_products"),
  updateRule
);
router.delete(
  "/rules/:id",
  requireStoreScopes("read_products"),
  deleteRule
);

// Apply endpoint
router.post(
  "/apply",
  requireStoreScopes("read_products", "write_products"),
  requireShopifyAccessToken,
  applyRules
);

// Preview endpoints (read-only)
router.post(
  "/rules/preview",
  requireStoreScopes("read_products"),
  requireShopifyAccessToken,
  previewRule
);
router.post(
  "/preview",
  requireStoreScopes("read_products"),
  requireShopifyAccessToken,
  previewRule
);

export default router;
