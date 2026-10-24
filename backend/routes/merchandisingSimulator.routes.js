import express from "express";
import {
  listProducts,
  getBaseline,
  calculateScenario,
  saveScenario,
  listScenarios,
  getScenario,
  deleteScenario,
} from "../controllers/merchandisingSimulator.controller.js";
import { authenticateShop } from "../middleware/authenticateShop.js";
import { requireFeature } from "../middleware/billingMiddleware.js";
import { FEATURES } from "../config/billingPlans.js";

const router = express.Router();

// Protect all simulator routes using Shopify session-token authentication
router.use(authenticateShop);
router.use(requireFeature(FEATURES.MERCHANDISING_SIMULATOR));

router.get("/products", listProducts);
router.get("/baseline", getBaseline);
router.post("/calculate", calculateScenario);

router.post("/scenarios", saveScenario);
router.get("/scenarios", listScenarios);
router.get("/scenarios/:id", getScenario);
router.delete("/scenarios/:id", deleteScenario);

export default router;
