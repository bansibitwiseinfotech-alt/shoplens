import mongoose from "mongoose";
import MerchandisingRule from "../models/MerchandisingRule.js";
import {
  validateRule,
  validateRuleUpdate,
} from "../validators/merchandisingRuleValidator.js";
import {
  calculateCollectionOrder,
  calculateCollectionPreview,
} from "../services/merchandisingRuleEngine.js";
import {
  fetchShopCollections,
  fetchCollectionProducts,
  loadSalesDataForProducts,
  updateCollectionOrder,
} from "../services/shopifyMerchandisingService.js";

function getShop(req) {
  return req.store?.shop || req.shopDomain || req.shop;
}

function sendError(res, error) {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    message:
      error.expose || status < 500
        ? error.message
        : "Merchandising operation failed.",
  });
}

function getDefaultActionsForRuleType(ruleType, configuration = {}) {
  switch (ruleType) {
    case "out_of_stock":
      return [{ type: "move_to_bottom" }];
    case "new_product":
      return [{ type: "move_to_top" }];
    case "best_seller":
      return [{ type: "boost", amount: configuration.boostAmount || 10 }];
    case "high_margin":
      return [{ type: "boost", amount: configuration.boostAmount || 10 }];
    default:
      return [{ type: "boost", amount: 10 }];
  }
}

export async function listShopCollections(req, res) {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res
        .status(401)
        .json({ success: false, message: "Shop authentication required." });
    }

    const collections = await fetchShopCollections(shop, req.accessToken);
    return res.json({ success: true, data: collections });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listRules(req, res) {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res
        .status(401)
        .json({ success: false, message: "Shop authentication required." });
    }

    const rules = await MerchandisingRule.find({ shop })
      .sort({ priority: 1, createdAt: 1 })
      .lean();

    res.json({ success: true, data: rules });
  } catch (error) {
    sendError(res, error);
  }
}

export async function getOverview(req, res) {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res
        .status(401)
        .json({ success: false, message: "Shop authentication required." });
    }

    const [totalRules, activeRules, rules] = await Promise.all([
      MerchandisingRule.countDocuments({ shop }),
      MerchandisingRule.countDocuments({ shop, isActive: true }),
      MerchandisingRule.find({ shop, isActive: true })
        .select("collectionIds")
        .lean(),
    ]);

    const collectionsCovered = new Set(
      rules.flatMap((rule) => rule.collectionIds || [])
    ).size;

    const lastRun = await MerchandisingRule.findOne({
      shop,
      lastRunAt: { $ne: null },
      lastRunStatus: "success",
    })
      .sort({ lastRunAt: -1 })
      .select("lastRunAt")
      .lean();

    // Fallback to any run if no success run yet
    const anyLastRun = lastRun || (await MerchandisingRule.findOne({
      shop,
      lastRunAt: { $ne: null },
    })
      .sort({ lastRunAt: -1 })
      .select("lastRunAt")
      .lean());

    res.json({
      success: true,
      data: {
        totalRules,
        activeRules,
        collectionsCovered,
        lastApplied: anyLastRun?.lastRunAt ?? null,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}

export async function createRule(req, res) {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res
        .status(401)
        .json({ success: false, message: "Shop authentication required." });
    }

    const errors = validateRule(req.body);
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    const ruleType = req.body.ruleType || "custom";
    const configuration = req.body.configuration || {};
    let actions = req.body.actions;

    if (!Array.isArray(actions) || actions.length === 0) {
      actions = getDefaultActionsForRuleType(ruleType, configuration);
    }

    const rule = await MerchandisingRule.create({
      shop,
      name: req.body.name.trim(),
      description: req.body.description ?? "",
      ruleType,
      collectionIds: req.body.collectionIds,
      configuration,
      conditions: req.body.conditions ?? [],
      actions,
      priority: req.body.priority ?? 1,
      isActive: req.body.isActive ?? true,
    });

    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    sendError(res, error);
  }
}

export async function updateRule(req, res) {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res
        .status(401)
        .json({ success: false, message: "Shop authentication required." });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid rule ID." });
    }

    const errors = validateRuleUpdate(req.body);
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    if (
      req.body.name !== undefined &&
      (typeof req.body.name !== "string" || !req.body.name.trim())
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Rule name is required." });
    }

    const updatePayload = {
      ...req.body,
      ...(req.body.name !== undefined ? { name: req.body.name.trim() } : {}),
    };

    const rule = await MerchandisingRule.findOneAndUpdate(
      { _id: req.params.id, shop },
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    if (!rule) {
      return res
        .status(404)
        .json({ success: false, message: "Rule not found." });
    }

    res.json({ success: true, data: rule });
  } catch (error) {
    sendError(res, error);
  }
}

export async function deleteRule(req, res) {
  try {
    const shop = getShop(req);
    if (!shop) {
      return res
        .status(401)
        .json({ success: false, message: "Shop authentication required." });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid rule ID." });
    }

    const rule = await MerchandisingRule.findOneAndDelete({
      _id: req.params.id,
      shop,
    });

    if (!rule) {
      return res
        .status(404)
        .json({ success: false, message: "Rule not found." });
    }

    res.json({ success: true, message: "Rule deleted." });
  } catch (error) {
    sendError(res, error);
  }
}

export async function applyRules(req, res) {
  const shop = getShop(req);
  if (!shop) {
    return res
      .status(401)
      .json({ success: false, message: "Shop authentication required." });
  }

  const requestedCollectionId = req.body?.collectionId;
  let targetCollectionIds = [];

  try {
    if (requestedCollectionId && typeof requestedCollectionId === "string" && requestedCollectionId.trim() && requestedCollectionId !== "all") {
      targetCollectionIds = [requestedCollectionId.trim()];
    } else {
      // Apply to all collections covered by active rules
      const activeRules = await MerchandisingRule.find({ shop, isActive: true })
        .select("collectionIds")
        .lean();
      targetCollectionIds = [
        ...new Set(activeRules.flatMap((r) => r.collectionIds || [])),
      ];
    }

    if (targetCollectionIds.length === 0) {
      return res.json({
        success: true,
        message: "No active rules apply to any collections.",
        data: { collectionsProcessed: 0, productsChanged: 0, results: [] },
      });
    }

    const collectionResults = [];
    let totalProductsChanged = 0;

    for (const collectionId of targetCollectionIds) {
      const activeRules = await MerchandisingRule.find({
        shop,
        isActive: true,
        collectionIds: collectionId,
      }).sort({ priority: 1, createdAt: 1 });

      if (activeRules.length === 0) {
        collectionResults.push({
          collectionId,
          collectionTitle: collectionId,
          rulesApplied: 0,
          productsChanged: 0,
          success: true,
          message: "No active rules apply to this collection.",
        });
        continue;
      }

      try {
        const collection = await fetchCollectionProducts(
          shop,
          req.accessToken,
          collectionId
        );

        const productIds = collection.products.map((p) => p.id);

        // Load sales data for best-seller rules if any active rule is best_seller or uses sales
        const hasBestSellerRule = activeRules.some(
          (r) => r.ruleType === "best_seller" || r.conditions?.some((c) => c.field === "sales")
        );

        let salesInfo = { salesMap: new Map(), hasOrdersInSystem: true };
        if (hasBestSellerRule) {
          const maxWindow = Math.max(
            ...activeRules
              .filter((r) => r.ruleType === "best_seller")
              .map((r) => r.configuration?.timeWindowDays || 30),
            30
          );
          salesInfo = await loadSalesDataForProducts(shop, productIds, maxWindow);
        }

        // Attach sales counts to products
        const productsWithSales = collection.products.map((p) => ({
          ...p,
          salesCount: salesInfo.salesMap?.get(p.id) || 0,
        }));

        const ordered = calculateCollectionOrder(productsWithSales, activeRules, {
          hasOrdersInSystem: salesInfo.hasOrdersInSystem,
          salesDataMissing: !salesInfo.hasOrdersInSystem,
        });

        const warnings = ordered.warnings || [];
        const originalIds = collection.products.map((p) => p.id);
        const orderedIds = ordered.map((p) => p.id);

        const productsChanged = orderedIds.reduce(
          (count, id, index) => count + (id !== originalIds[index] ? 1 : 0),
          0
        );

        if (productsChanged > 0) {
          await updateCollectionOrder(
            shop,
            req.accessToken,
            collectionId,
            orderedIds,
            originalIds
          );
        }

        totalProductsChanged += productsChanged;
        const now = new Date();

        await Promise.all(
          activeRules.map((rule) =>
            MerchandisingRule.updateOne(
              { _id: rule._id, shop },
              {
                $set: {
                  lastRunAt: now,
                  lastRunStatus: "success",
                  lastRunMessage: productsChanged
                    ? `Shopify completed the reorder (${productsChanged} products moved).`
                    : "Collection already matches calculated order.",
                  lastRunProductsChanged: productsChanged,
                },
              }
            )
          )
        );

        collectionResults.push({
          collectionId,
          collectionTitle: collection.title,
          rulesApplied: activeRules.length,
          productsProcessed: collection.products.length,
          productsChanged,
          success: true,
          warnings,
          message: productsChanged
            ? `Shopify completed the reorder (${productsChanged} products repositioned).`
            : "Collection order already matches calculated order.",
        });
      } catch (collError) {
        const now = new Date();
        await Promise.all(
          activeRules.map((rule) =>
            MerchandisingRule.updateOne(
              { _id: rule._id, shop },
              {
                $set: {
                  lastRunAt: now,
                  lastRunStatus: "failed",
                  lastRunMessage: collError.message,
                },
              }
            ).catch(() => null)
          )
        );

        collectionResults.push({
          collectionId,
          collectionTitle: collectionId,
          rulesApplied: activeRules.length,
          productsChanged: 0,
          success: false,
          error: collError.message,
          message: collError.message,
        });
      }
    }

    const anyFailed = collectionResults.some((r) => !r.success);

    return res.json({
      success: !anyFailed,
      message: anyFailed
        ? "Some collection reorders failed."
        : totalProductsChanged > 0
          ? `Successfully applied rules across ${collectionResults.length} collection(s).`
          : "Rules evaluated successfully; collection orders already matched.",
      data: {
        collectionsProcessed: collectionResults.length,
        totalProductsChanged,
        results: collectionResults,
        // Legacy single-collection properties
        collectionId: requestedCollectionId || collectionResults[0]?.collectionId,
        collectionTitle: collectionResults[0]?.collectionTitle,
        rulesApplied: collectionResults[0]?.rulesApplied || 0,
        productsChanged: totalProductsChanged,
        verified: true,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function previewRule(req, res) {
  const shop = getShop(req);
  if (!shop) {
    return res
      .status(401)
      .json({ success: false, message: "Shop authentication required." });
  }

  try {
    let rule = req.body?.rule;
    const ruleId = req.body?.ruleId || req.params?.id;
    let targetCollectionId = req.body?.collectionId;

    if (ruleId && (!rule || !rule.collectionIds)) {
      if (!mongoose.isValidObjectId(ruleId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid rule ID." });
      }
      const savedRule = await MerchandisingRule.findOne({
        _id: ruleId,
        shop,
      }).lean();
      if (!savedRule) {
        return res
          .status(404)
          .json({ success: false, message: "Rule not found." });
      }
      rule = { ...savedRule, ...rule };
    }

    if (!rule || typeof rule !== "object") {
      return res
        .status(400)
        .json({ success: false, message: "Rule configuration is required." });
    }

    // Determine target collection ID
    if (!targetCollectionId) {
      if (Array.isArray(rule.collectionIds) && rule.collectionIds.length > 0) {
        targetCollectionId = rule.collectionIds[0];
      }
    }

    if (
      !targetCollectionId ||
      typeof targetCollectionId !== "string" ||
      !targetCollectionId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "A target collection ID is required to preview ordering.",
      });
    }

    // Fetch live products for target collection
    const collection = await fetchCollectionProducts(
      shop,
      req.accessToken,
      targetCollectionId
    );

    const productIds = collection.products.map((p) => p.id);

    // Determine preview rules:
    // mode === "combined": include other active rules for this collection
    // mode === "rule_only": preview this rule alone
    const mode = req.body?.mode || "rule_only";
    let previewRules = [rule];

    if (mode === "combined") {
      const otherActive = await MerchandisingRule.find({
        shop,
        isActive: true,
        collectionIds: targetCollectionId,
        ...(rule._id ? { _id: { $ne: rule._id } } : {}),
      }).lean();
      previewRules = [...otherActive, rule];
    }

    // Check if sales lookback data is needed
    const needsSales = previewRules.some(
      (r) =>
        r.ruleType === "best_seller" ||
        r.conditions?.some((c) => c.field === "sales")
    );

    let salesInfo = { salesMap: new Map(), hasOrdersInSystem: true };
    if (needsSales) {
      const maxWindow = Math.max(
        ...previewRules
          .filter((r) => r.ruleType === "best_seller")
          .map((r) => r.configuration?.timeWindowDays || 30),
        30
      );
      salesInfo = await loadSalesDataForProducts(shop, productIds, maxWindow);
    }

    const productsWithSales = collection.products.map((p) => ({
      ...p,
      salesCount: salesInfo.salesMap?.get(p.id) || 0,
    }));

    const previewResult = calculateCollectionPreview(
      productsWithSales,
      previewRules,
      {
        hasOrdersInSystem: salesInfo.hasOrdersInSystem,
        salesDataMissing: !salesInfo.hasOrdersInSystem,
      }
    );

    return res.json({
      success: true,
      data: {
        previewOnly: true,
        collectionId: targetCollectionId,
        collectionTitle: collection.title,
        ruleName: rule.name || "Preview Rule",
        ruleType: rule.ruleType || "custom",
        allTargetCollections: (rule.collectionIds || []).map((id) => ({
          id,
          title: id === targetCollectionId ? collection.title : id,
        })),
        mode,
        productsEvaluated: previewResult.productsEvaluated,
        productsChanged: previewResult.productsChanged,
        productsUnchanged: previewResult.productsUnchanged,
        warnings: previewResult.warnings || [],
        products: previewResult.products,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

