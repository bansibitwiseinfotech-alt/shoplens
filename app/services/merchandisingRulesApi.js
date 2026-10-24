import { shopifyBackendRequest } from "./shopifyBackendApi.js";

const RULES_PATH = "/api/merchandising/rules";

function requireObject(data, message) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(message);
  }
  return data;
}

function requireArray(data, message) {
  if (!Array.isArray(data)) throw new Error(message);
  return data;
}

export async function getRuleOverview(shop) {
  const response = await shopifyBackendRequest(`${RULES_PATH}/overview`, { shop });
  const overview = requireObject(
    response.data,
    "The rule summary response is incomplete."
  );
  const numericFields = ["totalRules", "activeRules", "collectionsCovered"];

  if (
    numericFields.some((field) => !Number.isFinite(overview[field])) ||
    (overview.lastApplied !== null &&
      typeof overview.lastApplied !== "string" &&
      !(overview.lastApplied instanceof Date))
  ) {
    throw new Error("The rule summary response contains invalid data.");
  }

  return overview;
}

export async function getMerchandisingRules(shop) {
  const response = await shopifyBackendRequest(RULES_PATH, { shop });
  const rules = requireArray(
    response.data,
    "The saved rules response is incomplete."
  );
  if (
    rules.some(
      (rule) =>
        !rule ||
        typeof rule._id !== "string" ||
        typeof rule.name !== "string" ||
        (rule.priority !== undefined && rule.priority !== null && !Number.isInteger(rule.priority)) ||
        typeof rule.isActive !== "boolean" ||
        !Array.isArray(rule.collectionIds)
    )
  ) {
    throw new Error("The saved rules response contains invalid rule data.");
  }
  return rules;
}

export async function getShopCollections(shop) {
  const response = await shopifyBackendRequest(`${RULES_PATH}/collections`, {
    shop,
  });
  const collections = requireArray(
    response.data,
    "The Shopify collections response is incomplete."
  );
  if (
    collections.some(
      (collection) =>
        !collection ||
        typeof collection.id !== "string" ||
        typeof collection.title !== "string"
    )
  ) {
    throw new Error("The Shopify collections response contains invalid data.");
  }
  return collections;
}

export async function createMerchandisingRule(shop, rule) {
  const response = await shopifyBackendRequest(RULES_PATH, {
    shop,
    method: "POST",
    body: rule,
  });
  return requireObject(
    response.data,
    "The backend did not return the created rule."
  );
}

export async function updateMerchandisingRule(shop, ruleId, rule) {
  const response = await shopifyBackendRequest(
    `${RULES_PATH}/${encodeURIComponent(ruleId)}`,
    { shop, method: "PATCH", body: rule }
  );
  return requireObject(
    response.data,
    "The backend did not return the updated rule."
  );
}

export async function deleteMerchandisingRule(shop, ruleId) {
  return shopifyBackendRequest(`${RULES_PATH}/${encodeURIComponent(ruleId)}`, {
    shop,
    method: "DELETE",
  });
}

export async function applyMerchandisingRules(shop, collectionId) {
  return shopifyBackendRequest("/api/merchandising/apply", {
    shop,
    method: "POST",
    body: collectionId ? { collectionId } : {},
  });
}

export async function previewMerchandisingRule(
  shop,
  { rule, ruleId, collectionId, mode = "rule_only" } = {}
) {
  const response = await shopifyBackendRequest(`${RULES_PATH}/preview`, {
    shop,
    method: "POST",
    body: {
      rule,
      ruleId,
      collectionId,
      mode,
    },
  });
  return requireObject(
    response.data,
    "The backend did not return preview ordering data."
  );
}

