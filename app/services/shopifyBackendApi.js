import { getShopifyAuthorizationHeaders } from "../../src/services/shopifySessionToken.js";

const DEFAULT_API_URL = "http://localhost:5000";
const SESSION_TOKEN_ERROR = /session token.*(invalid|expired)|token.*(invalid|expired)/i;

export class BackendRequestError extends Error {
  constructor(message, { status, response } = {}) {
    super(message);
    this.name = "BackendRequestError";
    this.status = status;
    this.response = response;
  }
}

export const getBackendApiUrl = () => {
  if (typeof window !== "undefined") {
    if (window.__ENV__?.VITE_BACKEND_URL) {
      return window.__ENV__.VITE_BACKEND_URL;
    }
    if (window.location.protocol === "https:") {
      return "/api/backend";
    }
  }
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
    DEFAULT_API_URL
  );
};

async function getAuthorizationHeaders() {
  try {
    return await getShopifyAuthorizationHeaders();
  } catch (error) {
    throw new BackendRequestError(
      error.message || "Unable to get a Shopify session token. Reopen the app from Shopify Admin."
    );
  }
}

function getResponseMessage(response, data) {
  const message = typeof data?.message === "string" ? data.message : "";
  const validationErrors = Array.isArray(data?.errors)
    ? data.errors.filter((error) => typeof error === "string")
    : [];

  if (validationErrors.length) return validationErrors.join(" ");

  if (response.status === 401 && SESSION_TOKEN_ERROR.test(message)) {
    return "Your Shopify session expired. Refresh this page inside Shopify Admin and try again.";
  }
  if (response.status === 401 && !message) {
    return "Shopify authentication failed. Refresh this page inside Shopify Admin and try again.";
  }
  if (response.status === 403 && message) return message;
  if (response.status >= 500) {
    return message || "The ShopLens backend or Shopify request failed. Check the backend logs for details.";
  }
  return message || `ShopLens request failed with status ${response.status}.`;
}

export async function shopifyBackendRequest(
  path,
  { shop, method = "GET", body, signal } = {}
) {
  if (typeof shop !== "string" || !shop.trim()) {
    throw new BackendRequestError(
      "The authenticated Shopify shop could not be determined. Reload the app from Shopify Admin."
    );
  }

  const url = `${getBackendApiUrl().replace(/\/+$/, "")}${path}`;
  let retryExpiredToken = true;

  while (true) {
    const authorizationHeaders = await getAuthorizationHeaders();
    let response;

    try {
      response = await fetch(url, {
        method,
        signal,
        headers: {
          Accept: "application/json",
          ...authorizationHeaders,
          "Content-Type": "application/json",
          "x-shopify-shop-domain": shop,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new BackendRequestError(
        `Cannot reach the ShopLens backend at ${getBackendApiUrl()}. Start the backend and try again.`
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new BackendRequestError(
        "The ShopLens backend returned an invalid response. Check that the backend is running.",
        { status: response.status }
      );
    }

    if (
      response.status === 401 &&
      retryExpiredToken &&
      SESSION_TOKEN_ERROR.test(data?.message || "")
    ) {
      retryExpiredToken = false;
      continue;
    }

    if (!response.ok || data?.success === false) {
      throw new BackendRequestError(getResponseMessage(response, data), {
        status: response.status,
        response: data,
      });
    }

    return data;
  }
}
