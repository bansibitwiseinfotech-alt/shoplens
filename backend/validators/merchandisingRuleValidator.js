const ALLOWED_RULE_TYPES = new Set([
  "best_seller",
  "new_product",
  "high_margin",
  "out_of_stock",
  "custom",
]);

const ALLOWED_FIELDS = new Set([
  "inventory",
  "sales",
  "createdAt",
  "price",
  "productType",
  "vendor",
  "tag",
]);

const ALLOWED_OPERATORS = new Set([
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "contains",
]);

const ALLOWED_ACTIONS = new Set([
  "boost",
  "demote",
  "move_to_top",
  "move_to_bottom",
]);

export function validateRule(input) {
  const errors = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ["Request body must be an object."];
  }

  if (typeof input.name !== "string" || !input.name.trim()) {
    errors.push("Rule name is required.");
  }

  if (input.ruleType !== undefined && !ALLOWED_RULE_TYPES.has(input.ruleType)) {
    errors.push(
      `Invalid rule type. Supported types: ${Array.from(ALLOWED_RULE_TYPES).join(", ")}.`
    );
  }

  if (!Array.isArray(input.collectionIds) || input.collectionIds.length === 0) {
    errors.push("Select at least one collection.");
  }

  if (
    Array.isArray(input.collectionIds) &&
    (input.collectionIds.length > 100 ||
      input.collectionIds.some(
        (id) => typeof id !== "string" || !id.trim()
      ) ||
      new Set(input.collectionIds).size !== input.collectionIds.length)
  ) {
    errors.push("Collection IDs must be unique, valid strings (maximum 100).");
  }

  if (
    input.priority !== undefined &&
    (!Number.isInteger(input.priority) ||
      input.priority < 1 ||
      input.priority > 1000)
  ) {
    errors.push("Priority must be an integer from 1 to 1000.");
  }

  if (input.configuration !== undefined) {
    if (typeof input.configuration !== "object" || Array.isArray(input.configuration) || input.configuration === null) {
      errors.push("Rule configuration must be an object.");
    } else {
      const cfg = input.configuration;
      if (
        cfg.timeWindowDays !== undefined &&
        (!Number.isInteger(cfg.timeWindowDays) || cfg.timeWindowDays < 1 || cfg.timeWindowDays > 365)
      ) {
        errors.push("timeWindowDays must be an integer between 1 and 365.");
      }
      if (
        cfg.newThresholdDays !== undefined &&
        (!Number.isInteger(cfg.newThresholdDays) || cfg.newThresholdDays < 1 || cfg.newThresholdDays > 365)
      ) {
        errors.push("newThresholdDays must be an integer between 1 and 365.");
      }
      if (
        cfg.marginMetric !== undefined &&
        !["amount", "percentage"].includes(cfg.marginMetric)
      ) {
        errors.push("marginMetric must be either 'amount' or 'percentage'.");
      }
      if (
        cfg.boostAmount !== undefined &&
        (!Number.isInteger(cfg.boostAmount) || cfg.boostAmount < 1 || cfg.boostAmount > 100)
      ) {
        errors.push("boostAmount must be an integer between 1 and 100.");
      }
    }
  }

  if (input.conditions !== undefined && !Array.isArray(input.conditions)) {
    errors.push("Conditions must be an array.");
  }

  if (Array.isArray(input.conditions)) {
    if (input.conditions.length > 20) {
      errors.push("A rule can have at most 20 conditions.");
    }

    for (const condition of input.conditions) {
      if (!condition || !ALLOWED_FIELDS.has(condition.field)) {
        errors.push("Invalid condition field.");
        continue;
      }

      if (!ALLOWED_OPERATORS.has(condition.operator)) {
        errors.push("Invalid condition operator.");
      }

      if (
        condition.value === undefined ||
        condition.value === null ||
        typeof condition.value === "object"
      ) {
        errors.push("Condition values must be simple values.");
      }
    }
  }

  if (input.actions !== undefined) {
    if (!Array.isArray(input.actions)) {
      errors.push("Actions must be an array.");
    } else {
      if (input.actions.length > 10) {
        errors.push("A rule can have at most 10 actions.");
      }

      for (const action of input.actions) {
        if (!action || !ALLOWED_ACTIONS.has(action.type)) {
          errors.push("Invalid merchandising action.");
          continue;
        }

        if (
          action.amount !== undefined &&
          (!Number.isFinite(action.amount) ||
            action.amount < 1 ||
            action.amount > 100)
        ) {
          errors.push("Action amount must be between 1 and 100.");
        }
      }
    }
  } else if (input.ruleType === "custom") {
    errors.push("At least one action is required for custom rules.");
  }

  if (
    input.isActive !== undefined &&
    typeof input.isActive !== "boolean"
  ) {
    errors.push("isActive must be true or false.");
  }

  return errors;
}

export function validateRuleUpdate(input) {
  const errors = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ["Request body must be an object."];
  }

  const allowed = new Set([
    "name",
    "description",
    "ruleType",
    "collectionIds",
    "configuration",
    "conditions",
    "actions",
    "priority",
    "isActive",
  ]);

  const keys = Object.keys(input);

  if (!keys.length) errors.push("Provide at least one field to update.");

  if (keys.some((key) => !allowed.has(key))) {
    errors.push("Request contains unsupported fields.");
  }

  if (input.ruleType !== undefined && !ALLOWED_RULE_TYPES.has(input.ruleType)) {
    errors.push(
      `Invalid rule type. Supported types: ${Array.from(ALLOWED_RULE_TYPES).join(", ")}.`
    );
  }

  if (
    input.priority !== undefined &&
    (!Number.isInteger(input.priority) ||
      input.priority < 1 ||
      input.priority > 1000)
  ) {
    errors.push("Priority must be an integer from 1 to 1000.");
  }

  if (
    input.collectionIds !== undefined &&
    (!Array.isArray(input.collectionIds) ||
      input.collectionIds.length === 0 ||
      input.collectionIds.some((id) => typeof id !== "string" || !id.trim()))
  ) {
    errors.push("Select at least one valid collection.");
  }

  return errors;
}
