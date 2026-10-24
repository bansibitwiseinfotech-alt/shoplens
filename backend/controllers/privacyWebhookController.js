import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import Store from "../models/Store.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Collection from "../models/Collection.js";
import Product from "../models/Product.js";
import ProductDiscoverability from "../models/ProductDiscoverability.js";
import SearchEvent from "../models/searchEvent.model.js";
import SearchIntent from "../models/SearchIntent.js";
import ShopPrivacyRequest from "../models/ShopPrivacyRequest.js";

const SHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const verifyAndReadPayload = (req, res) => {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!hmac) {
    res.status(401).json({ success: false, message: "Missing Shopify webhook signature." });
    return null;
  }
  if (!secret) {
    console.error("SHOPIFY_API_SECRET is missing.");
    res.status(500).json({ success: false, message: "Webhook configuration is incomplete." });
    return null;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const receivedBytes = Buffer.from(hmac, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (
    receivedBytes.length !== expectedBytes.length ||
    !crypto.timingSafeEqual(receivedBytes, expectedBytes)
  ) {
    res.status(401).json({ success: false, message: "Invalid Shopify webhook signature." });
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ success: false, message: "Webhook body contains invalid JSON." });
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    res.status(400).json({ success: false, message: "Webhook body must be a JSON object." });
    return null;
  }

  const shop = String(req.headers["x-shopify-shop-domain"] || "").toLowerCase().trim();
  if (!SHOPIFY_DOMAIN_REGEX.test(shop) || (payload.shop_domain && payload.shop_domain !== shop)) {
    res.status(400).json({ success: false, message: "Webhook shop domain is invalid." });
    return null;
  }

  return { payload, shop };
};

const resourceIds = (id, type) => {
  if (id === undefined || id === null || id === "") return [];
  const value = String(id);
  const numericId = value.split("/").at(-1);
  return [...new Set([value, numericId, `gid://shopify/${type}/${numericId}`])];
};

export const handleCustomerDataRequest = async (req, res) => {
  try {
    const verified = verifyAndReadPayload(req, res);
    if (!verified) return;
    const { payload, shop } = verified;
    const customer = payload.customer || {};
    const customerIdValues = resourceIds(customer.id, "Customer");
    const email = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
    const orderIdValues = (payload.orders_requested || []).flatMap((id) => resourceIds(id, "Order"));
    const identityFilters = [];
    if (customerIdValues.length) identityFilters.push({ shopifyCustomerId: { $in: customerIdValues } });
    if (email) identityFilters.push({ email: new RegExp(`^${escapeRegExp(email)}$`, "i") });

    const customerRecord = identityFilters.length
      ? await Customer.findOne({ shop, $or: identityFilters }).select("-__v").lean()
      : null;
    const orders = orderIdValues.length
      ? await Order.find({ shop, shopifyOrderId: { $in: orderIdValues } }).select("-__v").lean()
      : [];
    const searchEvents = orderIdValues.length
      ? await SearchEvent.find({ shop, orderId: { $in: orderIdValues } }).select("-__v").lean()
      : [];

    const requestId = String(
      payload.data_request?.id || req.headers["x-shopify-webhook-id"] || ""
    );
    if (!requestId) {
      return res.status(400).json({ success: false, message: "Data request ID is missing." });
    }

    const requestedAt = new Date();
    await ShopPrivacyRequest.findOneAndUpdate(
      { requestId },
      {
        shop,
        requestId,
        customerId: customerIdValues[0] || null,
        customerEmail: email || null,
        customerData: { customer: customerRecord, orders, searchEvents },
        requestedAt,
        expiresAt: new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, message: "Customer data request recorded." });
  } catch (error) {
    console.error("Customer data request webhook error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to process customer data request." });
  }
};

export const handleCustomerRedact = async (req, res) => {
  try {
    const verified = verifyAndReadPayload(req, res);
    if (!verified) return;
    const { payload, shop } = verified;
    const customer = payload.customer || {};
    const customerIdValues = resourceIds(customer.id, "Customer");
    const orderIdValues = (payload.orders_to_redact || []).flatMap((id) => resourceIds(id, "Order"));
    const email = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
    const customerFilters = [];
    if (customerIdValues.length) customerFilters.push({ shopifyCustomerId: { $in: customerIdValues } });
    if (email) customerFilters.push({ email: new RegExp(`^${escapeRegExp(email)}$`, "i") });

    if (customerFilters.length) {
      await Customer.deleteMany({ shop, $or: customerFilters });
    }

    const orderFilters = [];
    if (customerIdValues.length) orderFilters.push({ "customer.id": { $in: customerIdValues } });
    if (email) orderFilters.push({ "customer.email": new RegExp(`^${escapeRegExp(email)}$`, "i") });
    if (orderIdValues.length) orderFilters.push({ shopifyOrderId: { $in: orderIdValues } });

    if (orderFilters.length) {
      await Order.updateMany({ shop, $or: orderFilters }, { $unset: { customer: "" } });
    }
    if (orderIdValues.length) {
      await SearchEvent.deleteMany({ shop, orderId: { $in: orderIdValues } });
    }
    await ShopPrivacyRequest.deleteMany({
      shop,
      $or: [
        ...(customerIdValues.length ? [{ customerId: { $in: customerIdValues } }] : []),
        ...(email ? [{ customerEmail: new RegExp(`^${escapeRegExp(email)}$`, "i") }] : []),
      ],
    });

    return res.status(200).json({ success: true, message: "Customer data redaction processed." });
  } catch (error) {
    console.error("Customer redaction webhook error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to process customer redaction." });
  }
};

export const handleShopRedact = async (req, res) => {
  try {
    const verified = verifyAndReadPayload(req, res);
    if (!verified) return;
    const { shop } = verified;

    await Promise.all([
      Customer.deleteMany({ shop }),
      Order.deleteMany({ shop }),
      Collection.deleteMany({ shop }),
      Product.deleteMany({ shop }),
      ProductDiscoverability.deleteMany({ shop }),
      SearchEvent.deleteMany({ shop }),
      SearchIntent.deleteMany({ shop }),
      ShopPrivacyRequest.deleteMany({ shop }),
      Store.deleteOne({ shop }),
    ]);

    return res.status(200).json({ success: true, message: "Shop data redaction processed." });
  } catch (error) {
    console.error("Shop redaction webhook error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to process shop redaction." });
  }
};

export const getCustomerDataRequest = async (req, res) => {
  try {
    const request = await ShopPrivacyRequest.findOne({
      shop: req.shop,
      requestId: req.params.requestId,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!request) {
      return res.status(404).json({ success: false, message: "Customer data request not found." });
    }

    return res.status(200).json({ success: true, data: request.customerData });
  } catch (error) {
    console.error("Customer data request retrieval error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve customer data request." });
  }
};