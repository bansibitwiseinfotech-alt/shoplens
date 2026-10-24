import {
    getTrendingOverview,
    getTrendingSearchList,
} from "../services/trendingSearchService.js";

const parseDays = (value) => {
    const days = Number(value || 30);

    if (![7, 14, 30, 60, 90].includes(days)) {
        return null;
    }

    return days;
};

export const getTrendingOverviewController = async (req, res) => {
    try {
        const shop =
            req.trendingSearchQuery?.shop ||
            String(req.query.shop || "")
                .trim()
                .toLowerCase();

        const days =
            req.trendingSearchQuery?.days ||
            parseDays(req.query.days);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "shop is required.",
            });
        }

        if (!days) {
            return res.status(400).json({
                success: false,
                message: "days must be 7, 14, 30, 60 or 90.",
            });
        }

        const result = await getTrendingOverview({
            shop,
            days,
        });

        return res.status(200).json({
            success: true,
            message: "Trending search overview generated successfully.",
            data: result,
        });
    } catch (error) {
        console.error(
            "Trending Search Overview Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to generate trending search overview.",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined,
        });
    }
};

export const getTrendingSearchListController = async (
    req,
    res
) => {
    try {
        const shop =
            req.trendingSearchQuery?.shop ||
            String(req.query.shop || "")
                .trim()
                .toLowerCase();

        const days =
            req.trendingSearchQuery?.days ||
            parseDays(req.query.days);

        const trendType = req.query.trendType
            ? String(req.query.trendType).trim()
            : undefined;

        const limit = Number(req.query.limit || 50);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "shop is required.",
            });
        }

        if (!days) {
            return res.status(400).json({
                success: false,
                message: "days must be 7, 14, 30, 60 or 90.",
            });
        }

        if (
            trendType &&
            !["Rising", "New", "Seasonal", "Stable"].includes(
                trendType
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "trendType must be Rising, New, Seasonal or Stable.",
            });
        }

        const trends = await getTrendingSearchList({
            shop,
            days,
            trendType,
            limit,
        });

        return res.status(200).json({
            success: true,
            message: "Trending searches fetched successfully.",
            data: {
                trends,
                count: trends.length,
                days,
            },
        });
    } catch (error) {
        console.error(
            "Trending Search List Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch trending searches.",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined,
        });
    }
};