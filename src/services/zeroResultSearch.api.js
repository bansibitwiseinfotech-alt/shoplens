/**
 * Zero-Result Search API Service
 * Handles communication between the frontend React application
 * and the backend zero-result search analytics endpoints.
 */
import { getShopifyAuthorizationHeaders } from "./shopifySessionToken.js";

const getBackendUrl = () => {
    if (typeof window !== "undefined" && window.__ENV__?.VITE_BACKEND_URL) {
        return window.__ENV__.VITE_BACKEND_URL;
    }
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    return "http://localhost:5000";
};

/**
 * Common request helper with resilient port fallback.
 */
async function request(endpoint, options = {}) {
    const activeBaseUrl = getBackendUrl();
    const urlsToTry = [activeBaseUrl];
    if (activeBaseUrl.includes(":4000")) {
        urlsToTry.push(activeBaseUrl.replace(":4000", ":5000"));
    } else if (activeBaseUrl.includes(":5000")) {
        urlsToTry.push(activeBaseUrl.replace(":5000", ":4000"));
    }

    let lastError = null;

    for (const baseUrl of urlsToTry) {
        try {
            const url = `${baseUrl}${endpoint}`;
            let authorizationHeaders = {};
            try {
                authorizationHeaders = await getShopifyAuthorizationHeaders();
            } catch (_) {
                // Outside App Bridge or session token not ready yet
            }

            const response = await fetch(url, {
                headers: {
                    "Content-Type": "application/json",
                    ...authorizationHeaders,
                    ...(options.headers || {}),
                },
                ...options,
            });

            let data = null;
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                data = await response.json().catch(() => ({}));
            } else {
                const text = await response.text().catch(() => "");
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { message: text || `HTTP error ${response.status}` };
                }
            }

            if (!response.ok) {
                throw new Error(
                    data?.message || data?.error || `Request failed with status ${response.status}`
                );
            }

            return data;
        } catch (err) {
            lastError = err;
            if (
                err.name === "TypeError" &&
                (err.message.includes("fetch") || err.message.includes("Failed to fetch"))
            ) {
                continue; // Try next URL candidate
            }
            throw err;
        }
    }

    throw new Error(
        lastError?.message ||
        "Unable to connect to the analytics API. Please ensure the backend is running."
    );
}

/**
 * Get dashboard summary.
 * Supports string shop or { shop, from, to }
 */
export async function getZeroResultSummary(paramsOrShop) {
    const params = new URLSearchParams();

    if (typeof paramsOrShop === "string") {
        params.set("shop", paramsOrShop);
    } else if (paramsOrShop && typeof paramsOrShop === "object") {
        if (paramsOrShop.shop) params.set("shop", paramsOrShop.shop);
        if (paramsOrShop.from) params.set("from", paramsOrShop.from);
        if (paramsOrShop.to) params.set("to", paramsOrShop.to);
    }

    return request(`/api/zero-result-searches/summary?${params.toString()}`);
}

/**
 * Get zero-result searches list.
 */
export async function getZeroResultSearches({
    shop,
    sort = "volume",
    limit = 50,
    from,
    to,
} = {}) {
    const params = new URLSearchParams();

    if (shop) params.set("shop", shop);
    if (sort) params.set("sort", sort);
    if (limit) params.set("limit", String(limit));
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    return request(`/api/zero-result-searches?${params.toString()}`);
}
