import { register } from "@shopify/web-pixels-extension";

register(({ analytics, browser, init }) => {
  const shop = init?.data?.shop?.myshopifyDomain;
  const location = init?.context?.document?.location;
  const endpoint = location?.origin
    ? `${location.origin}/apps/search-intelligence/events`
    : null;
  const fallbackEndpoint =
    "https://organisations-enrolled-responding-expression.trycloudflare.com/api/search-intelligence/events";
  const sessionKey = "shoplens_search_attribution";
  const attributionWindowMs = 30 * 60 * 1000;

  const reportFailure = (eventName, error) => {
    console.warn(
      `[ShopLens Pixel] ${eventName} delivery:`,
      error?.message || "unknown error"
    );
  };

  const sendEvent = async (eventName, event, extraData = {}) => {
    if (!shop) return;

    const payload = JSON.stringify({
      trackingId: shop,
      event: {
        id:
          event.id ||
          `evt_pixel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        name: eventName,
        timestamp: event.timestamp || new Date().toISOString(),
        clientId: event.clientId || null,
        data: {
          ...event.data,
          ...extraData,
          source: "shopify_web_pixel",
        },
      },
    });

    const targetUrl = endpoint || fallbackEndpoint;
    try {
      if (browser?.sendBeacon) {
        const queued = await browser.sendBeacon(targetUrl, payload);
        if (!queued && targetUrl !== fallbackEndpoint) {
          await browser.sendBeacon(fallbackEndpoint, payload);
        }
      }
    } catch (error) {
      if (targetUrl !== fallbackEndpoint && browser?.sendBeacon) {
        try {
          await browser.sendBeacon(fallbackEndpoint, payload);
        } catch (fbErr) {
          reportFailure(eventName, fbErr);
        }
      } else {
        reportFailure(eventName, error);
      }
    }
  };

  const readRecentSearch = async () => {
    try {
      const savedValue = await browser.sessionStorage.getItem(sessionKey);
      const recentSearch = savedValue ? JSON.parse(savedValue) : null;
      if (
        !recentSearch?.query ||
        Date.now() - recentSearch.timestamp > attributionWindowMs
      ) {
        return null;
      }
      return recentSearch;
    } catch (error) {
      return null;
    }
  };

  // Keep search attribution active in session for checkout attribution
  // (Storefront search tracking itself is sent by the single ShopLens Theme App Embed)
  analytics.subscribe("search_submitted", async (event) => {
    const searchResult = event.data?.searchResult;
    const query = searchResult?.query?.trim();
    if (!query) return;

    try {
      await browser.sessionStorage.setItem(
        sessionKey,
        JSON.stringify({
          query,
          queryId: event.id,
          timestamp: Date.now(),
        })
      );
    } catch {}
  });

  // Dedicated Checkout / Purchase Tracking from inside the sandbox
  analytics.subscribe("checkout_completed", async (event) => {
    const recentSearch = await readRecentSearch();
    const checkout = event.data?.checkout;

    await sendEvent("purchase", event, {
      orderId: checkout?.order?.id,
      value: checkout?.totalPrice?.amount,
      currency: checkout?.currencyCode,
      query: recentSearch?.query,
      queryId: recentSearch?.queryId,
      lineItems: checkout?.lineItems?.map((item) => ({
        productId: item.variant?.product?.id,
        variantId: item.variant?.id,
        title: item.title,
        quantity: item.quantity,
      })),
    });
  });
});
