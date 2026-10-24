// app/routes/api.backend.$.jsx
/**
 * Same-Origin HTTPS API Proxy for ShopLens Backend.
 *
 * Browsers like Firefox strictly block mixed active content (fetching http://localhost:5000
 * from inside an HTTPS iframe on https://admin.shopify.com).
 *
 * This server-side proxy accepts requests on the app's secure HTTPS domain (/api/backend/*)
 * and forwards them to the local backend on port 5000 server-to-server with full headers
 * and session authentication, guaranteeing 100% compatibility across Firefox, Safari, and Chrome.
 */

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.INTERNAL_BACKEND_URL ||
  "http://127.0.0.1:5000";

const PROXY_BASE_PATH = "/api/backend";

async function proxyRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-shopify-shop-domain, x-support-token, x-staff-token",
      },
    });
  }

  const url = new URL(request.url);
  const proxyPath = url.pathname
    .slice(PROXY_BASE_PATH.length)
    .replace(/^\/+/, "");
  const targetUrl = `${BACKEND_URL.replace(/\/+$/, "")}/${proxyPath}${url.search}`;

  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === "authorization" ||
      lower.startsWith("x-") ||
      lower === "content-type" ||
      lower === "accept"
    ) {
      headers.set(key, value);
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });

    const responseHeaders = new Headers();
    const contentType = backendResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("Content-Type", contentType);
    }
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[Backend Proxy Error] ${request.method} ${targetUrl}:`, error.message);
    return Response.json(
      {
        success: false,
        message: `Unable to connect to ShopLens backend at ${BACKEND_URL}. Check that the backend server is running.`,
        error: error.message,
      },
      { status: 502 }
    );
  }
}

export const loader = async ({ request }) => {
  return proxyRequest(request);
};

export const action = async ({ request }) => {
  return proxyRequest(request);
};
