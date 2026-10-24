import Store from "../models/Store.js";

const REFRESH_BEFORE_EXPIRY_MS = 60 * 1000;
const refreshes = new Map();

const responseError = (data, status) =>
  data?.error_description ||
  data?.error ||
  `Shopify token endpoint returned HTTP ${status}`;

const refreshStoreToken = async (store) => {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("Shopify OAuth credentials are not configured.");
  }

  if (!store.refreshToken) {
    throw new Error("Shopify refresh token is missing; reconnect this store.");
  }

  if (
    store.refreshTokenExpiresAt &&
    store.refreshTokenExpiresAt.getTime() <= Date.now() + REFRESH_BEFORE_EXPIRY_MS
  ) {
    throw new Error("Shopify refresh token is expired; reconnect this store.");
  }

  let response;
  try {
    response = await fetch(`https://${store.shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: apiKey,
        client_secret: apiSecret,
        grant_type: "refresh_token",
        refresh_token: store.refreshToken,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Unable to reach Shopify's token endpoint.");
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Shopify token endpoint returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const detail = responseError(data, response.status);
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error(`Shopify token refresh was rejected: ${detail}. Reconnect this store.`);
    }
    throw new Error(`Shopify token refresh failed: ${detail}.`);
  }

  const accessExpiresIn = Number(data.expires_in);
  const refreshExpiresIn = Number(data.refresh_token_expires_in);
  if (
    !data.access_token ||
    !data.refresh_token ||
    !Number.isFinite(accessExpiresIn) ||
    accessExpiresIn <= 0 ||
    !Number.isFinite(refreshExpiresIn) ||
    refreshExpiresIn <= 0
  ) {
    throw new Error("Shopify did not return a complete expiring token pair; reconnect this store.");
  }

  const now = Date.now();
  const updatedStore = await Store.findOneAndUpdate(
    { _id: store._id },
    {
      $set: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(now + accessExpiresIn * 1000),
        refreshTokenExpiresAt: new Date(now + refreshExpiresIn * 1000),
        ...(data.scope ? { scope: data.scope } : {}),
      },
    },
    { returnDocument: "after" }
  );

  // Keep Prisma in sync with the new token pair
  try {
    const prismaModule = await import("../../app/db.server.js");
    const prisma = prismaModule.default;
    await prisma.session.update({
      where: { id: `offline_${store.shop}` },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expires: new Date(now + accessExpiresIn * 1000),
        refreshTokenExpires: new Date(now + refreshExpiresIn * 1000),
        ...(data.scope ? { scope: data.scope } : {}),
      },
    });
  } catch {
    // Non-blocking if Prisma session is unavailable
  }

  if (updatedStore) return updatedStore.accessToken;

  const latestStore = await Store.findOne({ shop: store.shop, installed: true });
  if (latestStore?.expiresAt?.getTime() > Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
    return latestStore.accessToken;
  }

  throw new Error("Shopify refreshed the token but the store record changed; retry synchronization.");
};

export const getFreshAccessToken = async (store) => {
  if (!store?.shop || !store.accessToken) {
    throw new Error("Shopify store access token is unavailable.");
  }

  if (!store.expiresAt) {
    throw new Error(
      "This store uses a legacy non-expiring Shopify token. Reconnect the store to issue expiring offline tokens."
    );
  }

  if (!store.refreshToken) {
    throw new Error(
      "Shopify refresh token is missing; reconnect this store to issue expiring offline tokens."
    );
  }

  if (store.expiresAt.getTime() > Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
    return store.accessToken;
  }

  const existingRefresh = refreshes.get(store.shop);
  if (existingRefresh) return existingRefresh;

  const refresh = refreshStoreToken(store);
  refreshes.set(store.shop, refresh);
  try {
    return await refresh;
  } finally {
    refreshes.delete(store.shop);
  }
};

export const getShopAccessToken = async (shop) => {
  if (!shop) throw new Error("Shop domain is required.");
  const normalizedShop = shop.toLowerCase().trim();
  let store = await Store.findOne({ shop: normalizedShop, installed: true });

  // First, check if Prisma has a newer refresh token
  try {
    const prismaModule = await import("../../app/db.server.js");
    const prisma = prismaModule.default;
    const session = await prisma.session.findUnique({
      where: { id: `offline_${normalizedShop}` },
    });

    if (session) {
      const prismaRefresh = session.refreshToken;
      if (prismaRefresh && prismaRefresh !== store?.refreshToken) {
        store = await Store.findOneAndUpdate(
          { shop: normalizedShop },
          {
            $set: {
              ...(session.accessToken ? { accessToken: session.accessToken } : {}),
              ...(session.expires ? { expiresAt: session.expires } : {}),
              refreshToken: prismaRefresh,
              ...(session.refreshTokenExpires ? { refreshTokenExpiresAt: session.refreshTokenExpires } : {}),
            },
          },
          { returnDocument: "after" }
        );
      }
    }
  } catch (err) {
    // Non-blocking Prisma check
  }

  if (store?.accessToken) {
    try {
      return await getFreshAccessToken(store);
    } catch {
      // If store refresh fails, try fallback below
    }
  }

  // Fallback: Check Prisma session storage from root app
  try {
    const prismaModule = await import("../../app/db.server.js");
    const prisma = prismaModule.default;
    const session = await prisma.session.findUnique({
      where: { id: `offline_${normalizedShop}` },
    });

    if (session?.accessToken) {
      const isExpired = session.expires && session.expires.getTime() <= Date.now() + REFRESH_BEFORE_EXPIRY_MS;
      if (!isExpired) {
        return session.accessToken;
      }
      if (session.refreshToken) {
        const dummyStore = {
          shop: normalizedShop,
          refreshToken: session.refreshToken,
          refreshTokenExpiresAt: session.refreshTokenExpires,
        };
        return await refreshStoreToken(dummyStore);
      }
    }
  } catch (err) {
    console.warn("Prisma fallback lookup note:", err.message);
  }

  if (store?.accessToken) {
    return store.accessToken;
  }

  throw new Error(`Shopify access token not found for shop ${shop}. Please connect the store.`);
};