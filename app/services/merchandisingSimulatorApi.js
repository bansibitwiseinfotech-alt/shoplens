import { shopifyBackendRequest } from "./shopifyBackendApi.js";

const BASE_PATH = "/api/merchandising-simulator";

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

export async function getSimulatorProducts(shop, { q = "", page = 1, limit = 20 } = {}) {
  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (q) queryParams.set("q", q);

  const response = await shopifyBackendRequest(
    `${BASE_PATH}/products?${queryParams.toString()}`,
    { shop }
  );

  return {
    products: requireArray(response.data, "Invalid products list from simulator."),
    pagination: response.pagination || { page: 1, limit: 20, total: 0, pages: 1 },
  };
}

export async function getSimulatorBaseline(
  shop,
  { startDate, endDate, productId = null }
) {
  const params = new URLSearchParams({
    startDate,
    endDate,
  });
  if (productId) params.set("productId", productId);

  const response = await shopifyBackendRequest(
    `${BASE_PATH}/baseline?${params.toString()}`,
    { shop }
  );

  return requireObject(response.data, "Invalid baseline response from simulator.");
}

export async function calculateSimulatorScenario(shop, payload) {
  const response = await shopifyBackendRequest(`${BASE_PATH}/calculate`, {
    shop,
    method: "POST",
    body: payload,
  });

  return requireObject(response.data, "Invalid calculation result from simulator.");
}

export async function saveSimulatorScenario(shop, payload) {
  const response = await shopifyBackendRequest(`${BASE_PATH}/scenarios`, {
    shop,
    method: "POST",
    body: payload,
  });

  return requireObject(response.data, "Invalid save scenario response from simulator.");
}

export async function listSimulatorScenarios(shop, { page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const response = await shopifyBackendRequest(
    `${BASE_PATH}/scenarios?${params.toString()}`,
    { shop }
  );

  return {
    scenarios: requireArray(response.data, "Invalid saved scenarios list from simulator."),
    pagination: response.pagination || { page: 1, limit: 20, total: 0, pages: 1 },
  };
}

export async function getSimulatorScenario(shop, id) {
  const response = await shopifyBackendRequest(
    `${BASE_PATH}/scenarios/${encodeURIComponent(id)}`,
    { shop }
  );

  return requireObject(response.data, "Invalid scenario detail from simulator.");
}

export async function deleteSimulatorScenario(shop, id) {
  const response = await shopifyBackendRequest(
    `${BASE_PATH}/scenarios/${encodeURIComponent(id)}`,
    {
      shop,
      method: "DELETE",
    }
  );

  return response;
}
