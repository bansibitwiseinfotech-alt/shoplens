import { useEffect } from "react";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // Automatically activate Web Pixel on the merchant store if not already active
  try {
    const res = await admin.graphql(
      `#graphql
      mutation webPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          userErrors {
            field
            message
          }
          webPixel {
            id
            settings
          }
        }
      }`,
      {
        variables: {
          webPixel: {
            settings: {
              accountID: session.shop,
            },
          },
        },
      }
    );
    const json = await res.json();
    console.log("[ShopLens] webPixelCreate:", JSON.stringify(json));
  } catch (err) {
    console.log("[ShopLens] webPixelCreate check:", err.message);
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  if (typeof window !== "undefined") {
    window.__ENV__ = window.__ENV__ || {};
    if (window.location.protocol === "https:") {
      window.__ENV__.VITE_BACKEND_URL = "/api/backend";
    }
  }

  useEffect(() => {
    if (typeof document === "undefined") return;

    const fixBottomSpacing = () => {
      document.documentElement.style.setProperty("--shopify-safe-area-inset-bottom", "0px", "important");
      document.body.style.setProperty("padding-bottom", "0px", "important");
      document.body.style.setProperty("margin-bottom", "0px", "important");
    };

    fixBottomSpacing();
    window.addEventListener("resize", fixBottomSpacing);
    const observer = new MutationObserver(fixBottomSpacing);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });

    return () => {
      window.removeEventListener("resize", fixBottomSpacing);
      observer.disconnect();
    };
  }, []);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app" rel="home">Home</s-link>
          <s-link href="/app/search-intelligence">Search Intelligence</s-link>
          <s-link href="/app/product-discoverability">Product Discoverability</s-link>
          <s-link href="/app/zero-result-search">Zero-Result Searches</s-link>
          <s-link href="/app/search-intent">Search Intent</s-link>        
          <s-link href="/app/collection-merchandising">Collection Merchandising</s-link>
          <s-link href="/app/merchandising-rules">Smart Merchandising Rules</s-link>
          <s-link href="/app/customer-discovery-journey">Customer Discovery</s-link>
          <s-link href="/app/trending-searches">Trending Searches</s-link>
          <s-link href="/app/merchandising-simulator">Merchandising Simulator</s-link>
          <s-link href="/app/recommendations">Recommendations</s-link>
          <s-link href="/app/billing">Billing &amp; Plans</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};  
