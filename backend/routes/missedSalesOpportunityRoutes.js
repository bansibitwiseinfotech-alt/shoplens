import express from "express";

import {
    getMissedSalesOpportunityOverviewController,
    getMissedSalesOpportunityListController,
    getMissedSalesOpportunityDetailsController,
} from "../controllers/missedSalesOpportunityController.js";

import {
    validateMissedSalesOpportunityQuery,
} from "../validators/missedSalesOpportunityValidator.js";

const router = express.Router();

router.get(
    "/overview",
    validateMissedSalesOpportunityQuery,
    getMissedSalesOpportunityOverviewController
);

router.get(
    "/list",
    validateMissedSalesOpportunityQuery,
    getMissedSalesOpportunityListController
);

router.get(
    "/details",
    validateMissedSalesOpportunityQuery,
    getMissedSalesOpportunityDetailsController
);

export default router;