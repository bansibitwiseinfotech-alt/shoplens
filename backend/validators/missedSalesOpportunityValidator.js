const ALLOWED_DAYS = [7, 14, 30, 60, 90];

export const validateMissedSalesOpportunityQuery = (
    req,
    res,
    next
) => {
    const shop = String(req.query.shop || "")
        .trim()
        .toLowerCase();

    const days = Number(req.query.days || 30);

    if (!shop) {
        return res.status(400).json({
            success: false,
            message: "shop is required.",
        });
    }

    if (!ALLOWED_DAYS.includes(days)) {
        return res.status(400).json({
            success: false,
            message:
                "days must be one of: 7, 14, 30, 60 or 90.",
        });
    }

    req.missedSalesOpportunityQuery = {
        shop,
        days,
    };

    next();
};