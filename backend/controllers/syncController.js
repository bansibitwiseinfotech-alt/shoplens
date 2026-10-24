import { syncShopData } from "../services/syncService.js";
import { syncOrders, fetchLiveOrders } from "../services/orderSyncService.js";
import { fetchLiveCustomers, syncCustomers } from "../services/customerSyncService.js";
import { syncCollections } from "../services/collectionSyncService.js";

export const syncStore = async (req, res) => {
  try {
    const result = await syncShopData(req.shop);

    return res.status(200).json({
      success: true,
      message: "Shopify data synchronized successfully",
      data: result,
    });
  } catch (error) {
    console.error("Sync error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const syncOrdersController = async (req, res) => {
  try {
    const result = await syncOrders(
      req.shop,
      req.accessToken,
      {
        since: req.body?.since,
        orderId: req.body?.orderId,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Orders synchronized successfully (direct from Shopify GraphQL).",
      data: result,
    });
  } catch (error) {
    console.error("Order synchronization error:", error);

    return res.status(500).json({
      success: false,
      message: "Order synchronization failed.",
      error: error.message,
      data: error.syncSummary || null,
    });
  }
};

export const getLiveOrdersController = async (req, res) => {
  try {
    const limit = Number(req.query?.limit) || 50;
    const search = req.query?.search || null;
    const cursor = req.query?.cursor || null;
    const since = req.query?.since || null;

    const result = await fetchLiveOrders(req.shop, {
      accessToken: req.accessToken,
      limit,
      search,
      cursor,
      since,
    });

    return res.status(200).json({
      success: true,
      data: result.orders,
      pageInfo: result.pageInfo,
      totalFetched: result.totalFetched,
    });
  } catch (error) {
    console.error("Fetch live orders error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch live orders from Shopify.",
    });
  }
};

export const syncCustomersController = async (req, res) => {
  try {
    const result = await syncCustomers(
      req.shop,
      req.accessToken,
      {
        since: req.body?.since,
        customerId: req.body?.customerId,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Customers fetched directly from Shopify GraphQL; no MongoDB records were written.",
      data: result,
    });
  } catch (error) {
    console.error("Customer synchronization error:", error);

    return res.status(500).json({
      success: false,
      message: "Customer synchronization failed.",
      error: error.message,
      data: error.syncSummary || null,
    });
  }
};

export const syncCollectionsController = async (req, res) => {
  try {
    const result = await syncCollections(
      req.shop,
      req.accessToken,
      {
        since: req.body?.since,
        collectionId: req.body?.collectionId,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Collections synchronized successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Collection synchronization error:", error);

    return res.status(500).json({
      success: false,
      message: "Collection synchronization failed.",
      error: error.message,
      data: error.syncSummary || null,
    });
  }
};

export const getLiveCustomersController = async (req, res) => {
  try {
    const result = await fetchLiveCustomers(req.shop, {
      accessToken: req.accessToken,
      limit: req.query?.limit,
      search: req.query?.search || null,
      cursor: req.query?.cursor || null,
    });

    return res.status(200).json({
      success: true,
      data: result.customers,
      pageInfo: result.pageInfo,
      totalFetched: result.totalFetched,
    });
  } catch (error) {
    console.error("Fetch live customers error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch live customers from Shopify.",
    });
  }
};