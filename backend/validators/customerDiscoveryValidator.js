export const ALLOWED_EVENTS = [
    "search_submitted",
    "collection_viewed",
    "product_viewed",
    "product_added_to_cart",
    "checkout_started",
    "checkout_completed",
];

export function normalizeShopDomain(shopDomain) {
    if (!shopDomain || typeof shopDomain !== "string") {
        return null;
    }

    return shopDomain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
}

export function validateEventPayload(body) {
    const errors = [];

    if (!body.shopDomain) {
        errors.push("shopDomain is required");
    }

    if (!body.clientId) {
        errors.push("clientId is required");
    }

    if (!body.sessionId) {
        errors.push("sessionId is required");
    }

    if (!body.eventId) {
        errors.push("eventId is required");
    }

    if (!body.eventType) {
        errors.push("eventType is required");
    } else if (!ALLOWED_EVENTS.includes(body.eventType)) {
        errors.push(
            `Unsupported eventType. Allowed values: ${ALLOWED_EVENTS.join(", ")}`
        );
    }

    if (!body.occurredAt) {
        errors.push("occurredAt is required");
    } else if (Number.isNaN(new Date(body.occurredAt).getTime())) {
        errors.push("occurredAt must be a valid date");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

export function validateDateRange(from, to) {
    const errors = [];

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (!from || Number.isNaN(fromDate.getTime())) {
        errors.push("Valid from date is required");
    }

    if (!to || Number.isNaN(toDate.getTime())) {
        errors.push("Valid to date is required");
    }

    if (
        !Number.isNaN(fromDate.getTime()) &&
        !Number.isNaN(toDate.getTime()) &&
        fromDate > toDate
    ) {
        errors.push("from date cannot be after to date");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

export default {
    ALLOWED_EVENTS,
    normalizeShopDomain,
    validateEventPayload,
    validateDateRange,
};