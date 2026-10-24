export const ALLOWED_DAYS = [7, 14, 30, 60, 90];
export const ALLOWED_TREND_TYPES = ["Rising", "New", "Seasonal", "Stable"];

export const normalizeShopDomain = (shop) => {
    if (!shop || typeof shop !== "string") {
        return null;
    }

    return shop
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
};

export const validateTrendingSearchQuery = (req, res, next) => {
    const rawShop = req.query.shop;
    const shop = normalizeShopDomain(rawShop);

    if (!shop) {
        return res.status(400).json({
            success: false,
            message: "shop is required.",
        });
    }

    let days = 30;
    if (req.query.days !== undefined && req.query.days !== null && req.query.days !== "") {
        const parsedDays = Number(req.query.days);
        if (!ALLOWED_DAYS.includes(parsedDays)) {
            return res.status(400).json({
                success: false,
                message: "days must be 7, 14, 30, 60 or 90.",
            });
        }
        days = parsedDays;
    }

    let trendType;
    if (req.query.trendType !== undefined && req.query.trendType !== null && req.query.trendType !== "") {
        const rawType = String(req.query.trendType).trim();
        if (!ALLOWED_TREND_TYPES.includes(rawType)) {
            return res.status(400).json({
                success: false,
                message: "trendType must be Rising, New, Seasonal or Stable.",
            });
        }
        trendType = rawType;
    }

    let limit = 50;
    if (req.query.limit !== undefined && req.query.limit !== null && req.query.limit !== "") {
        const parsedLimit = Number(req.query.limit);
        if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
            limit = Math.min(parsedLimit, 100);
        }
    }

    req.trendingSearchQuery = {
        shop,
        days,
        trendType,
        limit,
    };

    next();
};

export default {
    ALLOWED_DAYS,
    ALLOWED_TREND_TYPES,
    normalizeShopDomain,
    validateTrendingSearchQuery,
};
