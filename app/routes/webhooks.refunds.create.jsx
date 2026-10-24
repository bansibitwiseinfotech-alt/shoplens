import { authenticate } from "../shopify.server";
import { forwardShopifyOrderWebhook } from "../services/searchIntelligence.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  try {
    await forwardShopifyOrderWebhook({
      shop,
      topic,
      payload,
      webhookId: request.headers.get("x-shopify-webhook-id"),
    });
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Search Intelligence refund forwarding failed:", error);
    return new Response("Search Intelligence refund processing failed.", {
      status: 500,
    });
  }
};
