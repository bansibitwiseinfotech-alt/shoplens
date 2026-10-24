import {
    getOverview,
    saveEvent,
} from "../services/customerDiscoveryService.js";

import {
    normalizeShopDomain,
    validateEventPayload,
    validateDateRange,
} from "../validators/customerDiscoveryValidator.js";

export async function ingestEvent(req, res) {
    try {
        const validation = validateEventPayload(req.body);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer discovery event",
                errors: validation.errors,
            });
        }

        const shopDomain = normalizeShopDomain(req.body.shopDomain);

        if (!shopDomain) {
            return res.status(400).json({
                success: false,
                message: "Invalid Shopify shop domain",
            });
        }

        const result = await saveEvent({
            ...req.body,
            shopDomain,
        });

        return res.status(result.created ? 201 : 200).json({
            success: true,
            message: result.duplicate
                ? "Event already exists"
                : "Customer discovery event stored successfully",
            data: {
                created: result.created,
                duplicate: result.duplicate,
                eventId: result.event.eventId,
            },
        });
    } catch (error) {
        console.error(
            "Customer Discovery ingest error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to store customer discovery event",
            error: error.message,
        });
    }
}

export async function getCustomerDiscoveryOverview(req, res) {
    try {
        const shopDomain = normalizeShopDomain(
            req.shopDomain ||
            req.headers["x-shopify-shop-domain"] ||
            req.headers["x-shop-domain"] ||
            req.query.shop
        );

        if (!shopDomain) {
            return res.status(400).json({
                success: false,
                message: "Shopify shop domain is required",
            });
        }

        let from = req.query.from;
        let to = req.query.to;

        if (req.query.days && !from) {
            const daysCount = parseInt(req.query.days, 10) || 30;
            const toDate = new Date();
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - daysCount);
            from = fromDate.toISOString();
            to = toDate.toISOString();
        }

        if (req.query.from || req.query.to) {
            const validation = validateDateRange(from, to);

            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date range",
                    errors: validation.errors,
                });
            }
        }

        const overview = await getOverview({
            shopDomain,
            from,
            to,
        });

        return res.status(200).json({
            success: true,
            data: overview,
        });
    } catch (error) {
        console.error(
            "Customer Discovery overview error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to calculate customer discovery overview",
            error: error.message,
        });
    }
}

export default {
    ingestEvent,
    getCustomerDiscoveryOverview,
};