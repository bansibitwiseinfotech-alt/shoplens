/**
 * ShopLens - Storefront Search & Merchandising Intelligence Tracker
 * Runs on the storefront to capture search queries, product clicks, product views,
 * add-to-cart actions, and merchandising engagement via Shopify App Proxy.
 */
(function () {
  "use strict";

  if (window.__ShopLensTrackerActive) return;
  window.__ShopLensTrackerActive = true;

  const config = window.ShopLens || {};
  const shop = config.shop || window.location.hostname;
  const primaryEndpoint = "/apps/search-intelligence/events";
  const fallbackEndpoint =
    config.fallbackEndpoint ||
    "https://organisations-enrolled-responding-expression.trycloudflare.com/api/search-intelligence/events";
  const sessionKey = "shoplens_session_id";
  const searchKey = "shoplens_last_search_query";
  const searchTimeKey = "shoplens_last_search_time";
  const searchSentKey = "shoplens_last_search_sent_query";
  const searchSentTimeKey = "shoplens_last_search_sent_time";

  let lastSentQuery = "";
  let lastSentTime = 0;

  function getActiveEndpoint() {
    if (config.apiUrl) return config.apiUrl;
    try {
      const cached = window.sessionStorage.getItem("shoplens_verified_endpoint");
      if (cached) return cached;
    } catch {}
    return primaryEndpoint;
  }

  function setVerifiedEndpoint(url) {
    try {
      window.sessionStorage.setItem("shoplens_verified_endpoint", url);
    } catch {}
  }

  function getSessionId() {
    try {
      let id = window.sessionStorage.getItem(sessionKey);
      if (!id) {
        id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        window.sessionStorage.setItem(sessionKey, id);
      }
      return id;
    } catch {
      return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function sendEvent(eventName, data) {
    if (!shop) return;
    const now = Date.now();
    const eventId = `evt_${eventName}_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({
      trackingId: shop,
      event: {
        id: eventId,
        name: eventName,
        timestamp: new Date().toISOString(),
        clientId: getSessionId(),
        data: data || {},
      },
    });

    console.log(`[ShopLens] Sending storefront event: ${eventName}`, data);

    const initialEndpoint = getActiveEndpoint();

    function executeDelivery(url, isRetry) {
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        mode: "cors",
      })
        .then((response) => {
          if (response.ok) {
            setVerifiedEndpoint(url);
          } else if (!isRetry && fallbackEndpoint && url !== fallbackEndpoint) {
            console.warn(
              `[ShopLens] ${eventName} endpoint (${url}) returned HTTP ${response.status}. Retrying via fallback...`
            );
            return executeDelivery(fallbackEndpoint, true);
          } else {
            console.warn(`[ShopLens] ${eventName} rejected (HTTP ${response.status}).`);
          }
        })
        .catch((error) => {
          if (!isRetry && fallbackEndpoint && url !== fallbackEndpoint) {
            console.warn(
              `[ShopLens] Delivery to ${url} failed (${error?.message}). Retrying via fallback...`
            );
            return executeDelivery(fallbackEndpoint, true);
          }
          try {
            if (navigator.sendBeacon) {
              const blob = new Blob([payload], { type: "application/json" });
              navigator.sendBeacon(url, blob);
            }
          } catch {}
        });
    }

    try {
      executeDelivery(initialEndpoint, false);
    } catch {
      if (initialEndpoint !== fallbackEndpoint && fallbackEndpoint) {
        try {
          executeDelivery(fallbackEndpoint, true);
        } catch {}
      }
    }
  }

  // --- 1. SEARCH SUBMITTED TRACKING ---
  function trackSearch(query, resultCount, returnedProductIds) {
    if (!query || typeof query !== "string") return;
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    const normalized = cleanQuery.toLowerCase();
    const now = Date.now();

    // Cache recent search for click attribution
    try {
      window.sessionStorage.setItem(searchKey, cleanQuery);
      window.sessionStorage.setItem(searchTimeKey, now.toString());
    } catch {}

    // Check both in-memory and sessionStorage debounce (6s window across navigation / page reloads)
    let sessionLastQuery = "";
    let sessionLastTime = 0;
    try {
      sessionLastQuery = window.sessionStorage.getItem(searchSentKey) || "";
      sessionLastTime = parseInt(window.sessionStorage.getItem(searchSentTimeKey) || "0", 10);
    } catch {}

    const isMemDuplicate = lastSentQuery === normalized && now - lastSentTime < 6000;
    const isSessionDuplicate = sessionLastQuery === normalized && now - sessionLastTime < 6000;

    if (isMemDuplicate || isSessionDuplicate) {
      return;
    }

    lastSentQuery = normalized;
    lastSentTime = now;
    try {
      window.sessionStorage.setItem(searchSentKey, normalized);
      window.sessionStorage.setItem(searchSentTimeKey, now.toString());
    } catch {}

    sendEvent("search_submitted", {
      query: cleanQuery,
      resultCount: typeof resultCount === "number" ? resultCount : undefined,
      hasResults: typeof resultCount === "number" ? resultCount > 0 : undefined,
      returnedProductIds:
        Array.isArray(returnedProductIds) && returnedProductIds.length > 0
          ? returnedProductIds
          : undefined,
    });
  }

  // Trigger: Customer submits search form
  document.addEventListener(
    "submit",
    function (e) {
      try {
        const form = e.target;
        if (form && typeof form.querySelector === "function") {
          const input = form.querySelector('input[name="q"], input[type="search"]');
          if (input && input.value && input.value.trim()) {
            trackSearch(input.value.trim());
          }
        }
      } catch {}
    },
    true
  );

  // Trigger: Customer presses Enter in search input
  document.addEventListener(
    "keydown",
    function (e) {
      if (e.key === "Enter" || e.keyCode === 13) {
        try {
          const target = e.target;
          if (
            target &&
            (target.name === "q" ||
              target.type === "search" ||
              (target.className && String(target.className).indexOf("search") !== -1))
          ) {
            // If the input belongs to a form, let form submit handle tracking to prevent double emission
            if (target.form) return;
            if (target.value && target.value.trim()) {
              trackSearch(target.value.trim());
            }
          }
        } catch {}
      }
    },
    true
  );

  // Trigger: Customer is on or lands on search results page (/search?q=...)
  function checkSearchResultsPage() {
    try {
      const isSearchPage =
        window.location.pathname === "/search" ||
        window.location.pathname.endsWith("/search") ||
        config.template === "search";

      const params = new URLSearchParams(window.location.search);
      const urlQuery = params.get("q") || (config.search && config.search.query);

      if (isSearchPage && urlQuery && urlQuery.trim()) {
        const cleanQ = urlQuery.trim();
        let count = config.search?.resultsCount;
        const returnedProductIds = [];

        const productCards = document.querySelectorAll(
          ".product-grid .grid__item, .template-search__results .grid__item, ul#product-grid li, .product-card"
        );
        if (productCards && productCards.length > 0) {
          if (count === undefined) count = productCards.length;
          productCards.forEach(function (card) {
            const pidEl = card.querySelector("[data-product-id], [data-id]");
            let pid = pidEl
              ? pidEl.getAttribute("data-product-id") || pidEl.getAttribute("data-id")
              : null;
            if (!pid) {
              const link = card.querySelector('a[href*="/products/"]');
              if (link) {
                const href = link.getAttribute("href") || "";
                const match = href.match(/\/products\/([a-zA-Z0-9_.-]+)/);
                if (match) pid = match[1];
              }
            }
            if (pid) returnedProductIds.push(pid);
          });
        }

        const pageText = (document.body ? document.body.innerText : "") || "";
        if (
          pageText.indexOf("No results found") !== -1 ||
          pageText.indexOf("0 results") !== -1
        ) {
          count = 0;
        } else if (count === undefined) {
          const countEl = document.querySelector(
            "[data-search-results-count], .facets__count, .search__status, #ProductCount, #ProductCountDesktop"
          );
          if (countEl) {
            const numMatch = countEl.textContent.match(/\d+/);
            if (numMatch) count = parseInt(numMatch[0], 10);
          }
        }

        trackSearch(cleanQ, count, returnedProductIds);
      }
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkSearchResultsPage);
  } else {
    checkSearchResultsPage();
  }

  // --- 2. PRODUCT CLICK TRACKING ---
  function getRecentSearchQuery() {
    try {
      const q = window.sessionStorage.getItem(searchKey);
      const time = parseInt(window.sessionStorage.getItem(searchTimeKey) || "0", 10);
      if (q && Date.now() - time < 30 * 60 * 1000) {
        return q;
      }
    } catch {}
    return "";
  }

  document.addEventListener(
    "click",
    function (event) {
      const target =
        event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;

      // Handle product clicks
      const link = target.closest('a[href*="/products/"]');
      if (link) {
        try {
          const path = new URL(link.href, window.location.origin).pathname;
          const productMatch = path.match(/\/products\/([^/?#]+)/);
          if (productMatch) {
            const handle = decodeURIComponent(productMatch[1]);
            const card =
              link.closest(".card, .card-wrapper, .grid__item, .product-card, li, .predictive-search__item") ||
              link;
            const titleEl = card.querySelector(".card__heading, .card-title, h3, h2, a") || link;
            const title = (titleEl ? titleEl.textContent : "").trim();

            const isSearchPage = window.location.pathname === "/search";
            const searchParams = new URLSearchParams(window.location.search);
            const activeQuery =
              (isSearchPage ? searchParams.get("q") : null) || getRecentSearchQuery();

            const productElement = card.querySelector("[data-product-id], [data-id]");
            const rawProductId =
              productElement?.getAttribute("data-product-id") ||
              productElement?.getAttribute("data-id");
            const numericProductId = rawProductId?.match(/\d+/)?.[0];
            const productId = numericProductId
              ? `gid://shopify/Product/${numericProductId}`
              : null;

            const clickKey = `shoplens_click_${handle}_${productId || ""}`;
            const lastClick = window.sessionStorage.getItem(clickKey);
            const now = Date.now();
            if (!lastClick || now - parseInt(lastClick, 10) > 6000) {
              window.sessionStorage.setItem(clickKey, now.toString());
              sendEvent("product_click", {
                productId,
                handle,
                title,
                query: activeQuery || undefined,
              });
            }
          }
        } catch {}
      }

      // Handle collection merchandising click
      if (config.template === "collection" && config.collection) {
        const collLink = target.closest('a[href*="/products/"]');
        if (collLink) {
          const collPath = new URL(collLink.href, window.location.origin).pathname;
          const collMatch = collPath.match(/\/products\/([^/?#]+)/);
          if (collMatch) {
            sendEvent("collection_product_clicked", {
              collectionHandle: config.collection,
              productHandle: decodeURIComponent(collMatch[1]),
            });
          }
        }
      }

      // Handle add to cart button click
      const cartBtn = target.closest(
        'button[name="add"], form[action*="/cart/add"] [type="submit"], .product-form__submit, [data-add-to-cart]'
      );
      if (cartBtn) {
        try {
          const form = cartBtn.closest('form[action*="/cart/add"]');
          const variantInput = form?.querySelector('input[name="id"], select[name="id"]');
          const variantId = variantInput?.value || null;
          const prodTitle =
            document.querySelector(".product__title, h1.product-title, h1")?.textContent?.trim() || "";
          const activeQuery = getRecentSearchQuery();

          const cartKey = `shoplens_atc_${config.productId || variantId || prodTitle}`;
          const lastCart = window.sessionStorage.getItem(cartKey);
          const now = Date.now();
          if (lastCart && now - parseInt(lastCart, 10) < 6000) return;
          try { window.sessionStorage.setItem(cartKey, now.toString()); } catch {}

          sendEvent("add_to_cart", {
            productId: config.productId ? `gid://shopify/Product/${config.productId}` : null,
            variantId: variantId ? `gid://shopify/ProductVariant/${variantId}` : null,
            title: prodTitle,
            query: activeQuery || undefined,
          });
        } catch {}
      }
    },
    true
  );

  // --- 3. PRODUCT VIEW TRACKING ---
  function checkProductPage() {
    try {
      const isProductPage =
        window.location.pathname.includes("/products/") ||
        config.template === "product";
      if (!isProductPage) return;

      const path = window.location.pathname;
      const match = path.match(/\/products\/([^/?#]+)/);
      const handle = match ? decodeURIComponent(match[1]) : "";
      const prodTitle =
        document.querySelector(".product__title, h1.product-title, h1")?.textContent?.trim() || "";
      const productId = config.productId ? `gid://shopify/Product/${config.productId}` : null;

      const viewKey = `shoplens_view_${handle || productId}`;
      const lastView = window.sessionStorage.getItem(viewKey);
      const now = Date.now();
      if (!lastView || now - parseInt(lastView, 10) > 3000) {
        window.sessionStorage.setItem(viewKey, now.toString());

        sendEvent("product_viewed", {
          productId,
          handle,
          title: prodTitle,
        });

        // Search attribution check
        const ref = document.referrer || "";
        const recentQ = getRecentSearchQuery();
        if (ref.includes("/search") || recentQ) {
          let qFromUrl = "";
          try {
            qFromUrl = new URL(ref).searchParams.get("q") || "";
          } catch {}
          const finalQ = qFromUrl || recentQ;
          if (finalQ) {
            sendEvent("product_click", {
              productId,
              handle,
              title: prodTitle,
              query: finalQ,
            });
          }
        }
      }
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkProductPage);
  } else {
    checkProductPage();
  }

  // --- 4. AJAX CART INTERCEPTION (for drawer/pop-up cart additions) ---
  try {
    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = function () {
        const url = arguments[0];
        const options = arguments[1];
        const isCartAdd =
          typeof url === "string" &&
          (url.includes("/cart/add") || url.includes("/cart/add.js"));

        const promise = originalFetch.apply(this, arguments);
        if (isCartAdd) {
          promise
            .then((res) => {
              if (res.ok) {
                res
                  .clone()
                  .json()
                  .then((cartItem) => {
                    const activeQuery = getRecentSearchQuery();
                    sendEvent("add_to_cart", {
                      productId: cartItem?.product_id
                        ? `gid://shopify/Product/${cartItem.product_id}`
                        : null,
                      variantId: cartItem?.variant_id || cartItem?.id
                        ? `gid://shopify/ProductVariant/${cartItem.variant_id || cartItem.id}`
                        : null,
                      title: cartItem?.title || cartItem?.product_title || "",
                      value: cartItem?.price ? cartItem.price / 100 : undefined,
                      currency: config.currency,
                      query: activeQuery || undefined,
                    });
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
        return promise;
      };
    }
  } catch {}
})();
