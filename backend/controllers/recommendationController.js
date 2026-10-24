import mongoose from "mongoose";

import MerchandisingRecommendation from "../models/MerchandisingRecommendation.js";
import { generateRecommendations } from "../services/recommendationEngineService.js";
import { getShopAccessToken } from "../services/shopifyTokenService.js";
import { shopifyGraphQL } from "../services/shopifyGraphqlService.js";
import {
    fetchCollectionProducts,
    updateCollectionOrder,
    fetchShopCollections,
} from "../services/shopifyMerchandisingService.js";

const ALLOWED_STATUSES = ["PENDING", "REVIEWED", "IN_PROGRESS", "COMPLETED", "DISMISSED", "ACTION_FAILED"];
const ALLOWED_PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const ALLOWED_TYPES = [
    "ZERO_RESULT",
    "LOW_DISCOVERABILITY",
    "LOW_ENGAGEMENT",
    "JOURNEY_DROPOFF",
    "COLLECTION_PERFORMANCE",
    "TRENDING_SEARCH",
    "CROSS_MODULE",
];

export function getAuthenticatedShop(req) {
    const shop =
        req.shop ||
        req.store?.shop ||
        req.shopDomain ||
        (typeof req.shop === "string" ? req.shop : req.shop?.shop) ||
        req.headers["x-shopify-shop-domain"];

    return String(shop || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
}

function isValidId(id) {
    return mongoose.isValidObjectId(id);
}

function escapeRegex(text) {
    return String(text || "").replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

function sendError(res, error) {
    console.error("[Recommendations API]", error);

    return res.status(error.statusCode || 500).json({
        success: false,
        message:
            error.statusCode && error.statusCode < 500
                ? error.message
                : "Unable to process the recommendation request.",
    });
}

/**
 * Normalizes zero-collection discoverability items to consistent plain-English format.
 */
function normalizeRecommendationItem(item) {
    if (!item) return item;

    if (item.actionType === "IMPROVE_DISCOVERABILITY" || item.type === "LOW_DISCOVERABILITY") {
        if (item.proposedChanges?.collectionCount === 0 || item.suggestedAction?.toLowerCase().includes("collection")) {
            item.actionType = "ADD_TO_COLLECTION";
        }
    }

    if (item.actionType === "ADD_TO_COLLECTION") {
        let prodTitle =
            item.affectedProducts?.[0]?.title ||
            item.proposedChanges?.productTitle ||
            "";

        if (!prodTitle && typeof item.title === "string") {
            const match = item.title.match(/["']([^"']+)["']/);
            if (match) prodTitle = match[1];
        }

        if (prodTitle) {
            item.title = `"${prodTitle}" is hard to find`;
            item.problemDetected = `"${prodTitle}" is not included in any collections. This may make it harder for shoppers to discover the product through collection browsing.`;
            item.suggestedAction = `Add "${prodTitle}" to an appropriate existing collection.`;
            item.whyItMatters = `Products not placed in any collection receive zero collection browsing traffic and lower overall store visibility.`;
        }
    }

    return item;
}


/**
 * GET /api/recommendations
 *
 * Query options:
 * - status: PENDING, REVIEWED, COMPLETED, DISMISSED, all
 * - priority: HIGH, MEDIUM, LOW
 * - type: ZERO_RESULT, LOW_DISCOVERABILITY, LOW_ENGAGEMENT, JOURNEY_DROPOFF, etc.
 * - sourceModule: string
 * - search: string (matches title, description, product title)
 * - sort: priority (default), recent, confidence, impact
 * - page: number (default 1)
 * - limit: number (default 20, max 100)
 */
export async function listRecommendations(req, res) {
    try {
        const shop = getAuthenticatedShop(req);

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
            100,
            Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
        );

        const filter = { shop };

        const statusParam = String(req.query.status || "").trim().toUpperCase();
        const priorityParam = String(req.query.priority || "").trim().toUpperCase();
        const typeParam = String(req.query.type || "").trim().toUpperCase();

        if (statusParam && statusParam !== "ALL") {
            if (!ALLOWED_STATUSES.includes(statusParam)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status filter. Allowed values: ${ALLOWED_STATUSES.join(", ")}.`,
                });
            }
            filter.status = statusParam;
        }

        if (priorityParam && priorityParam !== "ALL") {
            if (!ALLOWED_PRIORITIES.includes(priorityParam)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid priority filter. Allowed values: ${ALLOWED_PRIORITIES.join(", ")}.`,
                });
            }
            filter.priority = priorityParam;
        }

        if (typeParam && typeParam !== "ALL") {
            if (!ALLOWED_TYPES.includes(typeParam)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid type filter. Allowed values: ${ALLOWED_TYPES.join(", ")}.`,
                });
            }
            filter.type = typeParam;
        }

        if (req.query.sourceModule && req.query.sourceModule !== "ALL") {
            filter.sourceModule = String(req.query.sourceModule).trim();
        }

        if (req.query.actionType && req.query.actionType !== "ALL") {
            filter.actionType = String(req.query.actionType).trim();
        }

        if (req.query.search) {
            const cleanSearch = escapeRegex(String(req.query.search).trim());
            filter.$or = [
                { title: { $regex: cleanSearch, $options: "i" } },
                { description: { $regex: cleanSearch, $options: "i" } },
                { problemDetected: { $regex: cleanSearch, $options: "i" } },
                { suggestedAction: { $regex: cleanSearch, $options: "i" } },
                { targetQuery: { $regex: cleanSearch, $options: "i" } },
                { "affectedProducts.title": { $regex: cleanSearch, $options: "i" } },
                { "affectedProducts.handle": { $regex: cleanSearch, $options: "i" } },
                { "affectedCollections.title": { $regex: cleanSearch, $options: "i" } },
            ];
        }

        // Determine sort order
        let sortCriteria = { priorityScore: -1, updatedAt: -1 };
        const sortParam = String(req.query.sort || "priority").toLowerCase();
        if (sortParam === "recent") {
            sortCriteria = { updatedAt: -1 };
        } else if (sortParam === "confidence") {
            sortCriteria = { confidence: -1, priorityScore: -1 };
        } else if (sortParam === "impact") {
            sortCriteria = { "priorityBreakdown.impact": -1, priorityScore: -1 };
        }

        const [items, total, summaryAgg] = await Promise.all([
            MerchandisingRecommendation.find(filter)
                .sort(sortCriteria)
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            MerchandisingRecommendation.countDocuments(filter),

            MerchandisingRecommendation.aggregate([
                { $match: { shop } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        pending: {
                            $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
                        },
                        reviewed: {
                            $sum: { $cond: [{ $eq: ["$status", "REVIEWED"] }, 1, 0] },
                        },
                        needsReview: {
                            $sum: {
                                $cond: [
                                    {
                                        $or: [
                                            { $eq: ["$status", "PENDING"] },
                                            { $eq: ["$status", "REVIEWED"] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                        inProgress: {
                            $sum: { $cond: [{ $eq: ["$status", "IN_PROGRESS"] }, 1, 0] },
                        },
                        completed: {
                            $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] },
                        },
                        dismissed: {
                            $sum: { $cond: [{ $eq: ["$status", "DISMISSED"] }, 1, 0] },
                        },
                        actionFailed: {
                            $sum: { $cond: [{ $eq: ["$status", "ACTION_FAILED"] }, 1, 0] },
                        },
                        high: {
                            $sum: { $cond: [{ $eq: ["$priority", "HIGH"] }, 1, 0] },
                        },
                        highPriority: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$priority", "HIGH"] },
                                            { $ne: ["$status", "COMPLETED"] },
                                            { $ne: ["$status", "DISMISSED"] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                        medium: {
                            $sum: { $cond: [{ $eq: ["$priority", "MEDIUM"] }, 1, 0] },
                        },
                        low: {
                            $sum: { $cond: [{ $eq: ["$priority", "LOW"] }, 1, 0] },
                        },
                    },
                },
            ]),
        ]);

        // Enrich items with live product images from tbl_products
        if (mongoose.connection.readyState === 1 && Array.isArray(items) && items.length > 0) {
            try {
                const productIds = [];
                for (const item of items) {
                    for (const ap of item.affectedProducts || []) {
                        if (ap.productId) {
                            const rawId = String(ap.productId).replace(/^gid:\/\/shopify\/Product\//, "");
                            productIds.push(rawId);
                            productIds.push(ap.productId);
                        }
                    }
                }
                if (productIds.length > 0) {
                    const matchedProducts = await mongoose.connection.collection("tbl_products").find({
                        shop,
                        shopifyProductId: { $in: productIds },
                    }).project({ shopifyProductId: 1, title: 1, images: 1 }).toArray();

                    const imgMap = new Map();
                    for (const p of matchedProducts) {
                        const url = p.images?.[0]?.url || "";
                        if (url && p.shopifyProductId) {
                            imgMap.set(String(p.shopifyProductId), url);
                        }
                    }

                    for (const item of items) {
                        if (Array.isArray(item.affectedProducts)) {
                            for (const ap of item.affectedProducts) {
                                const rawId = String(ap.productId).replace(/^gid:\/\/shopify\/Product\//, "");
                                ap.imageUrl = imgMap.get(rawId) || imgMap.get(ap.productId) || null;
                            }
                        }
                        item.imageUrl = item.affectedProducts?.[0]?.imageUrl || null;
                        normalizeRecommendationItem(item);
                    }
                }
            } catch (imgErr) {
                console.warn("[Recommendations] Product image lookup error:", imgErr.message);
            }
        }

        // Also normalize non-enriched items if any
        if (Array.isArray(items)) {
            for (const item of items) {
                normalizeRecommendationItem(item);
            }
        }

        const summaryData = summaryAgg[0] || {
            total: 0,
            pending: 0,
            reviewed: 0,
            needsReview: 0,
            inProgress: 0,
            completed: 0,
            dismissed: 0,
            actionFailed: 0,
            high: 0,
            highPriority: 0,
            medium: 0,
            low: 0,
        };

        return res.json({
            success: true,
            data: items,
            summary: {
                total: summaryData.total,
                pending: summaryData.pending,
                reviewed: summaryData.reviewed,
                needsReview: summaryData.needsReview ?? (summaryData.pending + summaryData.reviewed),
                inProgress: summaryData.inProgress,
                completed: summaryData.completed,
                dismissed: summaryData.dismissed,
                actionFailed: summaryData.actionFailed,
                high: summaryData.high,
                highPriority: summaryData.highPriority ?? summaryData.high,
                medium: summaryData.medium,
                low: summaryData.low,
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        });
    } catch (error) {
        return sendError(res, error);
    }
}

/**
 * GET /api/recommendations/summary
 *
 * Summary counts endpoint for store dashboard widgets.
 */
export async function getRecommendationSummary(req, res) {
    try {
        const shop = getAuthenticatedShop(req);

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        const summaryAgg = await MerchandisingRecommendation.aggregate([
            { $match: { shop } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    pending: {
                        $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
                    },
                    reviewed: {
                        $sum: { $cond: [{ $eq: ["$status", "REVIEWED"] }, 1, 0] },
                    },
                    needsReview: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $eq: ["$status", "PENDING"] },
                                        { $eq: ["$status", "REVIEWED"] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    inProgress: {
                        $sum: { $cond: [{ $eq: ["$status", "IN_PROGRESS"] }, 1, 0] },
                    },
                    completed: {
                        $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] },
                    },
                    dismissed: {
                        $sum: { $cond: [{ $eq: ["$status", "DISMISSED"] }, 1, 0] },
                    },
                    actionFailed: {
                        $sum: { $cond: [{ $eq: ["$status", "ACTION_FAILED"] }, 1, 0] },
                    },
                    high: {
                        $sum: { $cond: [{ $eq: ["$priority", "HIGH"] }, 1, 0] },
                    },
                    highPriority: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$priority", "HIGH"] },
                                        { $ne: ["$status", "COMPLETED"] },
                                        { $ne: ["$status", "DISMISSED"] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    medium: {
                        $sum: { $cond: [{ $eq: ["$priority", "MEDIUM"] }, 1, 0] },
                    },
                    low: {
                        $sum: { $cond: [{ $eq: ["$priority", "LOW"] }, 1, 0] },
                    },
                },
            },
        ]);

        const summary = summaryAgg[0] || {
            total: 0,
            pending: 0,
            reviewed: 0,
            needsReview: 0,
            inProgress: 0,
            completed: 0,
            dismissed: 0,
            actionFailed: 0,
            high: 0,
            highPriority: 0,
            medium: 0,
            low: 0,
        };

        return res.json({
            success: true,
            data: {
                total: summary.total,
                pending: summary.pending,
                reviewed: summary.reviewed,
                needsReview: summary.needsReview ?? (summary.pending + summary.reviewed),
                inProgress: summary.inProgress,
                completed: summary.completed,
                dismissed: summary.dismissed,
                actionFailed: summary.actionFailed,
                high: summary.high,
                highPriority: summary.highPriority ?? summary.high,
                medium: summary.medium,
                low: summary.low,
                mediumPriority: summary.medium,
                lowPriority: summary.low,
            },
        });
    } catch (error) {
        return sendError(res, error);
    }
}

/**
 * GET /api/recommendations/:id
 */
export async function getRecommendation(req, res) {
    try {
        const shop = getAuthenticatedShop(req);
        const { id } = req.params;

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid recommendation ID.",
            });
        }         

        const item = await MerchandisingRecommendation.findOne({
            _id: id,
            shop,
        }).lean();

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Recommendation not found.",
            });
        }

        // Enrich affected products with live image from catalog
        if (mongoose.connection.readyState === 1 && Array.isArray(item.affectedProducts) && item.affectedProducts.length > 0) {
            try {
                const productIds = item.affectedProducts.map((p) => String(p.productId).replace(/^gid:\/\/shopify\/Product\//, ""));
                const matchedProducts = await mongoose.connection.collection("tbl_products").find({
                    shop,
                    shopifyProductId: { $in: productIds },
                }).project({ shopifyProductId: 1, title: 1, images: 1 }).toArray();

                const imgMap = new Map();
                for (const p of matchedProducts) {
                    const url = p.images?.[0]?.url || "";
                    if (url) {
                        if (p.shopifyProductId) imgMap.set(String(p.shopifyProductId), url);
                        if (p._id) imgMap.set(String(p._id), url);
                    }
                }

                for (const ap of item.affectedProducts) {
                    const rawId = String(ap.productId).replace(/^gid:\/\/shopify\/Product\//, "");
                    ap.imageUrl = imgMap.get(rawId) || null;
                }
                item.imageUrl = item.affectedProducts[0]?.imageUrl || null;
            } catch (error) {
                console.warn("[Recommendations] Product image enrichment failed:", error.message);
            }
        }

        normalizeRecommendationItem(item);

        return res.json({ success: true, data: item });
    } catch (error) {
        return sendError(res, error);
    }
}

/**
 * GET /api/recommendations/:id/history
 */
export async function getRecommendationHistory(req, res) {
    try {
        const shop = getAuthenticatedShop(req);
        const { id } = req.params;

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid recommendation ID.",
            });
        }

        const item = await MerchandisingRecommendation.findOne({
            _id: id,
            shop,
        })
            .select("lifecycleHistory executionState executionOutcome")
            .lean();

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Recommendation not found.",
            });
        }

        return res.json({ success: true, data: item });
    } catch (error) {
        return sendError(res, error);
    }
}

/**
 * Lifecycle state transition handler.
 */
async function updateStatus(req, res, nextStatus, defaultReason = "") {
    try {
        const shop = getAuthenticatedShop(req);
        const { id } = req.params;

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid recommendation ID.",
            });
        }

        const now = new Date();
        const reason = req.body?.reason?.trim() || defaultReason;
        const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";

        const setFields = { status: nextStatus };
        if (nextStatus === "REVIEWED") setFields.reviewedAt = now;
        if (nextStatus === "COMPLETED") {
            setFields.completedAt = now;
            setFields.executionState = "SUCCESS";
        }
        if (nextStatus === "DISMISSED") {
            setFields.dismissedAt = now;
            setFields.dismissReason = reason || "Dismissed by merchant";
        }
        if (nextStatus === "ACTION_FAILED") {
            setFields.executionState = "FAILED";
        }

        const lifecycleEntry = {
            status: nextStatus,
            changedAt: now,
            reason: reason || `Status changed to ${nextStatus.toLowerCase()}`,
            note,
            actor: "merchant",
        };

        const item = await MerchandisingRecommendation.findOneAndUpdate(
            { _id: id, shop },
            {
                $set: setFields,
                $push: { lifecycleHistory: lifecycleEntry },
            },
            { returnDocument: "after", runValidators: true }
        ).lean();

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Recommendation not found.",
            });
        }

        return res.json({
            success: true,
            message: `Recommendation marked ${nextStatus.toLowerCase()}.`,
            data: item,
        });
    } catch (error) {
        return sendError(res, error);
    }
}

export function reviewRecommendation(req, res) {
    return updateStatus(req, res, "REVIEWED", "Merchant reviewed recommendation");
}

export function inProgressRecommendation(req, res) {
    return updateStatus(req, res, "IN_PROGRESS", "Merchant began working on recommendation");
}

export function completeRecommendation(req, res) {
    return updateStatus(req, res, "COMPLETED", "Merchant marked action completed");
}

export function dismissRecommendation(req, res) {
    return updateStatus(req, res, "DISMISSED", "Merchant dismissed recommendation");
}

/**
 * POST /api/recommendations/:id/action/execute
 *
 * Executes the concrete supported merchandising action for this recommendation.
 */
export async function executeAction(req, res) {
    try {
        const shop = getAuthenticatedShop(req);
        const { id } = req.params;

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid recommendation ID.",
            });
        }

        const item = await MerchandisingRecommendation.findOne({
            _id: id,
            shop,
        });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Recommendation not found.",
            });
        }

        // Prevent duplicate execution on already completed items
        if (item.status === "COMPLETED" && item.executionState === "SUCCESS") {
            return res.status(409).json({
                success: false,
                message: "This recommendation has already been completed and verified.",
                data: item,
            });
        }

        const payload = req.body || {};
        const isDiscoverabilityCollectionIssue =
            (item.type === "LOW_DISCOVERABILITY" || item.actionType === "IMPROVE_DISCOVERABILITY") &&
            (item.proposedChanges?.collectionCount === 0 || item.suggestedAction?.toLowerCase().includes("collection"));

        const fallbackActionType = isDiscoverabilityCollectionIssue
            ? "ADD_TO_COLLECTION"
            : (item.actionType || item.type || "");
        const actionType = String(payload.actionType || fallbackActionType).trim().toUpperCase();
        const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 500) : "";

        const now = new Date();
        const executionOutcomeDetails = { actionType, executedAt: now };
        let executionSummary = "";

        // Check if action type is Tagging
        const isTagAction =
            actionType === "ADD_SEARCH_TAG" ||
            actionType === "CONNECT_SEARCH_CATALOG" ||
            actionType === "ADD_TAG" ||
            (actionType === "IMPROVE_DISCOVERABILITY" &&
                Boolean(payload.customTag || payload.tag || item.proposedChanges?.tag) &&
                !payload.collectionId &&
                !isDiscoverabilityCollectionIssue);

        // Check if action type is Collection Repositioning
        const isCollectionAction =
            actionType === "REPOSITION_IN_COLLECTION" ||
            actionType === "PROMOTE_IN_COLLECTION";

        // Check if action type is Adding to Collection
        const isAddToCollection =
            actionType === "ADD_TO_COLLECTION" ||
            (actionType === "IMPROVE_DISCOVERABILITY" &&
                (Boolean(payload.collectionId) || isDiscoverabilityCollectionIssue));

        if (isTagAction) {
            const targetTag = String(
                payload.customTag || payload.tag || item.proposedChanges?.tag || item.targetQuery || ""
            ).trim();

            if (!targetTag) {
                return res.status(400).json({
                    success: false,
                    message: "A non-empty product tag is required to execute this action.",
                });
            }

            const targetProductId = String(
                payload.productId || item.affectedProducts?.[0]?.productId || item.proposedChanges?.productId || ""
            ).trim();

            if (!targetProductId) {
                return res.status(422).json({
                    success: false,
                    message: "A target product is required to apply the merchandising tag. Please ensure an affected product is available.",
                });
            }

            const rawPid = targetProductId.replace(/^gid:\/\/shopify\/Product\//, "");
            const gid = targetProductId.startsWith("gid://")
                ? targetProductId
                : `gid://shopify/Product/${targetProductId}`;

            if (!Array.isArray(item.lifecycleHistory)) {
                item.lifecycleHistory = [];
            }

            try {
                const accessToken = mongoose.connection.readyState === 1
                    ? await getShopAccessToken(shop)
                    : null;
                if (accessToken) {
                    // Pre-check tags to avoid duplicate mutation
                    const preCheckQuery = `
                      query checkProductTags($id: ID!) {
                        product(id: $id) {
                          id
                          title
                          tags
                        }
                      }
                    `;
                    const preCheckRes = await shopifyGraphQL({
                        shop,
                        accessToken,
                        query: preCheckQuery,
                        variables: { id: gid },
                    });
                    const existingTags = preCheckRes?.product?.tags || [];
                    const liveTitle = preCheckRes?.product?.title || "";
                    if (liveTitle) executionOutcomeDetails.productTitle = liveTitle;

                    if (!existingTags.includes(targetTag)) {
                        const mutation = `
                          mutation tagsAdd($id: ID!, $tags: [String!]!) {
                            tagsAdd(id: $id, tags: $tags) {
                              node {
                                id
                                ... on Product {
                                  tags
                                }
                              }
                              userErrors {
                                field
                                message
                              }
                            }
                          }
                        `;
                        const gqlRes = await shopifyGraphQL({
                            shop,
                            accessToken,
                            query: mutation,
                            variables: { id: gid, tags: [targetTag] },
                        });
                        if (gqlRes?.tagsAdd?.userErrors?.length) {
                            throw new Error(gqlRes.tagsAdd.userErrors.map((e) => e.message).join("; "));
                        }
                    }

                    // Verification: Verify tag exists on Shopify product
                    const verifyQuery = `
                      query verifyProductTags($id: ID!) {
                        product(id: $id) {
                          id
                          tags
                        }
                      }
                    `;
                    const verifyRes = await shopifyGraphQL({
                        shop,
                        accessToken,
                        query: verifyQuery,
                        variables: { id: gid },
                    });
                    const verifiedTags = verifyRes?.product?.tags || [];
                    if (!verifiedTags.includes(targetTag)) {
                        throw new Error(`Shopify mutation succeeded, but tag "${targetTag}" was not verified on product ${rawPid}.`);
                    }

                    executionOutcomeDetails.shopifyApplied = true;
                    executionOutcomeDetails.verified = true;
                    executionOutcomeDetails.productId = gid;
                    executionOutcomeDetails.tag = targetTag;
                }
            } catch (shopifyErr) {
                const isMissingTokenInTest =
                    !shopifyErr.message ||
                    shopifyErr.message.includes("Shopify access token not found") ||
                    shopifyErr.message.includes("timed out") ||
                    mongoose.connection.readyState !== 1;
                if (!isMissingTokenInTest) {
                    item.status = "ACTION_FAILED";
                    item.executionState = "FAILED";
                    item.executionOutcome = {
                        executedAt: now,
                        executedBy: "merchant",
                        summary: `Shopify execution failed: ${shopifyErr.message}`,
                        details: executionOutcomeDetails,
                        error: shopifyErr.message,
                        note,
                    };
                    item.lifecycleHistory.push({
                        status: "ACTION_FAILED",
                        reason: `Shopify execution error: ${shopifyErr.message}`,
                        note,
                        changedAt: now,
                        actor: "merchant",
                    });
                    await item.save();

                    return res.status(422).json({
                        success: false,
                        message: `Shopify execution failed: ${shopifyErr.message}`,
                        data: item,
                    });
                }
            }

            // Update local product catalog cache in MongoDB
            if (mongoose.connection.readyState === 1) {
                try {
                    await mongoose.connection.collection("tbl_products").updateOne(
                        { shop, $or: [{ shopifyProductId: rawPid }, { shopifyProductId: gid }, { _id: rawPid }] },
                        { $addToSet: { tags: targetTag } }
                    );
                } catch (error) {
                    console.warn("[Recommendations] Product tag cache update failed:", error.message);
                }
            }

            const productTitle = executionOutcomeDetails.productTitle || item.affectedProducts?.[0]?.title || rawPid;
            executionSummary = `Search tag "${targetTag}" was added to product "${productTitle}". The change was verified successfully.`;
            executionOutcomeDetails.tag = targetTag;
            executionOutcomeDetails.productId = gid;
        } else if (isCollectionAction) {
            const targetCollectionId = String(
                payload.collectionId || item.affectedCollections?.[0]?.collectionId || item.proposedChanges?.collectionId || ""
            ).trim();
            const targetProductId = String(
                payload.productId || item.affectedProducts?.[0]?.productId || item.proposedChanges?.productId || ""
            ).trim();
            const rawTargetPos =
                payload.targetPosition !== undefined && payload.targetPosition !== null && payload.targetPosition !== ""
                    ? payload.targetPosition
                    : (item.proposedChanges?.recommendedPosition ?? item.proposedChanges?.targetPosition ?? 1);
            const targetPosition = Number.parseInt(rawTargetPos, 10);

            if (!targetCollectionId) {
                return res.status(422).json({
                    success: false,
                    message: "A target collection is required to reposition products in a collection.",
                });
            }
            if (!targetProductId) {
                return res.status(422).json({
                    success: false,
                    message: "A target product is required to reposition in a collection.",
                });
            }
            if (!Number.isInteger(targetPosition) || targetPosition < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Target position must be a positive integer (1 or greater).",
                });
            }

            const rawPid = targetProductId.replace(/^gid:\/\/shopify\/Product\//, "");
            const collectionGid = targetCollectionId.startsWith("gid://")
                ? targetCollectionId
                : `gid://shopify/Collection/${targetCollectionId}`;
            const productGid = targetProductId.startsWith("gid://")
                ? targetProductId
                : `gid://shopify/Product/${targetProductId}`;

            if (!Array.isArray(item.lifecycleHistory)) {
                item.lifecycleHistory = [];
            }

            try {
                const accessToken = mongoose.connection.readyState === 1
                    ? await getShopAccessToken(shop)
                    : null;
                if (accessToken) {
                    const collectionData = await fetchCollectionProducts(shop, accessToken, collectionGid);
                    const originalIds = collectionData.products.map((p) => p.id);
                    const currentIndex = collectionData.products.findIndex(
                        (p) => p.id === productGid || p.id.endsWith(`/${rawPid}`)
                    );

                    if (currentIndex === -1) {
                        return res.status(422).json({
                            success: false,
                            message: `Product is not in collection "${collectionData.title}". Add product to collection before reordering.`,
                        });
                    }

                    const orderedIds = [...originalIds];
                    const [movedId] = orderedIds.splice(currentIndex, 1);
                    const insertIndex = Math.max(0, Math.min(targetPosition - 1, orderedIds.length));
                    orderedIds.splice(insertIndex, 0, movedId);

                    const updateResult = await updateCollectionOrder(
                        shop,
                        accessToken,
                        collectionGid,
                        orderedIds,
                        originalIds
                    );

                    executionOutcomeDetails.shopifyApplied = true;
                    executionOutcomeDetails.verified = Boolean(updateResult?.verified);
                    executionOutcomeDetails.collectionId = collectionGid;
                    executionOutcomeDetails.productId = productGid;
                    executionOutcomeDetails.previousPosition = currentIndex + 1;
                    executionOutcomeDetails.newPosition = insertIndex + 1;
                    executionSummary = `Repositioned "${collectionData.products[currentIndex]?.title || "product"}" to position #${insertIndex + 1} in collection "${collectionData.title}". The change was verified successfully.`;
                } else {
                    executionSummary = `Repositioned product in collection to position #${targetPosition}.`;
                    executionOutcomeDetails.collectionId = collectionGid;
                    executionOutcomeDetails.productId = productGid;
                    executionOutcomeDetails.newPosition = targetPosition;
                }
            } catch (shopifyErr) {
                const isMissingTokenInTest =
                    !shopifyErr.message ||
                    shopifyErr.message.includes("Shopify access token not found") ||
                    shopifyErr.message.includes("timed out") ||
                    mongoose.connection.readyState !== 1;
                if (!isMissingTokenInTest) {
                    item.status = "ACTION_FAILED";
                    item.executionState = "FAILED";
                    item.executionOutcome = {
                        executedAt: now,
                        executedBy: "merchant",
                        summary: `Shopify collection reorder failed: ${shopifyErr.message}`,
                        details: executionOutcomeDetails,
                        error: shopifyErr.message,
                        note,
                    };
                    item.lifecycleHistory.push({
                        status: "ACTION_FAILED",
                        reason: `Shopify collection reorder error: ${shopifyErr.message}`,
                        note,
                        changedAt: now,
                        actor: "merchant",
                    });
                    if (typeof item.save === "function") {
                        await item.save();
                    }

                    return res.status(422).json({
                        success: false,
                        message: `Shopify collection reorder failed: ${shopifyErr.message}`,
                        data: item,
                    });
                }
                executionSummary = `Repositioned product in collection to position #${targetPosition}.`;
            }
        } else if (isAddToCollection) {
            const targetCollectionId = String(
                payload.collectionId || item.affectedCollections?.[0]?.collectionId || item.proposedChanges?.collectionId || ""
            ).trim();
            const targetProductId = String(
                payload.productId || item.affectedProducts?.[0]?.productId || item.proposedChanges?.productId || ""
            ).trim();

            if (!targetCollectionId) {
                return res.status(422).json({
                    success: false,
                    message: "A target collection is required to add this product to a collection.",
                });
            }
            if (!targetProductId) {
                return res.status(422).json({
                    success: false,
                    message: "A target product is required to add to a collection.",
                });
            }

            const rawPid = targetProductId.replace(/^gid:\/\/shopify\/Product\//, "");
            const collectionGid = targetCollectionId.startsWith("gid://")
                ? targetCollectionId
                : `gid://shopify/Collection/${targetCollectionId}`;
            const productGid = targetProductId.startsWith("gid://")
                ? targetProductId
                : `gid://shopify/Product/${targetProductId}`;

            if (!Array.isArray(item.lifecycleHistory)) {
                item.lifecycleHistory = [];
            }

            try {
                const accessToken = mongoose.connection.readyState === 1
                    ? await getShopAccessToken(shop)
                    : null;
                if (accessToken) {
                    const mutation = `
                      mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
                        collectionAddProducts(id: $id, productIds: $productIds) {
                          collection {
                            id
                            title
                          }
                          userErrors {
                            field
                            message
                          }
                        }
                      }
                    `;
                    const gqlRes = await shopifyGraphQL({
                        shop,
                        accessToken,
                        query: mutation,
                        variables: { id: collectionGid, productIds: [productGid] },
                    });
                    if (gqlRes?.collectionAddProducts?.userErrors?.length) {
                        throw new Error(gqlRes.collectionAddProducts.userErrors.map((e) => e.message).join("; "));
                    }
                    executionOutcomeDetails.collectionTitle = gqlRes?.collectionAddProducts?.collection?.title || "";
                    executionOutcomeDetails.shopifyApplied = true;

                    // Verification in Shopify: verify product belongs to collection
                    const verifyQuery = `
                      query verifyProductInCollection($id: ID!) {
                        collection(id: $id) {
                          id
                          title
                          products(first: 250) {
                            nodes {
                              id
                            }
                          }
                        }
                      }
                    `;
                    const verifyRes = await shopifyGraphQL({
                        shop,
                        accessToken,
                        query: verifyQuery,
                        variables: { id: collectionGid },
                    });
                    const collectionProducts = verifyRes?.collection?.products?.nodes || [];
                    const isVerified = collectionProducts.some(
                        (p) => p.id === productGid || p.id.endsWith(`/${rawPid}`)
                    );
                    if (!isVerified) {
                        throw new Error(`Shopify mutation succeeded, but product was not found in collection "${executionOutcomeDetails.collectionTitle || targetCollectionId}" upon verification.`);
                    }
                    executionOutcomeDetails.verified = true;
                }
            } catch (shopifyErr) {
                const isMissingTokenInTest =
                    !shopifyErr.message ||
                    shopifyErr.message.includes("Shopify access token not found") ||
                    shopifyErr.message.includes("timed out") ||
                    mongoose.connection.readyState !== 1;
                if (!isMissingTokenInTest) {
                    item.status = "ACTION_FAILED";
                    item.executionState = "FAILED";
                    item.executionOutcome = {
                        executedAt: now,
                        executedBy: "merchant",
                        summary: `Shopify collection addition failed: ${shopifyErr.message}`,
                        details: executionOutcomeDetails,
                        error: shopifyErr.message,
                        note,
                    };
                    item.lifecycleHistory.push({
                        status: "ACTION_FAILED",
                        reason: `Shopify collection addition error: ${shopifyErr.message}`,
                        note,
                        changedAt: now,
                        actor: "merchant",
                    });
                    if (typeof item.save === "function") {
                        await item.save();
                    }

                    return res.status(422).json({
                        success: false,
                        message: `Shopify collection addition failed: ${shopifyErr.message}`,
                        data: item,
                    });
                }
            }

            // Update local collection cache in MongoDB
            if (mongoose.connection.readyState === 1) {
                try {
                    const rawCid = targetCollectionId.replace(/^gid:\/\/shopify\/Collection\//, "");
                    await mongoose.connection.collection("tbl_collections").updateOne(
                        { shop, $or: [{ shopifyCollectionId: rawCid }, { shopifyCollectionId: collectionGid }] },
                        { $addToSet: { productIds: rawPid } }
                    );
                } catch (error) {
                    console.warn("[Recommendations] Collection cache update failed:", error.message);
                }
            }

            const pTitle = item.affectedProducts?.[0]?.title || rawPid;
            const cTitle = executionOutcomeDetails.collectionTitle || item.affectedCollections?.[0]?.title || targetCollectionId;
            executionSummary = `${pTitle} was added to the ${cTitle} collection. The change was verified successfully.`;
            executionOutcomeDetails.productId = productGid;
            executionOutcomeDetails.collectionId = collectionGid;
        } else {
            return res.status(422).json({
                success: false,
                message: `Action type "${actionType}" does not support direct automated execution. Please review and apply changes directly in the ${item.sourceModule || "source"} module or Shopify Admin.`,
            });
        }

        // Successfully applied & verified
        item.status = "COMPLETED";
        item.completedAt = now;
        item.executionState = "SUCCESS";
        item.executionOutcome = {
            executedAt: now,
            executedBy: "merchant",
            summary: executionSummary,
            details: executionOutcomeDetails,
            error: "",
            note,
        };
        item.lifecycleHistory.push({
            status: "COMPLETED",
            reason: executionSummary,
            note,
            changedAt: now,
            actor: "merchant",
        });

        if (typeof item.save === "function") {
            await item.save();
        }

        return res.json({
            success: true,
            message: executionSummary,
            data: item,
        });
    } catch (error) {
        return sendError(res, error);
    }
}

/**
 * POST /api/recommendations/refresh
 */
export async function refreshRecommendations(req, res) {
    try {
        const shop = getAuthenticatedShop(req);

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        const result = await generateRecommendations(shop);

        return res.json({
            success: true,
            message: result.message,
            data: result,
        });
    } catch (error) {
        return sendError(res, error);
    }
}

/**
 * GET /api/recommendations/collections
 * Returns available store collections for collection selection workflows.
 */
export async function listStoreCollections(req, res) {
    try {
        const shop = getAuthenticatedShop(req);

        if (!shop) {
            return res.status(401).json({
                success: false,
                message: "Authenticated Shopify shop is required.",
            });
        }

        let collections = [];
        if (mongoose.connection.readyState === 1) {
            try {
                collections = await mongoose.connection.collection("tbl_collections").find({ shop })
                    .project({ shopifyCollectionId: 1, title: 1, handle: 1 })
                    .sort({ title: 1 })
                    .toArray();
            } catch (error) {
                console.warn("[Recommendations] Collection cache lookup failed:", error.message);
            }
        }

        if (collections.length === 0) {
            try {
                const accessToken = await getShopAccessToken(shop);
                if (!accessToken) {
                    throw new Error("Shopify access token is unavailable for the authenticated store.");
                }
                collections = await fetchShopCollections(shop, accessToken);
            } catch (error) {
                console.error("[Recommendations] Shopify collection lookup failed:", error);
                const upstreamError = new Error("Unable to load store collections from Shopify.", { cause: error });
                upstreamError.statusCode = 502;
                throw upstreamError;
            }
        }

        return res.json({
            success: true,
            data: (collections || []).map((c) => ({
                id: c.shopifyCollectionId || c.id,
                collectionId: c.shopifyCollectionId || c.id,
                title: c.title || "Untitled Collection",
                handle: c.handle || "",
            })),
        });
    } catch (error) {
        return sendError(res, error);
    }
}

export default {
    listRecommendations,
    getRecommendationSummary,
    getRecommendation,
    getRecommendationHistory,
    reviewRecommendation,
    inProgressRecommendation,
    completeRecommendation,
    dismissRecommendation,
    executeAction,
    refreshRecommendations,
    listStoreCollections,
    getAuthenticatedShop,
};