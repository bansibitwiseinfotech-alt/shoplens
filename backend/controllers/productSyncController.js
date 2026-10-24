import { syncProducts, fetchLiveProducts } from "../services/productSyncService.js";

export async function syncProductsController(req, res) {
  try {
    const result = await syncProducts(req.shop, req.accessToken);

    return res.status(200).json({
      success: true,
      message: "Products synchronized successfully (direct from Shopify GraphQL).",
      data: result,
    });
  } catch (error) {
    console.error("Product synchronization error:", error);

    return res.status(500).json({
      success: false,
      message: "Product synchronization failed.",
      error: error.message,
    });
  }
}

export async function getLiveProductsController(req, res) {
  try {
    const limit = Number(req.query?.limit) || 50;
    const search = req.query?.search || null;
    const cursor = req.query?.cursor || null;

    const result = await fetchLiveProducts(req.shop, {
      accessToken: req.accessToken,
      limit,
      search,
      cursor,
    });

    return res.status(200).json({
      success: true,
      data: result.products,
      pageInfo: result.pageInfo,
      totalFetched: result.totalFetched,
    });
  } catch (error) {
    console.error("Fetch live products error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch live products from Shopify.",
      error: error.message,
    });
  }
}