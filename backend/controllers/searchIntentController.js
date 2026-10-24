import searchIntentService from "../services/searchIntentService.js";

const getShop = (req) => {
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
        req.shopDomain ||
        req.headers["shopify-shop-domain"] ||
        req.headers["x-shopify-shop-domain"] ||
        req.headers["x-shop-domain"] ||
        req.headers["shop-domain"] ||
        req.headers["shop"] ||
        req.query?.shop ||
        req.body?.shop ||
        null
    );
};

/*
|--------------------------------------------------------------------------
| Analyze search
|--------------------------------------------------------------------------
*/

const analyzeSearch = async (
    req,
    res
) => {
    try {
        const shop = getShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message:
                    "Shop domain is required",
            });
        }

        const {
            searchQuery,
        } = req.body;

        const data =
            await searchIntentService.saveSearchIntent(
                {
                    shop,
                    searchQuery,
                    accessToken: req.accessToken,
                }
            );

        return res.status(200).json({
            success: true,

            message:
                "Search intent analyzed successfully",

            data,
        });
    } catch (error) {
        console.error(
            "Search intent analysis error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to analyze search intent",
        });
    }
};

/*
|--------------------------------------------------------------------------
| Overview
|--------------------------------------------------------------------------
*/

const getOverview = async (
    req,
    res
) => {
    try {
        const shop = getShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message:
                    "Shop domain is required",
            });
        }

        const data =
            await searchIntentService.getOverview(
                shop
            );

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error(
            "Search intent overview error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load search intent overview",
        });
    }
};

/*
|--------------------------------------------------------------------------
| Get all search intents
|--------------------------------------------------------------------------
*/

const getSearchIntents = async (
    req,
    res
) => {
    try {
        const shop = getShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message:
                    "Shop domain is required",
            });
        }

        const page = Math.max(
            Number(req.query.page) || 1,
            1
        );

        const limit = Math.min(
            Math.max(
                Number(req.query.limit) || 20,
                1
            ),
            100
        );

        const sort =
            req.query.sort ||
            "recent";

        const days =
            req.query.days ? Number(req.query.days) : null;

        const search =
            req.query.search || "";

        const productType =
            req.query.productType || "";

        const brand =
            req.query.brand || "";

        const category =
            req.query.category || "";

        const confidence =
            req.query.confidence || "";

        const data =
            await searchIntentService.getSearchIntents(
                {
                    shop,
                    page,
                    limit,
                    sort,
                    days,
                    search,
                    productType,
                    brand,
                    category,
                    confidence,
                }
            );

        return res.status(200).json({
            success: true,
            ...data,
        });
    } catch (error) {
        console.error(
            "Search intents error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load search intents",
        });
    }
};

/*
|--------------------------------------------------------------------------
| Get details
|--------------------------------------------------------------------------
*/

const getSearchIntentDetails =
    async (req, res) => {
        try {
            const shop = getShop(req);

            if (!shop) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Shop domain is required",
                });
            }

            const { id } =
                req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Search intent ID is required",
                });
            }

            const data =
                await searchIntentService.getSearchIntentDetails(
                    {
                        shop,
                        id,
                    }
                );

            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            console.error(
                "Search intent details error:",
                error
            );

            return res.status(404).json({
                success: false,
                message:
                    error.message ||
                    "Search intent not found",
            });
        }
    };

/*
|--------------------------------------------------------------------------
| Structured intent for Smart Product Matching
|--------------------------------------------------------------------------
*/

const getStructuredIntent =
    async (req, res) => {
        try {
            const shop = getShop(req);

            if (!shop) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Shop domain is required",
                });
            }

            const {
                searchQuery,
            } = req.body;

            if (!searchQuery) {
                return res.status(400).json({
                    success: false,
                    message:
                        "searchQuery is required",
                });
            }

            const data =
                await searchIntentService.getStructuredIntent(
                    {
                        shop,
                        searchQuery,
                        accessToken: req.accessToken,
                    }
                );

            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            console.error(
                "Structured intent error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to generate structured intent",
            });
        }
    };

/*
|--------------------------------------------------------------------------
| Smart Product Matching
|--------------------------------------------------------------------------
*/

const matchProducts = async (req, res) => {
    try {
        const shop = getShop(req);

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop domain is required",
            });
        }

        const { searchQuery, structuredIntent, attributes } = req.body || {};

        const data = await searchIntentService.findMatchingProducts({
            shop,
            accessToken: req.accessToken,
            searchQuery,
            structuredIntent,
            attributes,
        });

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Match products error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to find matching products",
        });
    }
};

export {
    analyzeSearch,
    getOverview,
    getSearchIntents,
    getSearchIntentDetails,
    getStructuredIntent,
    matchProducts,
};

export default {
    analyzeSearch,
    getOverview,
    getSearchIntents,
    getSearchIntentDetails,
    getStructuredIntent,
    matchProducts,
};