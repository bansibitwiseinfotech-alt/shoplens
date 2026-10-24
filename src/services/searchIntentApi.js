/**
 * Search Intent API Service
 * Handles communication between the frontend React application
 * and the backend search intent endpoints.
 */
import { getShopifyAuthorizationHeaders } from "./shopifySessionToken.js";

const getBackendUrl = () => {
    if (typeof window !== "undefined" && window.__ENV__?.VITE_BACKEND_URL) {
        return window.__ENV__.VITE_BACKEND_URL;
    }
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    return "http://localhost:5000";
};

let activeBaseUrl = null;

const getActiveBaseUrl = () => {
    if (!activeBaseUrl) {
        activeBaseUrl = getBackendUrl();
    }
    if (typeof window !== "undefined" && window.__ENV__?.VITE_BACKEND_URL && activeBaseUrl !== window.__ENV__.VITE_BACKEND_URL) {
        activeBaseUrl = window.__ENV__.VITE_BACKEND_URL;
    }
    return activeBaseUrl;
};

/**
 * Resilient request helper with port fallback.
 */
async function request(endpoint, { shop, ...params } = {}) {
    const currentBase = getActiveBaseUrl();
    const urlsToTry = [currentBase];
    if (currentBase.includes(":5000")) {
        urlsToTry.push(currentBase.replace(":5000", ":4000"));
    } else if (currentBase.includes(":4000")) {
        urlsToTry.push(currentBase.replace(":4000", ":5000"));
    }

    const query = new URLSearchParams();
    if (shop) query.set("shop", shop);
    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
            query.set(key, String(val));
        }
    });

    const queryString = query.toString() ? `?${query.toString()}` : "";
    let lastError = null;

    for (const baseUrl of urlsToTry) {
        try {
            const url = `${baseUrl}${endpoint}${queryString}`;
            const headers = {
                "Content-Type": "application/json",
                ...(await getShopifyAuthorizationHeaders()),
            };
            if (shop) {
                headers["shopify-shop-domain"] = shop;
                headers["x-shopify-shop-domain"] = shop;
            }

            const response = await fetch(url, {
                method: "GET",
                headers,
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const err = new Error(data?.message || `Request failed with status ${response.status}`);
                err.status = response.status;
                err.code = data?.code;
                err.requiredPlan = data?.requiredPlan;
                err.feature = data?.feature;
                throw err;
            }

            activeBaseUrl = baseUrl;
            return data;
        } catch (err) {
            lastError = err;
            if (
                err.name === "TypeError" &&
                (err.message.includes("fetch") || err.message.includes("Failed to fetch"))
            ) {
                continue;
            }
            throw err;
        }
    }

    throw new Error(
        lastError?.message || "Unable to connect to the search intent service."
    );
}

/**
 * Resilient POST request helper with port fallback.
 */
async function postRequest(endpoint, body = {}, { shop } = {}) {
    const currentBase = getActiveBaseUrl();
    const urlsToTry = [currentBase];
    if (currentBase.includes(":5000")) {
        urlsToTry.push(currentBase.replace(":5000", ":4000"));
    } else if (currentBase.includes(":4000")) {
        urlsToTry.push(currentBase.replace(":4000", ":5000"));
    }

    let lastError = null;

    for (const baseUrl of urlsToTry) {
        try {
            const url = `${baseUrl}${endpoint}`;
            const headers = {
                "Content-Type": "application/json",
                ...(await getShopifyAuthorizationHeaders()),
            };
            if (shop) {
                headers["shopify-shop-domain"] = shop;
                headers["x-shopify-shop-domain"] = shop;
            }

            const payload = {
                ...body,
                ...(shop ? { shop } : {}),
            };

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const err = new Error(data?.message || `Request failed with status ${response.status}`);
                err.status = response.status;
                err.code = data?.code;
                err.requiredPlan = data?.requiredPlan;
                err.feature = data?.feature;
                throw err;
            }

            activeBaseUrl = baseUrl;
            return data;
        } catch (err) {
            lastError = err;
            if (
                err.name === "TypeError" &&
                (err.message.includes("fetch") || err.message.includes("Failed to fetch"))
            ) {
                continue;
            }
            throw err;
        }
    }

    throw new Error(
        lastError?.message || "Unable to connect to the search intent service."
    );
}

/**
 * Get search intent overview metrics.
 * GET /api/search-intents/overview
 */
export async function getSearchIntentOverview({ shop }) {
    return request("/api/search-intents/overview", { shop });
}

/**
 * Get paginated list of search intents.
 * GET /api/search-intents
 */
export async function getSearchIntents({
    shop,
    page = 1,
    limit = 20,
    sort = "frequency",
    days = null,
    search = "",
    productType = "",
    brand = "",
    category = "",
    confidence = "",
} = {}) {
    return request("/api/search-intents", {
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
    });
}

/**
 * Get details for a single search intent.
 * GET /api/search-intents/:id
 */
export async function getSearchIntentDetails({ shop, id }) {
    return request(`/api/search-intents/${encodeURIComponent(id)}`, { shop });
}

/**
 * Get structured intent for Smart Product Matching.
 * POST /api/search-intents/structured-intent
 */
export async function getStructuredIntent({ shop, searchQuery }) {
    return postRequest("/api/search-intents/structured-intent", { searchQuery }, { shop });
}

/**
 * Smart Product Matching: find real Shopify products matching intent.
 * POST /api/search-intents/match-products
 */
export async function matchProducts({ shop, searchQuery, structuredIntent, attributes }) {
    return postRequest(
        "/api/search-intents/match-products",
        { searchQuery, structuredIntent, attributes },
        { shop }
    );
}
