import crypto from "node:crypto";
import { authenticate } from "../shopify.server";
import { forwardSearchIntelligenceEvent } from "../services/searchIntelligence.server";

function verifyAppProxySignature(searchParams, secret) {
  if (!secret) return false;
  const received = searchParams.get("signature");
  if (!received) return false;

  const parameters = [...searchParams.entries()]
    .filter(([key]) => key !== "signature")
    .sort(([keyA, valueA], [keyB, valueB]) => {
      const keyOrder = keyA.localeCompare(keyB);
      return keyOrder || valueA.localeCompare(valueB);
    });

  for (const delimiter of ["", "&"]) {
    const message = parameters.map(([key, value]) => `${key}=${value}`).join(delimiter);
    const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
    if (
      expected.length === received.length &&
      crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"))
    ) {
      return true;
    }
  }
  return false;
}

export const action = async ({ request }) => {
  try {
    const requestUrl = new URL(request.url);
    let shop = null;

    // 1. Try Shopify SDK appProxy authentication
    try {
      const proxy = await authenticate.public.appProxy(request);
      shop = proxy?.session?.shop || requestUrl.searchParams.get("shop");
    } catch (proxyError) {
      // Offline session missing or SDK HMAC nuance
      if (proxyError instanceof Response && proxyError.status === 400) {
        // Continue to fallback signature check
      } else {
        console.warn("[Search Intelligence] SDK appProxy fallback triggered:", proxyError?.message);
      }
    }

    // 2. Direct HMAC verification fallback
    if (!shop) {
      const secret = process.env.SHOPIFY_API_SECRET;
      if (verifyAppProxySignature(requestUrl.searchParams, secret)) {
        shop = requestUrl.searchParams.get("shop");
      }
    }

    // 3. Fallback shop from query param if provided
    if (!shop) {
      shop = requestUrl.searchParams.get("shop");
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json(
        { success: false, message: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return Response.json(
        { success: false, message: "Request body must be a JSON object." },
        { status: 400 }
      );
    }

    if (!shop) {
      shop = payload.trackingId || payload.shop;
    }

    if (!shop) {
      return Response.json(
        { success: false, message: "Verified Shopify shop is missing." },
        { status: 401 }
      );
    }

    if (
      payload.trackingId &&
      shop &&
      String(payload.trackingId).toLowerCase() !== String(shop).toLowerCase()
    ) {
      payload.trackingId = shop;
    }

    if (payload.event && typeof payload.event === "object") {
      payload.event.data = {
        ...(payload.event.data || {}),
        source: "app_proxy",
      };
    }
    payload.trackingId = shop;

    const result = await forwardSearchIntelligenceEvent(payload);
    return Response.json(result);
  } catch (err) {
    console.error("[Search Intelligence] App Proxy ingestion error:", {
      message: err?.message,
      statusCode: err?.statusCode,
      stack: err?.stack,
    });
    const status =
      Number.isInteger(err?.statusCode) && err.statusCode >= 400
        ? err.statusCode
        : 500;
    return Response.json(
      {
        success: false,
        message: err.message || "Unable to process the search event.",
      },
      { status }
    );
  }
};

export const loader = () => {
  return Response.json(
    { success: false, message: "POST is required for event ingestion." },
    { status: 405, headers: { Allow: "POST" } }
  );
};
