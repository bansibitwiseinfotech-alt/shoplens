/**
 * ShopLens Smart Merchandising Rule Engine
 *
 * Combination Strategy:
 * 1. Active rules are sorted by ascending priority (1, 2, 3...).
 * 2. Ties in priority are resolved deterministically using rule IDs.
 * 3. Rules are evaluated sequentially:
 *    - Higher-priority rules position matching products first.
 *    - Subsequent rules refine the ordering within their boundaries.
 *    - Relative ordering of products with equal scores or un-targeted products is strictly preserved (stable sorting).
 * 4. Missing data protections:
 *    - Missing inventory is NEVER assumed to be 0 (in-stock status preserved).
 *    - Missing product cost is NEVER assumed to be 0 (excluded from margin ranking, reported as warning).
 *    - Missing sales data is NEVER fabricated (reported as actionable error/warning).
 * 5. Final Stock Safety Rule:
 *    - When an out-of-stock rule is active, out-of-stock products are guaranteed to remain
 *      at the bottom of the collection as the final step.
 */

export function isOutOfStock(product) {
  // Missing inventory must NOT be interpreted as zero stock.
  if (product.inventory === null || product.inventory === undefined) {
    return false;
  }
  return Number(product.inventory) <= 0;
}

export function isNewProduct(product, thresholdDays = 30) {
  if (!product.createdAt) return false;
  const createdTime = new Date(product.createdAt).getTime();
  if (Number.isNaN(createdTime)) return false;

  const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000;
  return createdTime >= cutoff;
}

export function getProductMargin(product, metric = "amount") {
  // If cost or price is missing, exclude from calculation; do not assume 0 cost.
  if (
    product.cost === null ||
    product.cost === undefined ||
    Number.isNaN(Number(product.cost))
  ) {
    return null;
  }
  if (
    product.price === null ||
    product.price === undefined ||
    Number.isNaN(Number(product.price))
  ) {
    return null;
  }

  const price = Number(product.price);
  const cost = Number(product.cost);

  if (metric === "percentage") {
    if (price <= 0) return null;
    return ((price - cost) / price) * 100;
  }

  return price - cost;
}

export function matchesCondition(product, condition) {
  const actual = product[condition.field];
  if (actual === undefined || actual === null) return false;

  const expected = condition.value;

  switch (condition.operator) {
    case "equals":
      return String(actual).toLowerCase() === String(expected).toLowerCase();

    case "not_equals":
      return String(actual).toLowerCase() !== String(expected).toLowerCase();

    case "greater_than":
      return (
        Number.isFinite(Number(actual)) &&
        Number.isFinite(Number(expected)) &&
        Number(actual) > Number(expected)
      );

    case "less_than":
      return (
        Number.isFinite(Number(actual)) &&
        Number.isFinite(Number(expected)) &&
        Number(actual) < Number(expected)
      );

    case "contains":
      if (Array.isArray(actual)) {
        return actual.some((item) =>
          String(item).toLowerCase().includes(String(expected).toLowerCase())
        );
      }
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());

    default:
      return false;
  }
}

export function matchesRule(product, rule) {
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    return true;
  }
  return rule.conditions.every((condition) => matchesCondition(product, condition));
}

function applyAction(products, rule, action) {
  const matching = products.filter((product) => matchesRule(product, rule));
  const matchingIds = new Set(matching.map((product) => product.id));
  const others = products.filter((product) => !matchingIds.has(product.id));

  switch (action.type) {
    case "move_to_top":
      return [...matching, ...others];

    case "move_to_bottom":
      return [...others, ...matching];

    case "boost": {
      const amount = Math.max(1, Math.min(100, action.amount ?? 10));
      const result = [...products];

      matching.forEach((product) => {
        const index = result.findIndex((item) => item.id === product.id);
        if (index < 0) return;
        const [item] = result.splice(index, 1);
        result.splice(Math.max(0, index - amount), 0, item);
      });

      return result;
    }

    case "demote": {
      const amount = Math.max(1, Math.min(100, action.amount ?? 10));
      const result = [...products];

      matching.forEach((product) => {
        const index = result.findIndex((item) => item.id === product.id);
        if (index < 0) return;
        const [item] = result.splice(index, 1);
        result.splice(Math.min(result.length, index + amount), 0, item);
      });

      return result;
    }

    default:
      throw new Error(`Unsupported action: ${action.type}`);
  }
}

/**
 * Evaluates active merchandising rules and produces the new product ordering.
 *
 * @param {Array} products - List of products with inventory, createdAt, price, cost, salesCount, etc.
 * @param {Array} rules - Active merchandising rules
 * @param {Object} options - { hasOrdersInSystem, salesDataMissing }
 * @returns {Array} orderedProducts - Reordered array of products (or object with orderedProducts and warnings)
 */
export function calculateCollectionOrder(products, rules, options = {}) {
  const originalIds = products.map((product) => product.id);

  if (new Set(originalIds).size !== originalIds.length) {
    throw new Error("Duplicate products detected in collection order.");
  }

  let ordered = [...products];
  const warnings = [];

  const activeRules = [...rules]
    .filter((rule) => rule.isActive)
    .sort(
      (a, b) =>
        (a.priority ?? 1) - (b.priority ?? 1) ||
        String(a._id || "").localeCompare(String(b._id || ""))
    );

  let hasStockSafetyRule = false;

  for (const rule of activeRules) {
    const ruleType = rule.ruleType || "custom";

    if (ruleType === "out_of_stock") {
      hasStockSafetyRule = true;
      const inStock = ordered.filter((p) => !isOutOfStock(p));
      const outOfStock = ordered.filter((p) => isOutOfStock(p));
      ordered = [...inStock, ...outOfStock];
      continue;
    }

    if (ruleType === "new_product") {
      const thresholdDays = rule.configuration?.newThresholdDays ?? 30;
      const newItems = ordered
        .filter((p) => isNewProduct(p, thresholdDays))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const newIds = new Set(newItems.map((p) => p.id));
      const olderItems = ordered.filter((p) => !newIds.has(p.id));

      ordered = [...newItems, ...olderItems];
      continue;
    }

    if (ruleType === "best_seller") {
      if (options.salesDataMissing || options.hasOrdersInSystem === false) {
        warnings.push(
          `Best-seller rule "${rule.name}" was skipped: store sales data is missing or incomplete.`
        );
        continue;
      }

      const withSales = ordered
        .filter((p) => (Number(p.salesCount) || 0) > 0)
        .sort((a, b) => {
          const diff = (Number(b.salesCount) || 0) - (Number(a.salesCount) || 0);
          if (diff !== 0) return diff;
          return ordered.indexOf(a) - ordered.indexOf(b); // stable tie-breaker
        });

      const withSalesIds = new Set(withSales.map((p) => p.id));
      const withoutSales = ordered.filter((p) => !withSalesIds.has(p.id));

      ordered = [...withSales, ...withoutSales];
      continue;
    }

    if (ruleType === "high_margin") {
      const metric = rule.configuration?.marginMetric || "amount";
      const missingCostCount = ordered.filter(
        (p) => getProductMargin(p, metric) === null
      ).length;

      if (missingCostCount > 0) {
        warnings.push(
          `High-margin rule "${rule.name}": ${missingCostCount} product(s) lacked valid cost data and were excluded from margin ranking.`
        );
      }

      const withMargin = ordered
        .filter((p) => {
          const m = getProductMargin(p, metric);
          return m !== null && m > 0;
        })
        .sort((a, b) => {
          const diff = getProductMargin(b, metric) - getProductMargin(a, metric);
          if (diff !== 0) return diff;
          return ordered.indexOf(a) - ordered.indexOf(b);
        });

      const withMarginIds = new Set(withMargin.map((p) => p.id));
      const others = ordered.filter((p) => !withMarginIds.has(p.id));

      ordered = [...withMargin, ...others];
      continue;
    }

    // Custom or condition/action based rule
    if (Array.isArray(rule.actions) && rule.actions.length > 0) {
      for (const action of rule.actions) {
        ordered = applyAction(ordered, rule, action);
        if (action.type === "move_to_bottom" || action.type === "demote") {
          hasStockSafetyRule = true;
        }
      }
    }
  }

  // Stock-safety enforcement: keep unavailable products at the bottom
  if (hasStockSafetyRule) {
    const inStock = ordered.filter((p) => !isOutOfStock(p));
    const outOfStock = ordered.filter((p) => isOutOfStock(p));
    ordered = [...inStock, ...outOfStock];
  }

  // Invariant verification: a rule must NEVER add or remove products.
  if (
    ordered.length !== products.length ||
    new Set(ordered.map((product) => product.id)).size !== originalIds.length ||
    originalIds.some((id) => !ordered.some((product) => product.id === id))
  ) {
    throw new Error("Rule engine produced an invalid product order.");
  }

  // Attach warnings as non-enumerable property so caller can inspect, while maintaining array identity
  ordered.warnings = warnings;

  return ordered;
}

export function generateProductReason(
  product,
  originalIndex,
  newIndex,
  primaryRule,
  activeRules = []
) {
  const currentPos = originalIndex + 1;
  const previewPos = newIndex + 1;
  const moved = currentPos !== previewPos;

  const rule = primaryRule || activeRules[0] || {};
  const ruleType = rule.ruleType || "custom";

  // Check if out of stock
  if (isOutOfStock(product)) {
    return `Out of stock — moved to bottom (${product.inventory === 0 ? "0 in stock" : `${product.inventory} inventory`})`;
  }

  if (ruleType === "out_of_stock") {
    if (moved) {
      return `Promoted to #${previewPos} as out-of-stock items moved down`;
    }
    return `Position unchanged — in stock (${product.inventory} available)`;
  }

  if (ruleType === "new_product") {
    const thresholdDays = rule.configuration?.newThresholdDays ?? 30;
    if (isNewProduct(product, thresholdDays)) {
      const createdDate = product.createdAt
        ? new Date(product.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "recently";
      return `New product — promoted (created ${createdDate})`;
    }
    if (moved) {
      return `Shifted to #${previewPos} behind newer products`;
    }
    return `Position unchanged — older than ${thresholdDays} days`;
  }

  if (ruleType === "best_seller") {
    const sales = Number(product.salesCount) || 0;
    const windowDays = rule.configuration?.timeWindowDays ?? 30;
    if (sales > 0) {
      return `Higher paid sales — ranked higher (${sales} unit${sales === 1 ? "" : "s"} sold in last ${windowDays}d)`;
    }
    if (moved) {
      return `Shifted to #${previewPos} behind top sellers`;
    }
    return `Position unchanged — no paid sales in last ${windowDays} days`;
  }

  if (ruleType === "high_margin") {
    const metric = rule.configuration?.marginMetric || "amount";
    const margin = getProductMargin(product, metric);
    if (margin === null) {
      return "Missing cost data — excluded from margin ranking";
    }
    if (margin > 0) {
      const marginFormatted =
        metric === "percentage"
          ? `${margin.toFixed(1)}% margin`
          : `$${margin.toFixed(2)} margin`;
      return `High margin — promoted (${marginFormatted})`;
    }
    if (moved) {
      return `Shifted to #${previewPos} behind higher-margin items`;
    }
    return "Position unchanged — zero or negative margin";
  }

  // Custom rule
  if (moved) {
    return previewPos < currentPos
      ? `Promoted by rule action (#${currentPos} → #${previewPos})`
      : `Demoted by rule action (#${currentPos} → #${previewPos})`;
  }

  return "Position unchanged — rule did not affect this product";
}

export function calculateCollectionPreview(
  products,
  rules,
  options = {}
) {
  const ordered = calculateCollectionOrder(products, rules, options);
  const warnings = ordered.warnings || [];
  const primaryRule = rules.length === 1 ? rules[0] : null;

  const originalMap = new Map();
  products.forEach((p, idx) => originalMap.set(p.id, idx));

  let productsChanged = 0;
  let productsUnchanged = 0;

  const comparison = ordered.map((product, newIndex) => {
    const originalIndex = originalMap.get(product.id);
    const currentPosition = originalIndex + 1;
    const previewPosition = newIndex + 1;
    const isChanged = currentPosition !== previewPosition;

    if (isChanged) {
      productsChanged += 1;
    } else {
      productsUnchanged += 1;
    }

    const reason = generateProductReason(
      product,
      originalIndex,
      newIndex,
      primaryRule,
      rules
    );

    return {
      productId: product.id,
      title: product.title,
      imageUrl: product.imageUrl || null,
      imageAlt: product.imageAlt || null,
      currentPosition,
      previewPosition,
      isChanged,
      positionChange: currentPosition - previewPosition, // positive means promoted upward
      inventory: product.inventory,
      price: product.price,
      cost: product.cost,
      salesCount: product.salesCount || 0,
      createdAt: product.createdAt,
      reason,
    };
  });

  return {
    productsEvaluated: products.length,
    productsChanged,
    productsUnchanged,
    warnings,
    products: comparison,
  };
}

