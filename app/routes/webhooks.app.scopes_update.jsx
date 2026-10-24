import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const rawBody = await request.clone().text();
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  const configuredBackendUrl = process.env.SHOPLENS_BACKEND_URL;
  if (!configuredBackendUrl && process.env.NODE_ENV === "production") {
    throw new Response("SHOPLENS_BACKEND_URL must be configured.", {
      status: 500,
    });
  }
  const backendUrl = (
    configuredBackendUrl || "http://localhost:5000"
  ).replace(/\/+$/, "");
  const backendResponse = await fetch(
    `${backendUrl}/api/webhooks/app/scopes_update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256":
          request.headers.get("x-shopify-hmac-sha256") || "",
        "X-Shopify-Shop-Domain": shop,
      },
      body: rawBody,
    },
  );

  if (!backendResponse.ok) {
    const errorMessage = await backendResponse.text();
    console.error(
      `Backend rejected app/scopes_update for ${shop} (${backendResponse.status}): ${errorMessage}`,
    );
    throw new Response("Unable to update stored Shopify permissions.", {
      status: 502,
    });
  }

  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }

  return new Response();
};
