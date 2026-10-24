import {
    getZeroResultSearches,
    getZeroResultSummary,
    createSearchEvent,
} from "../services/zeroResultSearch.service.js";
import { normalizeQuery } from "../utils/normalizeQuery.js";
import searchIntentService from "../services/searchIntentService.js";
import Subscription from "../models/Subscription.js";
import { LIMIT_KEYS, getPlanLimit } from "../config/billingPlans.js";

/**
 * Resolve shop identifier from request.
 */
function resolveShop(req) {
    if (typeof req.shop === "string") return req.shop;
    if (req.shop && typeof req.shop === "object") {
        return (
            req.shop.shop ||
            req.shop.shopDomain ||
            req.shop.domain ||
            req.shop.myshopifyDomain ||
            null
        );
    }
    return (
        req.headers["x-shopify-shop-domain"] ||
        req.headers["x-shop-domain"] ||
        req.query?.shop ||
        req.body?.shop ||
        null
    );
}

/**
 * Record a search event (e.g. from Shopify Web Pixel or storefront).
 * POST /api/search-events
 */
export async function createSearchEventController(req, res) {
    try {
        const body = req.body || {};
        const shop = resolveShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const eventData = {
            ...body,
            shop: shop.toLowerCase().trim(),
            eventId: body.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            eventType: body.eventType || "search",
            eventName: body.eventName || "search_submitted",
            query: body.query || "",
            normalizedQuery: body.normalizedQuery || normalizeQuery(body.query || ""),
            resultCount: body.resultCount !== undefined ? Number(body.resultCount) : 0,
            occurredAt: (() => {
                const parsed = body.occurredAt ? new Date(body.occurredAt) : new Date();
                return isNaN(parsed.getTime()) || parsed.getTime() > Date.now() ? new Date() : parsed;
            })(),
        };

        const savedEvent = await createSearchEvent(eventData);

        // Keep search intent table continuously synchronized in background
        searchIntentService.syncFromSearchEvents(shop.toLowerCase().trim()).catch((err) => {
            console.warn("[ZeroResultSearch] Background search intent sync failed:", err.message);
        });

        return res.status(201).json({
            success: true,
            data: savedEvent,
        });
    } catch (error) {
        console.error("Error creating search event:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to record search event.",
            error: error.message,
        });
    }
}

/**
 * Get zero-result searches list.
 * GET /api/zero-result-searches
 */
export async function getZeroResultSearchesController(req, res) {
    try {
        const shop = resolveShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const normalizedShop = shop.toLowerCase().trim();
        const subscription = await Subscription.getOrCreateForShop(normalizedShop);
        const planId = subscription.isActive() ? subscription.plan : "free";
        const planLimit = getPlanLimit(planId, LIMIT_KEYS.ZERO_RESULT_SEARCH_QUERIES);

        const { from, to, sort = "recent", limit = 50 } = req.query;
        const requestedLimit = Number(limit) || 50;
        const fetchLimit = planLimit !== null ? Math.max(requestedLimit, planLimit) : requestedLimit;

        const results = await getZeroResultSearches({
            shop: normalizedShop,
            from,
            to,
            sort,
            limit: fetchLimit,
        });

        const totalAvailable = results.length;
        const slicedResults = planLimit !== null ? results.slice(0, planLimit) : results;

        return res.status(200).json({
            success: true,
            plan: planId,
            meta: {
                total: slicedResults.length,
                totalAvailable,
                planLimit,
                isLimitedByPlan: planLimit !== null && totalAvailable > planLimit,
                upgradeRequired: planLimit !== null && totalAvailable >= planLimit,
                sort,
                limit: planLimit !== null ? planLimit : requestedLimit,
            },
            data: slicedResults,
        });
    } catch (error) {
        console.error("Error fetching zero-result searches:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch zero-result searches.",
            error: error.message,
        });
    }
}

/**
 * Get zero-result searches summary.
 * GET /api/zero-result-searches/summary
 */
export async function getZeroResultSummaryController(req, res) {
    try {
        const shop = resolveShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required.",
            });
        }

        const { from, to } = req.query;

        const summary = await getZeroResultSummary({
            shop: shop.toLowerCase().trim(),
            from,
            to,
        });

        return res.status(200).json({
            success: true,
            data: summary,
        });
    } catch (error) {
        console.error("Error fetching zero-result summary:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch zero-result summary.",
            error: error.message,
        });
    }
}
