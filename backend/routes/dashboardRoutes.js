import express from "express";
import { getDashboardOverviewController } from "../controllers/dashboardController.js";
import {
  authenticateShop,
  requireShopifyAccessToken,
} from "../middleware/authenticateShop.js";

const router = express.Router();

router.use(authenticateShop);

// Optional access token attachment so catalog lookups can use Shopify GraphQL if necessary
router.use(async (req, res, next) => {
  try {
    await requireShopifyAccessToken(req, res, () => {});
  } catch {
    // Continue even if access token is not immediately available
  }
  next();
});
          
/**
 * GET /api/dashboard/overview
 * Returns unified analytics across all ShopLens modules.
 */
router.get("/overview", getDashboardOverviewController);

export default router;
                         