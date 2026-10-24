import { redirect } from "react-router";

/**
 * Root index route — redirect all visitors directly to the Dashboard.
 *
 * Shopify embedded-app installs land here with a ?shop= param.
 * We forward that param so the auth flow in /app picks it up correctly.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // Preserve all existing query params (shop, hmac, host, etc.)
  // so Shopify OAuth install flow and embedded navigation both work.
  const qs = url.searchParams.toString();
  throw redirect(qs ? `/app?${qs}` : "/app");
};

export default function Index() {
  return null;
}

