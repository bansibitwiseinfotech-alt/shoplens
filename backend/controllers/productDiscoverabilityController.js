import {
    calculateProductDiscoverability,
} from "../services/productDiscoverabilityService.js";
import Subscription from "../models/Subscription.js";
import { LIMIT_KEYS, getPlanLimit } from "../config/billingPlans.js";

/**
 * Extracts the shop domain from request context, headers, or query parameters.
 */
const extractShop = (req) => {
    return (
        req.shop ||
        req.shopDomain ||
        req.headers["x-shopify-shop-domain"] ||
        req.headers["x-shop-domain"] ||
        req.body?.shop ||
        req.query?.shop
    );
};

/**
 * GET /api/product-discoverability
 *
 * Query params:
 * ?sort=lowest (default) or ?sort=highest
 * &limit=50 (default: 50, max: 250)
 */
export const getDiscoverability = async (req, res) => {
    try {
        const shop = extractShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const { sort = "lowest", limit = 250, status, from, to } = req.query;

        let products = await calculateProductDiscoverability({
            shop,
            accessToken: req.accessToken,
            from,
            to,
        });

        // Filter by status if requested
        if (status && status !== "all") {
            const normalizedStatus = String(status).toLowerCase();
            products = products.filter((p) => {
                if (normalizedStatus === "easy" || normalizedStatus === "easy_to_find") {
                    return p.discoverabilityScore >= 80;
                }
                if (normalizedStatus === "needs_improvement" || normalizedStatus === "medium") {
                    return p.discoverabilityScore >= 60 && p.discoverabilityScore < 80;
                }
                if (normalizedStatus === "hard" || normalizedStatus === "hard_to_find") {
                    return p.discoverabilityScore < 60;
                }
                return true;
            });
        }

        const sortOrder = sort === "highest" ? -1 : 1;
        products.sort((a, b) =>
            (Number(a.discoverabilityScore) - Number(b.discoverabilityScore)) * sortOrder
        );

        const subscription = await Subscription.getOrCreateForShop(shop);
        const planId = subscription.isActive() ? subscription.plan : "free";
        const planLimit = getPlanLimit(planId, LIMIT_KEYS.PRODUCT_DISCOVERABILITY_PRODUCTS);

        const totalAvailable = products.length;
        const requestedLimit = Number(limit) > 0 ? Number(limit) : 250;
        const effectiveLimit = planLimit !== null ? Math.min(requestedLimit, planLimit) : requestedLimit;

        if (effectiveLimit > 0) {
            products.splice(effectiveLimit);
        }

        // Map response to match required schema
        const formattedProducts = products.map((p) => ({
            productId: p.productId,
            productTitle: p.productTitle,
            productHandle: p.productHandle,
            vendor: p.vendor,
            productStatus: p.productStatus,
            featuredImage: p.featuredImage,
            totalInventory: p.totalInventory,
            searchVisibility: p.searchVisibility,
            views: p.views,
            clicks: p.clicks,
            addToCart: p.addToCart,
            purchases: p.purchases,
            collectionCount: p.collectionCount,
            discoverabilityScore: p.discoverabilityScore,
            discoverabilityStatus: p.discoverabilityStatus,
            searchVisibilityScore: p.searchVisibilityScore,
            viewsScore: p.viewsScore,
            clicksScore: p.clicksScore,
            collectionPlacementScore: p.collectionPlacementScore,
            addToCartScore: p.addToCartScore,
            purchasesScore: p.purchasesScore,
            calculatedAt: p.calculatedAt,
        }));

        return res.status(200).json({
            success: true,
            plan: planId,
            count: formattedProducts.length,
            meta: {
                total: formattedProducts.length,
                totalAvailable,
                planLimit,
                isLimitedByPlan: planLimit !== null && totalAvailable > planLimit,
                upgradeRequired: planLimit !== null && totalAvailable >= planLimit,
            },
            data: formattedProducts,
        });
    } catch (error) {
        console.error("Get product discoverability error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get product discoverability",
            error: error.message,
        });
    }
};

/**
 * GET /api/product-discoverability/summary
 *
 * Returns summary counts and average score from real MongoDB records.
 * Automatically triggers calculation if data does not exist yet.
 */
export const getDiscoverabilitySummary = async (req, res) => {
    try {
        const shop = extractShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const { from, to } = req.query;

        const products = await calculateProductDiscoverability({
            shop,
            accessToken: req.accessToken,
            from,
            to,
        });
        const totalProducts = products.length;
        const summaryData = {
            totalProducts,
            easyToFind: products.filter((product) => product.discoverabilityScore >= 80).length,
            needsImprovement: products.filter(
                (product) => product.discoverabilityScore >= 60 && product.discoverabilityScore < 80
            ).length,
            hardToFind: products.filter((product) => product.discoverabilityScore < 60).length,
            averageScore: totalProducts
                ? Math.round(products.reduce((total, product) => total + Number(product.discoverabilityScore || 0), 0) / totalProducts)
                : 0,
        };

        return res.status(200).json({
            success: true,
            data: summaryData,
        });
    } catch (error) {
        console.error("Get discoverability summary error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to get discoverability summary",
            error: error.message,
        });
    }
};

/**
 * POST /api/product-discoverability/calculate
 *
 * Triggers calculation directly from real MongoDB collections (products, collections,
 * search analytics, search events, orders) for the shop without requiring frontend metrics.
 */
export const calculateDiscoverability = async (req, res) => {
    try {
        const shop = extractShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const records = await calculateProductDiscoverability({
            shop,
            accessToken: req.accessToken,
        });

        return res.status(200).json({
            success: true,
            count: records.length,
            data: records,
        });
    } catch (error) {
        console.error("Calculate discoverability error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to calculate discoverability",
            error: error.message,
        });
    }
};

export default {
    getDiscoverability,
    getDiscoverabilitySummary,
    calculateDiscoverability,
};