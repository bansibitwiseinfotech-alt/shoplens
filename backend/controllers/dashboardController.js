import { getDashboardOverview } from "../services/dashboardService.js";

/**
 * Resolve shop domain from authenticated request.
 */
function resolveShop(req) {
  if (typeof req.shop === "string" && req.shop.trim()) {
    return req.shop.trim().toLowerCase();
  }
  if (req.store?.shop) {
    return req.store.shop.trim().toLowerCase();
  }
  return (
    req.headers["x-shopify-shop-domain"] ||
    req.headers["x-shop-domain"] ||
    req.query?.shop ||
    null
  );
}

/**
 * GET /api/dashboard/overview
 * Comprehensive dashboard summary endpoint.
 */
export async function getDashboardOverviewController(req, res) {
  try {
    const shop = resolveShop(req);

    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shop domain is required.",
      });
    }

    const { from, to, datePreset } = req.query;

    const data = await getDashboardOverview({
      shop,
      accessToken: req.accessToken,
      from,
      to,
      datePreset: datePreset || "last30",
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Dashboard overview controller error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load dashboard overview.",
    });
  }
}

export default {
  getDashboardOverviewController,
};
