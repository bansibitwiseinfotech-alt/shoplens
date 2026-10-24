import test from "node:test";
import assert from "node:assert/strict";
import {
  isOutOfStock,
  isNewProduct,
  getProductMargin,
  calculateCollectionOrder,
  calculateCollectionPreview,
} from "../services/merchandisingRuleEngine.js";
import {
  validateRule,
  validateRuleUpdate,
} from "../validators/merchandisingRuleValidator.js";

test("Rule validation rejects invalid rule types, empty names, and empty collections", () => {
  const invalidType = validateRule({
    name: "My Rule",
    ruleType: "unsupported_type",
    collectionIds: ["gid://shopify/Collection/1"],
  });
  assert.ok(
    invalidType.some((err) => err.includes("Invalid rule type")),
    "Should reject invalid rule type"
  );

  const missingName = validateRule({
    name: "   ",
    ruleType: "out_of_stock",
    collectionIds: ["gid://shopify/Collection/1"],
  });
  assert.ok(
    missingName.includes("Rule name is required."),
    "Should require rule name"
  );

  const emptyCollections = validateRule({
    name: "Valid Name",
    ruleType: "out_of_stock",
    collectionIds: [],
  });
  assert.ok(
    emptyCollections.includes("Select at least one collection."),
    "Should require at least one collection"
  );

  const invalidPriority = validateRule({
    name: "Valid Name",
    ruleType: "out_of_stock",
    collectionIds: ["gid://shopify/Collection/1"],
    priority: 0,
  });
  assert.ok(
    invalidPriority.some((err) => err.includes("Priority must be an integer")),
    "Should require priority between 1 and 1000"
  );
});

test("Rule update validation rejects invalid update fields and empty updates", () => {
  const emptyUpdate = validateRuleUpdate({});
  assert.ok(
    emptyUpdate.includes("Provide at least one field to update."),
    "Should require at least one field"
  );

  const unsupportedFields = validateRuleUpdate({
    name: "New Name",
    unsupportedField: "malicious_value",
  });
  assert.ok(
    unsupportedFields.includes("Request contains unsupported fields."),
    "Should reject unsupported fields"
  );
});

test("Out-of-stock evaluation does not treat missing inventory as zero stock", () => {
  assert.equal(isOutOfStock({ inventory: 0 }), true);
  assert.equal(isOutOfStock({ inventory: -5 }), true);
  assert.equal(isOutOfStock({ inventory: 10 }), false);

  // Missing inventory MUST NOT be interpreted as zero stock
  assert.equal(isOutOfStock({ inventory: null }), false);
  assert.equal(isOutOfStock({ inventory: undefined }), false);
});

test("New product evaluation uses configurable threshold timestamp", () => {
  const now = Date.now();
  const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
  const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

  assert.equal(isNewProduct({ createdAt: fiveDaysAgo }, 30), true);
  assert.equal(isNewProduct({ createdAt: fortyDaysAgo }, 30), false);
  assert.equal(isNewProduct({ createdAt: fortyDaysAgo }, 60), true);
  assert.equal(isNewProduct({ createdAt: null }, 30), false);
});

test("High-margin evaluation excludes missing cost and does not assume zero cost", () => {
  // Valid cost and price
  assert.equal(getProductMargin({ price: 100, cost: 60 }), 40);
  assert.equal(
    getProductMargin({ price: 100, cost: 60 }, "percentage"),
    40
  );

  // Missing cost must NOT default to 0
  assert.equal(getProductMargin({ price: 100, cost: null }), null);
  assert.equal(getProductMargin({ price: 100, cost: undefined }), null);
  assert.equal(getProductMargin({ price: 100, cost: NaN }), null);
});

test("Rule engine moves out-of-stock products toward bottom and keeps unavailable items at bottom", () => {
  const products = [
    { id: "P1", title: "OOS Product", inventory: 0 },
    { id: "P2", title: "In Stock 1", inventory: 5 },
    { id: "P3", title: "Unknown Inventory", inventory: null }, // must not move to bottom
    { id: "P4", title: "In Stock 2", inventory: 12 },
  ];

  const rules = [
    {
      _id: "rule1",
      name: "Demote Out of Stock",
      ruleType: "out_of_stock",
      priority: 1,
      isActive: true,
    },
  ];

  const ordered = calculateCollectionOrder(products, rules);
  const orderedIds = ordered.map((p) => p.id);

  // P1 should be at the bottom; P3 (null inventory) should NOT be at bottom
  assert.deepEqual(orderedIds, ["P2", "P3", "P4", "P1"]);
});

test("Rule engine boosts new products in descending order of creation date", () => {
  const now = Date.now();
  const recent1 = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const recent2 = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
  const older = new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString();

  const products = [
    { id: "P1", title: "Old", createdAt: older },
    { id: "P2", title: "Newer", createdAt: recent2 },
    { id: "P3", title: "Newest", createdAt: recent1 },
  ];

  const rules = [
    {
      _id: "rule1",
      name: "Promote New",
      ruleType: "new_product",
      priority: 1,
      isActive: true,
      configuration: { newThresholdDays: 30 },
    },
  ];

  const ordered = calculateCollectionOrder(products, rules);
  const orderedIds = ordered.map((p) => p.id);

  assert.deepEqual(orderedIds, ["P3", "P2", "P1"]);
});

test("Rule engine best-seller rule uses real sales data and skips when sales data is missing", () => {
  const products = [
    { id: "P1", title: "Low Sales", salesCount: 2 },
    { id: "P2", title: "No Sales", salesCount: 0 },
    { id: "P3", title: "High Sales", salesCount: 25 },
  ];

  const rules = [
    {
      _id: "rule1",
      name: "Boost Best Sellers",
      ruleType: "best_seller",
      priority: 1,
      isActive: true,
    },
  ];

  // With sales data present
  const ordered = calculateCollectionOrder(products, rules, {
    hasOrdersInSystem: true,
    salesDataMissing: false,
  });
  const orderedIds = ordered.map((p) => p.id);
  assert.deepEqual(orderedIds, ["P3", "P1", "P2"]);

  // When sales data is missing, rule is skipped with warning, no fabricated rankings
  const skipped = calculateCollectionOrder(products, rules, {
    hasOrdersInSystem: false,
    salesDataMissing: true,
  });
  assert.deepEqual(skipped.map((p) => p.id), ["P1", "P2", "P3"]);
  assert.ok(
    skipped.warnings.some((w) => w.includes("sales data is missing")),
    "Should record actionable missing-sales warning"
  );
});

test("Rule engine high-margin rule prioritizes highest margin and reports missing cost warnings", () => {
  const products = [
    { id: "P1", title: "Low Margin", price: 100, cost: 90 }, // margin = 10
    { id: "P2", title: "Missing Cost", price: 50, cost: null }, // excluded
    { id: "P3", title: "High Margin", price: 200, cost: 50 }, // margin = 150
  ];

  const rules = [
    {
      _id: "rule1",
      name: "Prioritize Margin",
      ruleType: "high_margin",
      priority: 1,
      isActive: true,
      configuration: { marginMetric: "amount" },
    },
  ];

  const ordered = calculateCollectionOrder(products, rules);
  const orderedIds = ordered.map((p) => p.id);

  // P3 (margin 150) -> P1 (margin 10) -> P2 (missing cost remains without assuming zero)
  assert.deepEqual(orderedIds, ["P3", "P1", "P2"]);
  assert.ok(
    ordered.warnings.some((w) => w.includes("lacked valid cost data")),
    "Should report missing cost warning"
  );
});

test("Rule engine respects rule priority order and enforces final stock-safety", () => {
  const now = Date.now();
  const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const older = new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString();

  const products = [
    { id: "P1", title: "Old InStock", createdAt: older, inventory: 5, salesCount: 0 },
    { id: "P2", title: "New OutOfStock", createdAt: recent, inventory: 0, salesCount: 50 },
    { id: "P3", title: "New InStock", createdAt: recent, inventory: 8, salesCount: 10 },
  ];

  const rules = [
    // Priority 1: promote new products
    {
      _id: "rule_new",
      name: "New Products",
      ruleType: "new_product",
      priority: 1,
      isActive: true,
      configuration: { newThresholdDays: 30 },
    },
    // Priority 2: stock safety
    {
      _id: "rule_stock",
      name: "Out of Stock Safety",
      ruleType: "out_of_stock",
      priority: 2,
      isActive: true,
    },
  ];

  const ordered = calculateCollectionOrder(products, rules, { hasOrdersInSystem: true });
  const orderedIds = ordered.map((p) => p.id);

  // Even though P2 is "new" and has high sales, stock safety keeps P2 at the bottom!
  assert.equal(orderedIds[orderedIds.length - 1], "P2");
  assert.equal(orderedIds[0], "P3");
  assert.equal(ordered.length, products.length);
});

test("calculateCollectionPreview generates truthful reasons, position changes, and accurate counts", () => {
  const now = Date.now();
  const recentDate = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const oldDate = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

  const products = [
    {
      id: "P1",
      title: "Out-of-Stock Item",
      inventory: 0,
      createdAt: recentDate,
      price: 50,
      cost: 30,
      salesCount: 15,
    },
    {
      id: "P2",
      title: "Best Seller In Stock",
      inventory: 10,
      createdAt: oldDate,
      price: 100,
      cost: 60,
      salesCount: 40,
    },
    {
      id: "P3",
      title: "Normal In Stock",
      inventory: 5,
      createdAt: oldDate,
      price: 25,
      cost: 20,
      salesCount: 2,
    },
  ];

  // Test Out of Stock Preview
  const oosRule = {
    _id: "rule_oos",
    name: "Out of Stock to Bottom",
    ruleType: "out_of_stock",
    priority: 1,
    isActive: true,
  };

  const preview = calculateCollectionPreview(products, [oosRule]);

  assert.equal(preview.productsEvaluated, 3);
  assert.equal(preview.productsChanged, 3); // P1 moves #1 -> #3, P2 moves #2 -> #1, P3 moves #3 -> #2
  assert.equal(preview.productsUnchanged, 0);

  const p1Preview = preview.products.find((p) => p.productId === "P1");
  assert.equal(p1Preview.currentPosition, 1);
  assert.equal(p1Preview.previewPosition, 3);
  assert.equal(p1Preview.isChanged, true);
  assert.ok(
    p1Preview.reason.includes("Out of stock — moved to bottom"),
    "Should explain OOS reason"
  );

  // Test Best Seller Preview
  const bsRule = {
    _id: "rule_bs",
    name: "Boost Best Sellers",
    ruleType: "best_seller",
    priority: 1,
    isActive: true,
    configuration: { timeWindowDays: 30 },
  };

  const bsPreview = calculateCollectionPreview(products, [bsRule], {
    hasOrdersInSystem: true,
  });

  const p2Preview = bsPreview.products.find((p) => p.productId === "P2");
  assert.equal(p2Preview.previewPosition, 1);
  assert.ok(
    p2Preview.reason.includes("Higher paid sales"),
    "Should explain higher sales reason"
  );
  assert.ok(
    p2Preview.reason.includes("40 units sold"),
    "Should include actual sales count"
  );

  // Test High Margin Preview with missing cost
  const marginProducts = [
    { id: "M1", title: "Missing Cost", price: 100, cost: null, inventory: 5 },
    { id: "M2", title: "High Margin", price: 100, cost: 20, inventory: 5 }, // margin 80
  ];
  const hmRule = {
    _id: "rule_hm",
    name: "Prioritize Margin",
    ruleType: "high_margin",
    priority: 1,
    isActive: true,
    configuration: { marginMetric: "amount" },
  };

  const hmPreview = calculateCollectionPreview(marginProducts, [hmRule]);
  const m1Preview = hmPreview.products.find((p) => p.productId === "M1");
  const m2Preview = hmPreview.products.find((p) => p.productId === "M2");

  assert.ok(
    m1Preview.reason.includes("Missing cost data"),
    "Should explain missing cost exclusion"
  );
  assert.ok(
    m2Preview.reason.includes("High margin — promoted"),
    "Should explain high margin promotion"
  );
  assert.ok(
    hmPreview.warnings.some((w) => w.includes("lacked valid cost data")),
    "Should include warning"
  );
});

test("Preview calculation is strictly read-only and never modifies original products array", () => {
  const original = [
    { id: "A", title: "Item A", inventory: 0 },
    { id: "B", title: "Item B", inventory: 10 },
  ];
  const originalCopy = JSON.parse(JSON.stringify(original));

  const rule = {
    _id: "rule_1",
    name: "Test",
    ruleType: "out_of_stock",
    priority: 1,
    isActive: true,
  };

  calculateCollectionPreview(original, [rule]);

  // Original array ordering and elements must remain untouched
  assert.deepEqual(original, originalCopy);
});

