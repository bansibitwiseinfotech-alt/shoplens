import express from "express";
import {
    handleAppScopesUpdate,
    handleAppUninstalled,
} from "../controllers/webhookController.js";
import {
    getCustomerDataRequest,
    handleCustomerDataRequest,
    handleCustomerRedact,
    handleShopRedact,
} from "../controllers/privacyWebhookController.js";
import { authenticateShop } from "../middleware/authenticateShop.js";

import { handleAppSubscriptionUpdate } from "../controllers/billingWebhookController.js";

const router = express.Router();

router.post(
    "/app-uninstalled",
    express.raw({ type: "application/json" }),
    handleAppUninstalled
);
router.post(
    "/app/scopes_update",
    express.raw({ type: "application/json" }),
    handleAppScopesUpdate
);

router.post(
    "/app-subscriptions-update",
    express.raw({ type: "application/json" }),
    handleAppSubscriptionUpdate
);
router.post(
    "/app_subscriptions/update",
    express.raw({ type: "application/json" }),
    handleAppSubscriptionUpdate
);

router.post("/customers/data_request", express.raw({ type: "application/json" }), handleCustomerDataRequest);
router.post("/customers/redact", express.raw({ type: "application/json" }), handleCustomerRedact);
router.post("/shop/redact", express.raw({ type: "application/json" }), handleShopRedact);
router.get("/customer-data-requests/:requestId", authenticateShop, getCustomerDataRequest);

export default router;