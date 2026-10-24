const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    if (window.__ENV__?.VITE_BACKEND_URL) return window.__ENV__.VITE_BACKEND_URL;
    if (window.location.protocol === "https:") return "/api/backend";
  }
  return import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
};

const API_BASE_URL = getApiBaseUrl();

async function getSessionToken() {
    if (typeof window === "undefined" || !window.shopify?.idToken) {
        throw new Error(
            "Shopify session token is unavailable. Open the app inside Shopify Admin."
        );
    }

    return window.shopify.idToken();
}

async function apiRequest(path, options = {}) {
    const token = await getSessionToken();

    const response = await fetch(
        `${API_BASE_URL}/api/recommendations${path}`,
        {
            ...options,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...options.headers,
            },
        }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            `Request failed (${response.status})`
        );
    }

    return result;
}

export const recommendationsApi = {
    list(params = {}) {
        const query = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== "" && value !== null && value !== undefined) {
                query.set(key, String(value));
            }
        });

        const suffix = query.toString() ? `?${query.toString()}` : "";
        return apiRequest(suffix);
    },

    refresh() {
        return apiRequest("/refresh", {
            method: "POST",
            body: JSON.stringify({}),
        });
    },

    getDetails(id) {
        return apiRequest(`/${encodeURIComponent(id)}`);
    },

    review(id) {
        return apiRequest(`/${encodeURIComponent(id)}/review`, {
            method: "POST",
            body: JSON.stringify({}),
        });
    },

    inProgress(id) {
        return apiRequest(`/${encodeURIComponent(id)}/in-progress`, {
            method: "POST",
            body: JSON.stringify({}),
        });
    },

    complete(id) {
        return apiRequest(`/${encodeURIComponent(id)}/complete`, {
            method: "POST",
            body: JSON.stringify({}),
        });
    },

    dismiss(id, payload = {}) {
        return apiRequest(`/${encodeURIComponent(id)}/dismiss`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    },

    executeAction(id, payload = {}) {
        return apiRequest(`/${encodeURIComponent(id)}/action/execute`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    },

    getCollections() {
        return apiRequest("/collections");
    },

    getHistory(id) {
        return apiRequest(`/${encodeURIComponent(id)}/history`);
    },
};