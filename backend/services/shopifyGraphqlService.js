import { getShopifyUrl } from "../config/shopify.js";

const MAX_READ_RETRIES = 2;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

const isReadQuery = (query) => {
  const operation = query.replace(/^\s*(?:#[^\r\n]*(?:\r?\n|$)\s*)*/, "");
  return /^\s*(query\b|{)/.test(operation);
};

const retryDelay = (response, attempt) => {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }

  return 250 * 2 ** attempt;
};

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const shopifyGraphQL = async ({
  shop,
  accessToken,
  query,
  variables = {},
}) => {
  if (!shop || !accessToken || !query) {
    throw new Error("Shop, access token, and GraphQL query are required.");
  }

  const url = getShopifyUrl(shop);
  const retryableRead = isReadQuery(query);

  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (!retryableRead || attempt >= MAX_READ_RETRIES) throw error;
      await wait(250 * 2 ** attempt);
      continue;
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      if (
        retryableRead &&
        attempt < MAX_READ_RETRIES &&
        RETRYABLE_HTTP_STATUSES.has(response.status)
      ) {
        await wait(retryDelay(response, attempt));
        continue;
      }
      throw new Error(`Shopify returned invalid JSON. HTTP ${response.status}`);
    }

    const errors = Array.isArray(data?.errors)
      ? data.errors
      : data?.errors
        ? [data.errors]
        : [];
    const graphQLErrors = errors
      .map((error) =>
        typeof error === "string" ? error : error?.message
      )
      .filter(Boolean);
    const responseError = data?.error_description || data?.error || "";
    const wasThrottled = errors.some(
      (error) => error?.extensions?.code === "THROTTLED"
    );

    if (
      retryableRead &&
      attempt < MAX_READ_RETRIES &&
      (RETRYABLE_HTTP_STATUSES.has(response.status) || wasThrottled)
    ) {
      await wait(retryDelay(response, attempt));
      continue;
    }

    if (!response.ok) {
      const details = graphQLErrors.join("; ") || responseError;
      throw new Error(
        `Shopify GraphQL request failed with HTTP ${response.status}${
          details ? `: ${details}` : ""
        }`
      );
    }

    if (graphQLErrors.length) {
      throw new Error(graphQLErrors.join("; "));
    }

    if (!data?.data) {
      throw new Error("Shopify GraphQL response did not include data.");
    }

    return data.data;
  }
};
