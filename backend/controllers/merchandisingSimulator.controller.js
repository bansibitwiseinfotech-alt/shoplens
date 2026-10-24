import mongoose from "mongoose";
import MerchandisingScenario from "../models/MerchandisingScenario.js";
import Product from "../models/Product.js";
import {
  getSimulatorProducts,
  getVerifiedBaseline,
  calculateHypotheticalScenario,
  normalizeShop,
} from "../services/merchandisingSimulator.service.js";

function getAuthenticatedShop(req) {
  const shop = req.store?.shop || req.shop;
  return normalizeShop(shop);
}

function parseDateRange(input) {
  const start = new Date(input?.startDate);
  const end = new Date(input?.endDate);

  if (
    !input?.startDate ||
    !input?.endDate ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    const error = new Error("Provide valid startDate and endDate where startDate precedes endDate.");
    error.status = 400;
    throw error;
  }

  return { startDate: start, endDate: end };
}

function sendError(res, error) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error("[Merchandising Simulator Controller]", error);
  }
  return res.status(status).json({
    success: false,
    message: status >= 500 ? "Merchandising simulator operation failed." : error.message,
  });
}

// GET /api/merchandising-simulator/products
export async function listProducts(req, res) {
  try {
    const shop = getAuthenticatedShop(req);
    if (!shop) {
      return res.status(401).json({ success: false, message: "Store authentication required." });
    }

    const { q, page, limit } = req.query;
    const result = await getSimulatorProducts({
      shop,
      query: q,
      page,
      limit,
    });

    return res.json({
      success: true,
      data: result.products,
      pagination: result.pagination,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// GET /api/merchandising-simulator/baseline
export async function getBaseline(req, res) {
  try {
    const shop = getAuthenticatedShop(req);
    if (!shop) {
      return res.status(401).json({ success: false, message: "Store authentication required." });
    }

    const { startDate, endDate } = parseDateRange(req.query);
    const productId = req.query.productId || null;

    let productMeta = null;
    if (productId) {
      const prod = await Product.findOne({
        shop,
        shopifyProductId: productId,
      })
        .select("title handle images")
        .lean();
      if (prod) {
        productMeta = {
          id: productId,
          title: prod.title,
          handle: prod.handle,
          imageUrl: prod.images?.[0]?.url || null,
        };
      }
    }

    const baseline = await getVerifiedBaseline({
      shop,
      startDate,
      endDate,
      productId,
    });

    return res.json({
      success: true,
      data: {
        ...baseline,
        product: productMeta,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/merchandising-simulator/calculate
export async function calculateScenario(req, res) {
  try {
    const shop = getAuthenticatedShop(req);
    if (!shop) {
      return res.status(401).json({ success: false, message: "Store authentication required." });
    }

    const {
      name,
      startDate: rawStart,
      endDate: rawEnd,
      productId = null,
      target,
    } = req.body;

    const { startDate, endDate } = parseDateRange({
      startDate: rawStart,
      endDate: rawEnd,
    });

    const targetRate = Number(target?.targetRate);
    if (
      !target ||
      typeof targetRate !== "number" ||
      Number.isNaN(targetRate) ||
      targetRate <= 0 ||
      targetRate > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Target CTR must be a number greater than 0% and at most 100%.",
      });
    }

    // Server calculates verified historical baseline
    const verifiedBaseline = await getVerifiedBaseline({
      shop,
      startDate,
      endDate,
      productId,
    });

    if (verifiedBaseline.metrics.views === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot calculate scenario with zero product views. Scenario calculation requires a non-zero views baseline.",
        dataQuality: verifiedBaseline.dataQuality,
      });
    }

    if (!verifiedBaseline.dataQuality.isValid) {
      return res.status(400).json({
        success: false,
        message:
          verifiedBaseline.dataQuality.warning ||
          "Cannot calculate scenario on incompatible baseline data.",
        dataQuality: verifiedBaseline.dataQuality,
      });
    }

    // Pure mathematical projection calculation
    const comparison = calculateHypotheticalScenario({
      baseline: verifiedBaseline.metrics,
      target: {
        metric: "clickThroughRate",
        targetRate,
      },
      investigationType: "product_engagement",
    });

    let productMeta = null;
    if (productId) {
      const prod = await Product.findOne({ shop, shopifyProductId: productId })
        .select("title handle images")
        .lean();
      if (prod) {
        productMeta = {
          id: productId,
          title: prod.title,
          handle: prod.handle,
          imageUrl: prod.images?.[0]?.url || null,
        };
      }
    }

    return res.json({
      success: true,
      data: {
        name: String(name || "Hypothetical Scenario").trim().slice(0, 120),
        shop,
        investigationType: "product_engagement",
        scope: productId ? "product" : "store_wide",
        product: productMeta,
        dateRange: { startDate, endDate },
        target: {
          metric: "clickThroughRate",
          targetRate,
        },
        baseline: verifiedBaseline.metrics,
        comparison,
        dataQuality: verifiedBaseline.dataQuality,
        dataSource: verifiedBaseline.dataSource,
        storefrontChanged: false,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// POST /api/merchandising-simulator/scenarios
export async function saveScenario(req, res) {
  try {
    const shop = getAuthenticatedShop(req);
    if (!shop) {
      return res.status(401).json({ success: false, message: "Store authentication required." });
    }

    const {
      name,
      dateRange,
      productId = null,
      target,
    } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Scenario name is required.",
      });
    }

    const { startDate, endDate } = parseDateRange(dateRange);

    const targetRate = Number(target?.targetRate);
    if (
      !target ||
      typeof targetRate !== "number" ||
      Number.isNaN(targetRate) ||
      targetRate <= 0 ||
      targetRate > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Target CTR must be a number greater than 0% and at most 100%.",
      });
    }

    // Verify baseline on server to guarantee authenticity
    const verified = await getVerifiedBaseline({
      shop,
      startDate,
      endDate,
      productId,
    });

    if (verified.metrics.views === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot save scenario with zero product views.",
        dataQuality: verified.dataQuality,
      });
    }

    if (!verified.dataQuality.isValid) {
      return res.status(400).json({
        success: false,
        message:
          verified.dataQuality.warning ||
          "Cannot save scenario on incompatible baseline data.",
        dataQuality: verified.dataQuality,
      });
    }

    const comparison = calculateHypotheticalScenario({
      baseline: verified.metrics,
      target: {
        metric: "clickThroughRate",
        targetRate,
      },
      investigationType: "product_engagement",
    });

    let productMeta = null;
    if (productId) {
      const prod = await Product.findOne({ shop, shopifyProductId: productId })
        .select("title handle images")
        .lean();
      if (prod) {
        productMeta = {
          id: productId,
          title: prod.title,
          handle: prod.handle,
          imageUrl: prod.images?.[0]?.url || null,
        };
      }
    }

    const scenario = await MerchandisingScenario.create({
      shop,
      name: name.trim().slice(0, 120),
      investigationType: "product_engagement",
      scope: productId ? "product" : "store_wide",
      product: productMeta,
      dateRange: { startDate, endDate },
      target: {
        metric: "clickThroughRate",
        targetRate,
      },
      baseline: verified.metrics,
      comparison,
      formulaVersion: "v2_simplified_ctr",
      dataSource: "Verified Shopify Store Events (ShopLens Analytics)",
      dataQuality: verified.dataQuality,
    });

    return res.status(201).json({
      success: true,
      data: scenario,
      message: "Scenario saved. No storefront changes were made.",
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// GET /api/merchandising-simulator/scenarios
export async function listScenarios(req, res) {
  try {
    const shop = getAuthenticatedShop(req);
    if (!shop) {
      return res.status(401).json({ success: false, message: "Store authentication required." });
    }

    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const [scenarios, total] = await Promise.all([
      MerchandisingScenario.find({ shop })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MerchandisingScenario.countDocuments({ shop }),
    ]);

    return res.json({
      success: true,
      data: scenarios,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// GET /api/merchandising-simulator/scenarios/:id
export async function getScenario(req, res) {
  try {
    const shop = getAuthenticatedShop(req);
    if (!shop) {
      return res.status(401).json({ success: false, message: "Store authentication required." });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid scenario ID." });
    }

    const scenario = await MerchandisingScenario.findOne({
      _id: req.params.id,
      shop,
    }).lean();

    if (!scenario) {
      return res.status(404).json({ success: false, message: "Scenario not found." });
    }

    return res.json({ success: true, data: scenario });
  } catch (error) {
    return sendError(res, error);
  }
}

// DELETE /api/merchandising-simulator/scenarios/:id
export async function deleteScenario(req, res) {
  try {
    const shop = getAuthenticatedShop(req);
    if (!shop) {
      return res.status(401).json({ success: false, message: "Store authentication required." });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid scenario ID." });
    }

    const deleted = await MerchandisingScenario.findOneAndDelete({
      _id: req.params.id,
      shop,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Scenario not found." });
    }

    return res.json({
      success: true,
      message: "Scenario deleted. Storefront unchanged.",
    });
  } catch (error) {
    return sendError(res, error);
  }
}
