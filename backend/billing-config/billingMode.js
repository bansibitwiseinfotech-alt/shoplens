
const FORCE_TEST_MODE = true;

/**
 * Standard billing modes supported by ShopLens
 */
export const BILLING_MODES = Object.freeze({
  TEST: "test",
  LIVE: "live",
});

/**
 * Determines whether Shopify test billing mode is currently active.
 *
 * Priority order:
 * 1. Environment variable `SHOPIFY_BILLING_TEST` (if explicitly provided as "true" or "false")
 * 2. Master toggle constant `FORCE_TEST_MODE`
 * 3. Fallback: non-production environments default to test mode for safety
 *
 * @returns {boolean} true if test billing is enabled, false for live production billing
 */
export const isTestBilling = () => {
  // 1. Explicit env flag override (if defined)
  const envFlag = process.env.SHOPIFY_BILLING_TEST;
  if (typeof envFlag === "string" && envFlag.trim() !== "") {
    const normalized = envFlag.toLowerCase().trim();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }

  // 2. Master toggle defined at the top of this file
  if (typeof FORCE_TEST_MODE === "boolean") {
    return FORCE_TEST_MODE;
  }

  // 3. Fail-safe fallback: non-production NODE_ENV is always test mode
  const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();
  return nodeEnv !== "production";
};

/**
 * Convenience helper to check if live production billing is currently active.
 *
 * @returns {boolean} true if live production charges are active, false otherwise
 */
export const isLiveBilling = () => {
  return !isTestBilling();
};

/**
 * Returns the current billing mode identifier ('test' or 'live').
 *
 * @returns {'test' | 'live'} Current billing mode
 */
export const getBillingMode = () => {
  return isTestBilling() ? BILLING_MODES.TEST : BILLING_MODES.LIVE;
};

/**
 * Returns detailed telemetry and diagnostic information about the billing configuration.
 *
 * @returns {object} Status object containing mode, safety flags, and environment details
 */
export const getBillingModeDetails = () => {
  const isTest = isTestBilling();
  const nodeEnv = process.env.NODE_ENV || "development";
  const envTestFlag = process.env.SHOPIFY_BILLING_TEST ?? "not set";

  return {
    mode: isTest ? BILLING_MODES.TEST : BILLING_MODES.LIVE,
    isTest,
    isLive: !isTest,
    nodeEnv,
    envTestFlag,
    hardcodedToggle: FORCE_TEST_MODE,
    description: isTest
      ? "Shopify Test Billing Mode is ACTIVE. Merchants will NOT be charged actual funds."
      : "LIVE PRODUCTION BILLING is ACTIVE. Real charges will be billed to merchant Shopify accounts.",
    safetyNotice: isTest
      ? "Safe for sandbox testing and development approval flows."
      : "CAUTION: Real financial transactions will occur.",
  };
};

export default isTestBilling;
