import {
    getCollectionOverview,
    getCollectionDetail,
    getPositioningProblems,
} from "../services/collectionMerchandisingService.js";
import MerchandisingRule from "../models/MerchandisingRule.js";

/**
 * Resolve shop domain from request context (session, auth middleware, headers, or query).
 */
function resolveShop(req) {
    if (typeof req.shop === "string" && req.shop.trim()) {
        return req.shop.trim().toLowerCase();
    }
    return null;
}

/**
 * Validate and parse date range query parameters (startDate, endDate).
 * Defaults to the previous 30 days if not supplied.
 * Throws 400 error on invalid formats or if startDate > endDate.
 */
function parseDateRange(req) {
    const now = new Date();
    let startDate;
    let endDate;

    if (req.query.endDate) {
        endDate = new Date(req.query.endDate);
        if (Number.isNaN(endDate.getTime())) {
            const err = new Error("Invalid 'endDate' format. Please provide a valid ISO date string.");
            err.statusCode = 400;
            throw err;
        }
        // If date string is YYYY-MM-DD (length <= 10), set to end of that day
        if (typeof req.query.endDate === "string" && req.query.endDate.trim().length <= 10) {
            endDate.setUTCHours(23, 59, 59, 999);
        }
    } else {
        endDate = now;
    }

    if (req.query.startDate) {
        startDate = new Date(req.query.startDate);
        if (Number.isNaN(startDate.getTime())) {
            const err = new Error("Invalid 'startDate' format. Please provide a valid ISO date string.");
            err.statusCode = 400;
            throw err;
        }
        if (typeof req.query.startDate === "string" && req.query.startDate.trim().length <= 10) {
            startDate.setUTCHours(0, 0, 0, 0);
        }
    } else {
        // Include today and the previous 29 calendar days.
        if (!req.query.endDate) {
            endDate = new Date(now);
            endDate.setUTCHours(23, 59, 59, 999);
        }
        startDate = new Date(endDate);
        startDate.setUTCHours(0, 0, 0, 0);
        startDate.setUTCDate(startDate.getUTCDate() - 29);
    }

    if (startDate.getTime() > endDate.getTime()) {
        const err = new Error("'startDate' cannot be after 'endDate'.");
        err.statusCode = 400;
        throw err;
    }

    return { startDate, endDate };
}

/**
 * GET /api/merchandising/overview
 * Collection-level merchandising overview and store summary.
 */
export async function overview(req, res) {
    try {
        const shop = resolveShop(req);
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const { startDate, endDate } = parseDateRange(req);

        const result = await getCollectionOverview({
            shop,
            startDate,
            endDate,
        });

        // Also query rule summary for general overview compatibility
        let ruleSummary = { totalRules: 0, activeRules: 0, collectionsCovered: 0, lastApplied: null };
        try {
            const [totalRules, activeRules, rules] = await Promise.all([
                MerchandisingRule.countDocuments({ shop }),
                MerchandisingRule.countDocuments({ shop, isActive: true }),
                MerchandisingRule.find({ shop, isActive: true }).select("collectionIds").lean(),
            ]);
            const collectionsCovered = new Set(rules.flatMap((r) => r.collectionIds || [])).size;
            const lastRun = await MerchandisingRule.findOne({ shop, lastRunAt: { $ne: null } })
                .sort({ lastRunAt: -1 })
                .select("lastRunAt")
                .lean();
            ruleSummary = {
                totalRules,
                activeRules,
                collectionsCovered,
                lastApplied: lastRun?.lastRunAt ?? null,
            };
        } catch {
            // Keep default if rule query fails
        }

        return res.status(200).json({
            success: true,
            summary: result.summary,
            currency: result.currency,
            collections: result.collections,
            totalRules: ruleSummary.totalRules,
            activeRules: ruleSummary.activeRules,
            collectionsCovered: ruleSummary.collectionsCovered,
            lastApplied: ruleSummary.lastApplied,
            data: ruleSummary,
        });
    } catch (error) {
        console.error("Collection merchandising overview error:", error.message || error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to load collection merchandising overview.",
        });
    }
}

/**
 * GET /api/merchandising/collections/:collectionId
 * Detailed merchandising performance and product positioning for a single collection.
 */
export async function detail(req, res) {
    try {
        const shop = resolveShop(req);
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const { collectionId } = req.params;
        if (!collectionId) {
            return res.status(400).json({
                success: false,
                message: "Collection ID is required.",
            });
        }

        const decodedCollectionId = decodeURIComponent(collectionId);
        const { startDate, endDate } = parseDateRange(req);

        const result = await getCollectionDetail({
            shop,
            collectionId: decodedCollectionId,
            startDate,
            endDate,
        });

        return res.status(200).json({
            success: true,
            collection: result.collection,
            performance: result.performance,
            currency: result.currency,
            products: result.products,
            recommendations: result.recommendations,
            topProducts: result.topProducts,
            weakProducts: result.weakProducts,
        });
    } catch (error) {
        console.error("Collection merchandising detail error:", error.message || error);

        const status = error.statusCode || (error.message === "Collection not found." ? 404 : 500);

        return res.status(status).json({
            success: false,
            message: error.message || "Failed to load collection merchandising detail.",
        });
    }
}

/**
 * GET /api/merchandising/positioning/problems
 * Return all detected product positioning problems across all collections.
 */
export async function positioningProblems(req, res) {
    try {
        const shop = resolveShop(req);
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const { startDate, endDate } = parseDateRange(req);

        const problems = await getPositioningProblems({
            shop,
            startDate,
            endDate,
        });

        return res.status(200).json({
            success: true,
            count: problems.length,
            problems,
        });
    } catch (error) {
        console.error("Collection positioning problems error:", error.message || error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to load positioning problems.",
        });
    }
}
