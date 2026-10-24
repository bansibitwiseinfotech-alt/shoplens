import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  DataTable,
  Divider,
  EmptyState,
  IndexTable,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Pagination,
  Spinner,
  Text,
  TextField,
  Thumbnail,
  useBreakpoints,
} from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import {
  calculateSimulatorScenario,
  deleteSimulatorScenario,
  getSimulatorBaseline,
  getSimulatorProducts,
  listSimulatorScenarios,
  saveSimulatorScenario,
} from "../services/merchandisingSimulatorApi.js";
import PlanUpgradeGate from "../components/billing/PlanUpgradeGate.jsx";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

function formatDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

function formatPercent(val) {
  if (val == null || Number.isNaN(Number(val))) return "N/A";
  return `${Number(val).toFixed(2)}%`;
}

function formatClicksDiff(val) {
  if (val == null || Number.isNaN(Number(val))) return "—";
  const num = Number(val);
  if (num > 0) return `+${num.toLocaleString()} clicks (increase)`;
  if (num < 0) return `${num.toLocaleString()} clicks (decrease)`;
  return "0 clicks (no change)";
}

export default function MerchandisingSimulator() {
  const { shop } = useLoaderData();
  const { smDown } = useBreakpoints();

  // Section 1: Investigation Setup state
  const [scope, setScope] = useState("store_wide");
  const [selectedProduct, setSelectedProduct] = useState(null);

  const defaultDates = useMemo(() => {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  }, []);

  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);

  // Section 2: Baseline data state
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState("");
  const [baselineData, setBaselineData] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(null);

  // Section 3: Scenario configuration state
  const [scenarioName, setScenarioName] = useState("Hypothetical Engagement Boost");
  const [targetRate, setTargetRate] = useState("10");
  const [calculating, setCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState(null);

  // Section 5: Saved scenarios state
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [scenarioPage, setScenarioPage] = useState(1);
  const [scenarioPagination, setScenarioPagination] = useState({ pages: 1, total: 0 });
  const [saving, setSaving] = useState(false);
  const [viewingScenario, setViewingScenario] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Product Picker Modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerProducts, setPickerProducts] = useState([]);
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerPagination, setPickerPagination] = useState({ pages: 1, total: 0 });

  // Notifications
  const [feedback, setFeedback] = useState(null);

  // Load verified historical baseline
  const loadBaseline = useCallback(async () => {
    if (!shop || !startDate || !endDate) return;
    if (scope === "product" && !selectedProduct) {
      setBaselineData(null);
      setBaselineLoading(false);
      return;
    }
    setBaselineLoading(true);
    setBaselineError("");
    setCalculationResult(null);

    try {
      const data = await getSimulatorBaseline(shop, {
        startDate,
        endDate,
        productId: scope === "product" ? selectedProduct?.id : null,
      });
      setBaselineData(data);
    } catch (err) {
      if (
        err.status === 403 ||
        err.response?.code === "UPGRADE_REQUIRED" ||
        err.message?.includes("not included in the") ||
        err.message?.includes("Upgrade to")
      ) {
        setUpgradeRequired(err.response?.requiredPlan || "premium");
      } else {
        setBaselineError(err.message || "Failed to load verified historical baseline.");
      }
      setBaselineData(null);
    } finally {
      setBaselineLoading(false);
    }
  }, [shop, startDate, endDate, scope, selectedProduct]);

  // Load saved scenarios
  const loadSavedScenarios = useCallback(
    async (page = 1) => {
      if (!shop) return;
      setScenariosLoading(true);
      try {
        const result = await listSimulatorScenarios(shop, { page, limit: 10 });
        setSavedScenarios(result.scenarios);
        setScenarioPagination(result.pagination);
        setScenarioPage(page);
      } catch (err) {
        console.error("Failed to load saved scenarios:", err);
      } finally {
        setScenariosLoading(false);
      }
    },
    [shop]
  );

  // Load products for picker modal
  const loadPickerProducts = useCallback(
    async (q = "", page = 1) => {
      if (!shop) return;
      setPickerLoading(true);
      try {
        const result = await getSimulatorProducts(shop, { q, page, limit: 8 });
        setPickerProducts(result.products);
        setPickerPagination(result.pagination);
        setPickerPage(page);
      } catch (err) {
        console.error("Failed to load products for picker:", err);
      } finally {
        setPickerLoading(false);
      }
    },
    [shop]
  );

  useEffect(() => {
    loadBaseline();
  }, [loadBaseline]);

  useEffect(() => {
    loadSavedScenarios(1);
  }, [loadSavedScenarios]);

  // Quick date presets
  const applyDatePreset = (days) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  // Run calculation
  const handleCalculate = async () => {
    if (!shop) return;
    setCalculating(true);
    setCalculationResult(null);
    setFeedback(null);

    try {
      const payload = {
        name: scenarioName,
        investigationType: "product_engagement",
        startDate,
        endDate,
        productId: scope === "product" ? selectedProduct?.id : null,
        target: {
          metric: "clickThroughRate",
          targetRate: Number(targetRate),
        },
      };

      const result = await calculateSimulatorScenario(shop, payload);
      setCalculationResult(result);
      setFeedback({
        tone: "success",
        title: "Scenario calculated successfully",
        message: "Calculated what-if CTR comparison. Your live storefront remains completely unchanged.",
      });
    } catch (err) {
      setFeedback({
        tone: "critical",
        title: "Simulation failed",
        message: err.message || "Could not calculate hypothetical scenario.",
      });
    } finally {
      setCalculating(false);
    }
  };

  // Save scenario snapshot
  const handleSaveScenario = async () => {
    if (!shop || !calculationResult) return;
    setSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: scenarioName,
        investigationType: "product_engagement",
        dateRange: { startDate, endDate },
        productId: scope === "product" ? selectedProduct?.id : null,
        target: calculationResult.target,
      };

      await saveSimulatorScenario(shop, payload);
      setFeedback({
        tone: "success",
        title: "Scenario snapshot saved",
        message: `Saved snapshot "${scenarioName}". Historical baseline and hypothetical estimates are preserved immutably.`,
      });
      await loadSavedScenarios(1);
    } catch (err) {
      setFeedback({
        tone: "critical",
        title: "Failed to save scenario",
        message: err.message || "Could not persist scenario snapshot.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete scenario
  const handleDeleteScenario = async (id) => {
    if (!shop || !id) return;
    if (!window.confirm("Delete this saved scenario snapshot? This action cannot be undone.")) {
      return;
    }

    setDeletingId(id);
    setFeedback(null);

    try {
      await deleteSimulatorScenario(shop, id);
      setFeedback({
        tone: "success",
        title: "Scenario deleted",
        message: "Saved snapshot removed from database.",
      });
      await loadSavedScenarios(scenarioPage);
      if (viewingScenario?._id === id) setViewingScenario(null);
    } catch (err) {
      setFeedback({
        tone: "critical",
        title: "Could not delete scenario",
        message: err.message || "Failed to remove scenario.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const metrics = baselineData?.metrics;
  const comparison = calculationResult?.comparison;
  const isBaselineValid = Boolean(
    baselineData &&
    baselineData.dataQuality?.isValid &&
    metrics?.views > 0 &&
    metrics?.clicks <= metrics?.views
  );

  if (upgradeRequired) {
    return (
      <Page
        title="Merchandising Simulator"
        subtitle="What-If Investigation Lab: Test target Click-Through Rates (CTR) against your store's verified historical baseline."
        fullWidth
      >
        <PlanUpgradeGate
          plan={upgradeRequired}
          title="Premium Feature"
          description="Upgrade to Premium to unlock this feature."
        />
      </Page>
    );
  }

  return (
    <Page fullWidth>
      <Box
        paddingInline={{ xs: "300", sm: "400", md: "600" }}
        paddingBlockStart={{ xs: "300", sm: "400" }}
        paddingBlockEnd={{ xs: "400", sm: "500" }}
      >
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          {/* Header */}
          <BlockStack gap="050">
            <Text as="h1" variant="headingLg" fontWeight="bold">
              Merchandising Simulator
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              What-If Investigation Lab: Test target Click-Through Rates (CTR) against your store&apos;s verified historical baseline.
            </Text>
          </BlockStack>

          <Banner tone="info" title="Simulation Lab Only">
            <p>
              <strong>Read-Only What-If Analysis:</strong> The simulator projects potential outcomes
              using verified historical metrics. It does <strong>not</strong> reorder collections,
              alter live merchandising rules, or modify Shopify products.
            </p>
          </Banner>

          {feedback && (
            <Banner
              tone={feedback.tone}
              title={feedback.title}
              onDismiss={() => setFeedback(null)}
            >
              <p>{feedback.message}</p>
            </Banner>
          )}

          <InlineGrid columns={{ xs: 1, md: "7fr 3fr" }} gap="400">
            {/* LEFT COLUMN (70% width): Section 1, Section 2, Section 3 */}
            <BlockStack gap="400">
              {/* SECTION 1: INVESTIGATION SETUP */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Section 1: Investigation Setup
                    </Text>
                    <Badge tone="info">Product Engagement</Badge>
                  </InlineStack>

                  <BlockStack gap="200">
                    <Text as="p" fontWeight="semibold">
                      Investigation Scope
                    </Text>
                    <ButtonGroup variant="segmented" fullWidth={smDown}>
                      <Button
                        pressed={scope === "store_wide"}
                        onClick={() => {
                          setScope("store_wide");
                          setSelectedProduct(null);
                        }}
                      >
                        Entire Store
                      </Button>
                      <Button
                        pressed={scope === "product"}
                        onClick={() => {
                          setScope("product");
                          if (!selectedProduct) {
                            setPickerOpen(true);
                            loadPickerProducts("", 1);
                          }
                        }}
                      >
                        One Product
                      </Button>
                    </ButtonGroup>
                  </BlockStack>

                {/* Product selector appears when One Product is selected */}
                {scope === "product" && (
                  <Box
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                    borderWidth="025"
                    borderColor="border-subdued"
                  >
                    {selectedProduct ? (
                      <InlineStack align="space-between" blockAlign="center" wrap>
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            source={selectedProduct.imageUrl || ""}
                            alt={selectedProduct.title}
                            size="medium"
                          />
                          <BlockStack gap="050">
                            <Text as="p" fontWeight="bold">
                              {selectedProduct.title}
                            </Text>
                            <InlineStack gap="200">
                              {selectedProduct.price != null && (
                                <Badge tone="info">{`$${selectedProduct.price}`}</Badge>
                              )}
                              <Badge
                                tone={selectedProduct.inventory > 0 ? "success" : "critical"}
                              >
                                {selectedProduct.inventory > 0
                                  ? `${selectedProduct.inventory} in stock`
                                  : "Out of stock"}
                              </Badge>
                            </InlineStack>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="200">
                          <Button
                            onClick={() => {
                              setPickerOpen(true);
                              loadPickerProducts("", 1);
                            }}
                          >
                            Change product
                          </Button>
                          <Button
                            tone="critical"
                            variant="plain"
                            onClick={() => {
                              setSelectedProduct(null);
                              setScope("store_wide");
                            }}
                          >
                            Clear
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    ) : (
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" tone="subdued">
                          No product chosen. Click to select a synced Shopify product.
                        </Text>
                        <Button
                          variant="primary"
                          onClick={() => {
                            setPickerOpen(true);
                            loadPickerProducts("", 1);
                          }}
                        >
                          Select Product
                        </Button>
                      </InlineStack>
                    )}
                  </Box>
                )}

                <Divider />

                {/* Date Range: Last 14 Days / Last 30 Days / Last 60 Days / Custom Date Range */}
                <BlockStack gap="200">
                  <Text as="p" fontWeight="semibold">
                    Date Range
                  </Text>
                  <ButtonGroup variant="segmented" fullWidth={smDown}>
                    <Button size="slim" onClick={() => applyDatePreset(14)}>
                      Last 14 Days
                    </Button>
                    <Button size="slim" onClick={() => applyDatePreset(30)}>
                      Last 30 Days
                    </Button>
                    <Button size="slim" onClick={() => applyDatePreset(60)}>
                      Last 60 Days
                    </Button>
                  </ButtonGroup>

                  <BlockStack gap="200">
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                      <TextField
                        label="Start Date"
                        type="date"
                        value={startDate}
                        onChange={setStartDate}
                        autoComplete="off"
                      />
                      <TextField
                        label="End Date"
                        type="date"
                        value={endDate}
                        onChange={setEndDate}
                        autoComplete="off"
                      />
                    </InlineGrid>
                    <Button
                      onClick={loadBaseline}
                      loading={baselineLoading}
                      fullWidth={smDown}
                    >
                      Refresh Baseline
                    </Button>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* SECTION 2: ACTUAL PERFORMANCE */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center" wrap gap="100">
                  <Text as="h2" variant="headingMd">
                    Section 2: Actual Performance
                  </Text>
                  <Badge tone="info" size="small">
                    {formatDate(startDate)} – {formatDate(endDate)}
                  </Badge>
                </InlineStack>

                <Text as="p" tone="subdued" variant="bodyXs">
                  Data Source: {baselineData?.dataSource || "Verified Shopify Store Events (ShopLens Analytics)"}
                </Text>

                {baselineLoading ? (
                  <Box padding="600">
                    <InlineStack align="center" gap="300">
                      <Spinner size="large" />
                      <Text as="p">Querying verified store events…</Text>
                    </InlineStack>
                  </Box>
                ) : baselineError ? (
                  <Banner tone="critical" title="Baseline query error">
                    <p>{baselineError}</p>
                  </Banner>
                ) : metrics ? (
                  <BlockStack gap="300">
                    {/* Data Quality Warning if clicks > views or data cannot be reconciled */}
                    {!baselineData.dataQuality?.isValid && (
                      <Banner
                        tone="warning"
                        title="Data Quality Warning"
                      >
                        <p>
                          {baselineData.dataQuality?.warning ||
                            "Recorded product clicks exceed product views. Click-through rate cannot be computed reliably because event sources are incompatible or views are untracked. Scenario calculation is disabled until valid comparable data is available."}
                        </p>
                      </Banner>
                    )}

                    {smDown ? (
                      <BlockStack gap="200">
                        <Box
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="050">
                              <Text as="p" tone="subdued" variant="bodySm">
                                Product Views
                              </Text>
                              <Box>
                                <Badge
                                  tone={metrics.views > 0 ? "success" : "attention"}
                                  size="small"
                                >
                                  {metrics.views > 0 ? "Verified Impressions" : "Zero Views"}
                                </Badge>
                              </Box>
                            </BlockStack>
                            <Text as="p" variant="headingLg" fontWeight="bold">
                              {metrics.views.toLocaleString()}
                            </Text>
                          </InlineStack>
                        </Box>

                        <Box
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="050">
                              <Text as="p" tone="subdued" variant="bodySm">
                                Product Clicks
                              </Text>
                              <Box>
                                <Badge tone="info" size="small">
                                  Storefront & Search Clicks
                                </Badge>
                              </Box>
                            </BlockStack>
                            <Text as="p" variant="headingLg" fontWeight="bold">
                              {metrics.clicks.toLocaleString()}
                            </Text>
                          </InlineStack>
                        </Box>

                        <Box
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="050">
                              <Text as="p" tone="subdued" variant="bodySm">
                                Actual CTR
                              </Text>
                              <Text as="p" tone="subdued" variant="bodyXs">
                                (Clicks ÷ Views) × 100
                              </Text>
                            </BlockStack>
                            <Text
                              as="p"
                              variant="headingLg"
                              fontWeight="bold"
                              tone={metrics.clickThroughRate > 0 ? "success" : undefined}
                            >
                              {metrics.clickThroughRate != null
                                ? formatPercent(metrics.clickThroughRate)
                                : "N/A"}
                            </Text>
                          </InlineStack>
                        </Box>
                      </BlockStack>
                    ) : (
                      <InlineGrid columns={3} gap="300">
                        <Box
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <BlockStack gap="100">
                            <Text as="p" tone="subdued" variant="bodySm">
                              Product Views
                            </Text>
                            <Text as="p" variant="headingLg" fontWeight="bold">
                              {metrics.views.toLocaleString()}
                            </Text>
                            <Box>
                              <Badge
                                tone={metrics.views > 0 ? "success" : "attention"}
                                size="small"
                              >
                                {metrics.views > 0 ? "Verified Impressions" : "Zero Views"}
                              </Badge>
                            </Box>
                          </BlockStack>
                        </Box>

                        <Box
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <BlockStack gap="100">
                            <Text as="p" tone="subdued" variant="bodySm">
                              Product Clicks
                            </Text>
                            <Text as="p" variant="headingLg" fontWeight="bold">
                              {metrics.clicks.toLocaleString()}
                            </Text>
                            <Box>
                              <Badge tone="info" size="small">
                                Storefront & Search Clicks
                              </Badge>
                            </Box>
                          </BlockStack>
                        </Box>

                        <Box
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <BlockStack gap="100">
                            <Text as="p" tone="subdued" variant="bodySm">
                              Actual CTR
                            </Text>
                            <Text
                              as="p"
                              variant="headingLg"
                              fontWeight="bold"
                              tone={metrics.clickThroughRate > 0 ? "success" : undefined}
                            >
                              {metrics.clickThroughRate != null
                                ? formatPercent(metrics.clickThroughRate)
                                : "N/A"}
                            </Text>
                            <Text as="p" tone="subdued" variant="bodyXs">
                              (Clicks ÷ Views) × 100
                            </Text>
                          </BlockStack>
                        </Box>
                      </InlineGrid>
                    )}
                  </BlockStack>
                ) : scope === "product" && !selectedProduct ? (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" tone="subdued">
                      Select a product in Section 1 to load its verified baseline performance.
                    </Text>
                  </Box>
                ) : null}
              </BlockStack>
            </Card>

            {/* SECTION 3: CONFIGURE WHAT-IF SCENARIO */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Section 3: Configure What-If Scenario
                </Text>

                <TextField
                  label="Scenario Name"
                  value={scenarioName}
                  onChange={setScenarioName}
                  autoComplete="off"
                  helpText="Give this scenario an easily identifiable label."
                />

                <BlockStack gap="200">
                  <TextField
                    label="Target CTR (%)"
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={targetRate}
                    onChange={setTargetRate}
                    autoComplete="off"
                    helpText={
                      metrics?.clickThroughRate != null
                        ? `Actual CTR is ${formatPercent(metrics.clickThroughRate)}`
                        : "Enter a target CTR between 0.1% and 100%."
                    }
                  />

                  <Button
                    variant="primary"
                    onClick={handleCalculate}
                    loading={calculating}
                    fullWidth={smDown}
                    disabled={
                      calculating ||
                      baselineLoading ||
                      !scenarioName.trim() ||
                      !targetRate ||
                      Number(targetRate) <= 0 ||
                      Number(targetRate) > 100 ||
                      !isBaselineValid
                    }
                  >
                    Calculate Scenario
                  </Button>
                </BlockStack>

                {!isBaselineValid && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    {scope === "product" && !selectedProduct
                      ? "Please select a product above to load verified baseline data."
                      : baselineData?.dataQuality?.warning ||
                        "Calculation is disabled because valid, comparable product view and click baseline data is required."}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </BlockStack>

          {/* RIGHT COLUMN (30% width): Section 4 at top, Section 5 immediately below */}
          <BlockStack gap="400">
            <Card padding="0">
              {/* SECTION 4: SCENARIO RESULTS (Starts at the very top of the right column) */}
              <Box padding="400">
                {calculationResult && comparison ? (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Section 4: Scenario Results
                      </Text>
                      <Badge tone="attention">Hypothetical Estimate</Badge>
                    </InlineStack>

                    <DataTable
                      columnContentTypes={["text", "numeric", "numeric"]}
                      headings={["Metric", "Actual", "Target"]}
                      rows={[
                        [
                          "Product Views",
                          (calculationResult.baseline?.views ?? 0).toLocaleString(),
                          (calculationResult.baseline?.views ?? 0).toLocaleString(),
                        ],
                        [
                          "Product Clicks",
                          (calculationResult.baseline?.clicks ?? 0).toLocaleString(),
                          (comparison.estimatedTargetClicks ?? 0).toLocaleString(),
                        ],
                        [
                          "CTR",
                          formatPercent(calculationResult.baseline?.clickThroughRate),
                          formatPercent(comparison.targetRate),
                        ],
                        [
                          "Additional Clicks",
                          "—",
                          formatClicksDiff(comparison.additionalClicks),
                        ],
                      ]}
                    />

                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <BlockStack gap="100">
                        <Text as="p" fontWeight="bold">
                          Calculation Details:
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • Estimated Target Clicks = Product Views ({calculationResult.baseline?.views}) × Target CTR ({comparison.targetRate}%) ÷ 100 = {comparison.estimatedTargetClicks} clicks
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • Estimated Additional Clicks = {comparison.estimatedTargetClicks} − {calculationResult.baseline?.clicks} = {comparison.additionalClicks >= 0 ? `+${comparison.additionalClicks}` : comparison.additionalClicks} clicks
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <strong>Hypothetical Estimate — Not Guaranteed:</strong> Pure what-if analysis. Live storefront is completely unaffected.
                        </Text>
                      </BlockStack>
                    </Box>

                    <InlineStack align="space-between">
                      <Button onClick={() => setCalculationResult(null)}>
                        Clear Comparison
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleSaveScenario}
                        loading={saving}
                      >
                        Save Snapshot
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Section 4: Scenario Results
                      </Text>
                      <Badge tone="info">Waiting for Simulation</Badge>
                    </InlineStack>

                    <Box
                      padding="400"
                      background="bg-surface-secondary"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border-subdued"
                    >
                      <BlockStack gap="300">
                        <Text as="p" fontWeight="semibold">
                          Ready to Calculate
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Configure a Scenario Name and Target CTR in Section 3 on the left, then click <strong>Calculate Scenario</strong> to project estimated click impact.
                        </Text>
                        <Divider />
                        <Text as="p" variant="bodyXs" tone="subdued">
                          <strong>Formula:</strong> Estimated Additional Clicks = Math.round(Views × Target CTR ÷ 100) − Actual Clicks
                        </Text>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                )}
              </Box>

              <Divider />

              {/* SECTION 5: SAVED SCENARIOS (Immediately below Section 4 as a continuous panel) */}
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Section 5: Saved Scenarios
                    </Text>
                    <Badge tone="attention">
                      {String(scenarioPagination.total)}
                    </Badge>
                  </InlineStack>

                  <Text as="p" tone="subdued" variant="bodySm">
                    Immutable snapshots preserving original baseline, target CTR, and estimated click impact.
                  </Text>

                  {scenariosLoading ? (
                    <Box padding="400">
                      <InlineStack align="center" gap="200">
                        <Spinner size="small" />
                        <Text as="p">Loading saved scenarios…</Text>
                      </InlineStack>
                    </Box>
                  ) : savedScenarios.length === 0 ? (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="100" align="center" inlineAlign="center">
                        <Text as="p" fontWeight="semibold" alignment="center">
                          No saved scenarios yet
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm" alignment="center">
                          Calculate a scenario above and click &quot;Save Snapshot&quot;.
                        </Text>
                      </BlockStack>
                    </Box>
                  ) : (
                    <BlockStack gap="300">
                      {savedScenarios.map((scen) => (
                        <Box
                          key={scen._id}
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <BlockStack gap="150">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="span" fontWeight="bold">
                                {scen.name}
                              </Text>
                              <Badge tone="info">
                                {scen.scope === "product" ? "Product" : "Entire Store"}
                              </Badge>
                            </InlineStack>

                            {scen.product?.title && (
                              <Text as="p" variant="bodyXs" fontWeight="semibold">
                                {scen.product.title}
                              </Text>
                            )}

                            <Text as="p" variant="bodyXs" tone="subdued">
                              Created: {formatDate(scen.createdAt)}
                            </Text>

                            <Text as="p" variant="bodyXs" tone="subdued">
                              Range: {formatDate(scen.dateRange?.startDate)} – {formatDate(scen.dateRange?.endDate)}
                            </Text>

                            <Text as="p" variant="bodySm">
                              Actual CTR: <strong>{formatPercent(scen.baseline?.clickThroughRate)}</strong> → Target CTR: <strong>{formatPercent(scen.target?.targetRate)}</strong>
                            </Text>

                            <Text as="p" variant="bodySm" fontWeight="semibold">
                              Impact: {formatClicksDiff(scen.comparison?.additionalClicks)}
                            </Text>

                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                onClick={() => setViewingScenario(scen)}
                              >
                                View Snapshot
                              </Button>
                              <Button
                                size="slim"
                                tone="critical"
                                variant="plain"
                                loading={deletingId === scen._id}
                                onClick={() => handleDeleteScenario(scen._id)}
                              >
                                Delete
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      ))}

                      {scenarioPagination.pages > 1 && (
                        <Box paddingBlockStart="200">
                          <Pagination
                            hasPrevious={scenarioPage > 1}
                            onPrevious={() => loadSavedScenarios(scenarioPage - 1)}
                            hasNext={scenarioPage < scenarioPagination.pages}
                            onNext={() => loadSavedScenarios(scenarioPage + 1)}
                          />
                        </Box>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Box>

      {/* PRODUCT PICKER MODAL */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select Product for What-If Investigation"
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Search products"
              labelHidden
              placeholder="Search by product title or handle…"
              value={pickerSearch}
              onChange={(val) => {
                setPickerSearch(val);
                loadPickerProducts(val, 1);
              }}
              autoComplete="off"
            />

            {pickerLoading ? (
              <Box padding="600">
                <InlineStack align="center" gap="200">
                  <Spinner size="large" />
                  <Text as="p">Searching synced products…</Text>
                </InlineStack>
              </Box>
            ) : pickerProducts.length === 0 ? (
              <EmptyState heading="No products match your search" image="">
                <p>Try searching for a different product title.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "product", plural: "products" }}
                itemCount={pickerProducts.length}
                selectable={false}
                headings={[
                  { title: "Product" },
                  { title: "Price" },
                  { title: "Inventory" },
                  { title: "Action" },
                ]}
              >
                {pickerProducts.map((prod, idx) => (
                  <IndexTable.Row id={prod.id} key={prod.id} position={idx}>
                    <IndexTable.Cell>
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={prod.imageUrl || ""}
                          alt={prod.title}
                          size="small"
                        />
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="bold">
                            {prod.title}
                          </Text>
                          <Text as="span" tone="subdued" variant="bodyXs">
                            {prod.handle}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {prod.price != null ? `$${prod.price}` : "—"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={prod.inventory > 0 ? "success" : "critical"}>
                        {prod.inventory > 0 ? `${prod.inventory} in stock` : "Out of stock"}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button
                        size="slim"
                        variant="primary"
                        onClick={() => {
                          setSelectedProduct(prod);
                          setScope("product");
                          setPickerOpen(false);
                        }}
                      >
                        Select
                      </Button>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}

            {pickerPagination.pages > 1 && (
              <Pagination
                hasPrevious={pickerPage > 1}
                onPrevious={() => loadPickerProducts(pickerSearch, pickerPage - 1)}
                hasNext={pickerPage < pickerPagination.pages}
                onNext={() => loadPickerProducts(pickerSearch, pickerPage + 1)}
              />
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* VIEW SAVED SCENARIO SNAPSHOT MODAL */}
      <Modal
        open={Boolean(viewingScenario)}
        onClose={() => setViewingScenario(null)}
        title={`Scenario Snapshot: ${viewingScenario?.name || ""}`}
        size="large"
        primaryAction={{
          content: "Close",
          onAction: () => setViewingScenario(null),
        }}
      >
        <Modal.Section>
          {viewingScenario && (
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" tone="subdued">
                  Created: {formatDate(viewingScenario.createdAt)} • Scope:{" "}
                  <strong>{viewingScenario.scope === "product" ? "One Product" : "Entire Store"}</strong>
                </Text>
                <Badge tone="attention">Historical Snapshot (Immutable)</Badge>
              </InlineStack>

              {viewingScenario.product && (
                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <InlineStack gap="300" blockAlign="center">
                    <Thumbnail
                      source={viewingScenario.product.imageUrl || ""}
                      alt={viewingScenario.product.title}
                      size="small"
                    />
                    <Text as="span" fontWeight="bold">
                      {viewingScenario.product.title}
                    </Text>
                  </InlineStack>
                </Box>
              )}

              <Text as="p" variant="bodySm">
                Date Range: {formatDate(viewingScenario.dateRange?.startDate)} –{" "}
                {formatDate(viewingScenario.dateRange?.endDate)}
              </Text>

              <DataTable
                columnContentTypes={["text", "numeric", "numeric"]}
                headings={["Metric", "Actual", "Hypothetical Target"]}
                rows={[
                  [
                    "Product Views",
                    (viewingScenario.baseline?.views ?? 0).toLocaleString(),
                    `${(viewingScenario.baseline?.views ?? 0).toLocaleString()} (Same views)`,
                  ],          
                  [     
                    "Product Clicks",
                    (viewingScenario.baseline?.clicks ?? 0).toLocaleString(),
                    (
                      viewingScenario.comparison?.estimatedTargetClicks ??
                      Math.round(
                        ((viewingScenario.baseline?.views ?? 0) * (viewingScenario.target?.targetRate ?? 0)) / 100
                      )
                    ).toLocaleString(),
                  ],
                  [
                    "CTR",
                    formatPercent(viewingScenario.baseline?.clickThroughRate),
                    formatPercent(viewingScenario.target?.targetRate),
                  ],
                  [
                    "Additional Clicks",
                    "—",
                    formatClicksDiff(viewingScenario.comparison?.additionalClicks),
                  ],
                ]}
              />

              <Box
                padding="300"
                background="bg-surface-secondary"
                borderRadius="200"
              >
                <BlockStack gap="100">
                  <Text as="p" fontWeight="bold">
                    Snapshot Details:
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    • <strong>Hypothetical Estimate — Not Guaranteed</strong>: Original baseline and projections saved at snapshot creation time.
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    • This snapshot is completely immutable and reflects historical records.
                  </Text>
                </BlockStack>
              </Box>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
