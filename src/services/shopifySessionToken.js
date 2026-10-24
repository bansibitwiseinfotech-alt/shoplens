/**
 * Returns the Shopify App Bridge session token as an Authorization header.
 *
 * Retries up to maxAttempts times with a short delay to handle the common
 * race condition where useEffect fires before App Bridge has finished
 * initialising window.shopify.idToken on the embedded page.
 */
export const getShopifyAuthorizationHeaders = async ({ maxAttempts = 10, retryDelayMs = 200 } = {}) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (typeof window !== "undefined" && typeof window.shopify?.idToken === "function") {
      const token = await window.shopify.idToken();
      return { Authorization: `Bearer ${token}` };
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    "Shopify App Bridge is not available. Open this page from the Shopify Admin."
  );
};