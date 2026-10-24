import { shopifyBackendRequest } from "../../app/services/shopifyBackendApi.js";

export async function getDashboardOverview({
  shop,
  from,
  to,
  datePreset = "last30",
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (datePreset) params.set("datePreset", datePreset);

  const response = await shopifyBackendRequest(
    `/api/dashboard/overview?${params.toString()}`,
    { shop, signal }
  );

  if (!response.data || typeof response.data !== "object") {
    throw new Error("The ShopLens backend returned no dashboard data.");
  }

  return response.data;
}

export default {
  getDashboardOverview,
};
