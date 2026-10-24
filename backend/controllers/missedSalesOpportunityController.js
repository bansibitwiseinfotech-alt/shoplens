import {
    getMissedSalesOpportunityOverview,
    getMissedSalesOpportunityList,
    getMissedSalesOpportunityDetails,
} from "../services/missedSalesOpportunityService.js";

const getRequestValues = (req) => {
    const shop =
        req.missedSalesOpportunityQuery?.shop ||
        String(req.query.shop || "")
            .trim()
            .toLowerCase();

    const days =
        req.missedSalesOpportunityQuery?.days ||
        Number(req.query.days || 30);

    return {
        shop,
        days,
    };
};

export const getMissedSalesOpportunityOverviewController =
    async (req, res) => {
        try {
            const { shop, days } =
                getRequestValues(req);

            if (!shop) {
                return res.status(400).json({
                    success: false,
                    message: "shop is required.",
                });
            }

            const data =
                await getMissedSalesOpportunityOverview({
                    shop,
                    days,
                });

            return res.status(200).json({
                success: true,

                message:
                    "Missed sales opportunity overview generated successfully.",

                data,
            });
        } catch (error) {
            console.error(
                "Missed Sales Opportunity Overview Error:",
                error
            );

            return res.status(500).json({
                success: false,

                message:
                    "Failed to generate missed sales opportunities.",

                error:
                    process.env.NODE_ENV ===
                        "development"
                        ? error.message
                        : undefined,
            });
        }
    };

export const getMissedSalesOpportunityListController =
    async (req, res) => {
        try {
            const { shop, days } =
                getRequestValues(req);

            const impactLevel =
                req.query.impactLevel
                    ? String(
                        req.query.impactLevel
                    ).trim()
                    : undefined;

            const opportunityType =
                req.query.opportunityType
                    ? String(
                        req.query.opportunityType
                    ).trim()
                    : undefined;

            const limit = Number(
                req.query.limit || 50
            );

            if (
                impactLevel &&
                !["High", "Medium", "Low"].includes(
                    impactLevel
                )
            ) {
                return res.status(400).json({
                    success: false,

                    message:
                        "impactLevel must be High, Medium or Low.",
                });
            }

            const allowedTypes = [
                "Zero Result",
                "Low Discoverability",
                "Journey Drop-off",
                "Combined",
            ];

            if (
                opportunityType &&
                !allowedTypes.includes(
                    opportunityType
                )
            ) {
                return res.status(400).json({
                    success: false,

                    message:
                        "Invalid opportunityType.",
                });
            }

            const opportunities =
                await getMissedSalesOpportunityList({
                    shop,
                    days,
                    impactLevel,
                    opportunityType,
                    limit,
                });

            return res.status(200).json({
                success: true,

                message:
                    "Missed sales opportunities fetched successfully.",

                data: {
                    opportunities,

                    count: opportunities.length,

                    days,
                },
            });
        } catch (error) {
            console.error(
                "Missed Sales Opportunity List Error:",
                error
            );

            return res.status(500).json({
                success: false,

                message:
                    "Failed to fetch missed sales opportunities.",

                error:
                    process.env.NODE_ENV ===
                        "development"
                        ? error.message
                        : undefined,
            });
        }
    };

export const getMissedSalesOpportunityDetailsController =
    async (req, res) => {
        try {
            const { shop, days } =
                getRequestValues(req);

            const opportunityKey =
                String(
                    req.query.opportunityKey ||
                    req.params.opportunityKey ||
                    ""
                ).trim();

            if (!opportunityKey) {
                return res.status(400).json({
                    success: false,

                    message:
                        "opportunityKey is required.",
                });
            }

            const opportunity =
                await getMissedSalesOpportunityDetails({
                    shop,
                    opportunityKey,
                    days,
                });

            if (!opportunity) {
                return res.status(404).json({
                    success: false,

                    message:
                        "Missed sales opportunity not found.",
                });
            }

            return res.status(200).json({
                success: true,

                message:
                    "Missed sales opportunity details fetched successfully.",

                data: opportunity,
            });
        } catch (error) {
            console.error(
                "Missed Sales Opportunity Details Error:",
                error
            );

            return res.status(500).json({
                success: false,

                message:
                    "Failed to fetch opportunity details.",

                error:
                    process.env.NODE_ENV ===
                        "development"
                        ? error.message
                        : undefined,
            });
        }
    };