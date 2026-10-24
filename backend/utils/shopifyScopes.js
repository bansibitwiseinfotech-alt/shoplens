export const SYNC_REQUIRED_SHOPIFY_SCOPES = [
  "read_products",
  "read_inventory",
  "read_orders",
];

export const APP_REQUIRED_SHOPIFY_SCOPES = [
  ...SYNC_REQUIRED_SHOPIFY_SCOPES,
  "write_products",
];

export const parseShopifyScopes = (scopeValue) => {
  if (typeof scopeValue !== "string") {
    return [];
  }

  return [
    ...new Set(
      scopeValue
        .split(/[,\s]+/)
        .map((scope) => scope.trim())
        .filter(Boolean)
    ),
  ];
};

export const getMissingShopifyScopes = (scopeValue, requiredScopes) => {
  const grantedScopes = new Set(parseShopifyScopes(scopeValue));

  return requiredScopes.filter(
    (scope) =>
      !grantedScopes.has(scope) &&
      !(scope === "read_products" && grantedScopes.has("write_products"))
  );
};
