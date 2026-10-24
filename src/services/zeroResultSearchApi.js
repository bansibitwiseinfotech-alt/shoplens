/**
 * ShopLens Zero-Result Search Detector API Service
 * Handles communication between the frontend React application
 * and the backend zero-result search endpoints.
 */

const getBackendUrl = () => {
    if (typeof window !== "undefined" && window.__ENV__?.VITE_BACKEND_URL) {
        return window.__ENV__.VITE_BACKEND_URL;
    }
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    return "http://localhost:5000";
};

const getShopDomain = () => {
    if (typeof window === "undefined") {
        return "";
    }

    const params = new URLSearchParams(window.location.search);
    return (
        params.get("shop") ||
        window.shopify?.config?.shop ||
        ""
    );
};

const getHeaders = (shopProp) => {    
    const shop = shopProp || getShopDomain();

    const headers = {
        "Content-Type": "application/json",
    };

    if (shop) {
        headers["x-shopify-shop-domain"] = shop;
    }

    return headers;
};

/**
 * Load dashboard overview metrics
 * GET /api/zero-result-searches/overview
 */
export const getZeroResultOverview = async (shopProp) => {
    const shop = shopProp || getShopDomain();
    const query = shop ? `?shop=${encodeURIComponent(shop)}` : "";

    const response = await fetch(
        `${getBackendUrl()}/api/zero-result-searches/overview${query}`,
        {
            method: "GET",
            headers: getHeaders(shop),
        }
    );

    if (!response.ok) {
        throw new Error("Failed to load zero-result overview");
    }

    return response.json();
};

/**
 * Load zero-result searches list with pagination and sorting
 * GET /api/zero-result-searches
 */
export const getZeroResultSearches = async ({
    shop: shopProp,
    page = 1,
    limit = 20,
    sort = "frequency",
} = {}) => {
    const shop = shopProp || getShopDomain();

    const params = new URLSearchParams();
    if (shop) params.append("shop", shop);
    params.append("page", String(page));
    params.append("limit", String(limit));
    params.append("sort", sort);

    const response = await fetch(
        `${getBackendUrl()}/api/zero-result-searches?${params.toString()}`,
        {
            method: "GET",
            headers: getHeaders(shop),
        }
    );

    if (!response.ok) {
        throw new Error("Failed to load zero-result searches");
    }

    return response.json();
};

/**
 * Load single zero-result search details
 * GET /api/zero-result-searches/:id
 */
export const getZeroResultSearchDetails = async (id, shopProp) => {
    const shop = shopProp || getShopDomain();
    const query = shop ? `?shop=${encodeURIComponent(shop)}` : "";

    const response = await fetch(
        `${getBackendUrl()}/api/zero-result-searches/${id}${query}`,
        {
            method: "GET",
            headers: getHeaders(shop),
        }
    );

    if (!response.ok) {
        throw new Error("Failed to load search details");
    }

    return response.json();
};

/**
 * Track a customer zero-result search
 * POST /api/zero-result-searches/track
 */
export const trackZeroResultSearch = async ({
    shop: shopProp,
    searchQuery,
    resultCount = 0,
}) => {
    const shop = shopProp || getShopDomain();

    const response = await fetch(
        `${getBackendUrl()}/api/zero-result-searches/track`,
        {
            method: "POST",
            headers: getHeaders(shop),
            body: JSON.stringify({
                shop,
                searchQuery,
                resultCount,
            }),
        }
    );

    if (!response.ok) {
        throw new Error("Failed to track zero-result search");
    }

    return response.json();
};