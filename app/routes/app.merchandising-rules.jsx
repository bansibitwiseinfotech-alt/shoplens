import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  EmptyState,
  IndexTable,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
  Thumbnail,
  useBreakpoints,
} from "@shopify/polaris";
import PropTypes from "prop-types";
import { authenticate } from "../shopify.server";
import {
  applyMerchandisingRules,
  createMerchandisingRule,
  deleteMerchandisingRule,
  getMerchandisingRules,
  getRuleOverview,
  getShopCollections,
  previewMerchandisingRule,
  updateMerchandisingRule,
} from "../services/merchandisingRulesApi.js";
import PlanUpgradeGate from "../components/billing/PlanUpgradeGate.jsx";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

const RULE_TYPE_OPTIONS = [
  { value: "out_of_stock", label: "Move out-of-stock products toward bottom" },
  { value: "new_product", label: "Promote recently created products" },
  { value: "best_seller", label: "Boost best-selling products" },
  { value: "high_margin", label: "Prioritize high-margin products" },
  { value: "custom", label: "Custom conditions & actions" },
];

const RULE_TYPE_LABELS = {
  out_of_stock: "Out of stock to bottom",
  new_product: "Promote new products",
  best_seller: "Boost best sellers",
  high_margin: "Prioritize high margin",
  custom: "Custom rule",
};

const ACTION_LABELS = {
  boost: "Boost matching products",
  demote: "Demote matching products",
  move_to_top: "Move matching products to the top",
  move_to_bottom: "Move matching products to the bottom",
};

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({
  value,
  label,
}));        

const FIELD_OPTIONS = [
  { value: "inventory", label: "Inventory quantity" },
  { value: "createdAt", label: "Product created date" },
  { value: "price", label: "Price" },
  { value: "productType", label: "Product type" },
  { value: "vendor", label: "Vendor" },
  { value: "tag", label: "Tag" },
];

const OPERATOR_LABELS = {
  equals: "is equal to",
  not_equals: "is not equal to",
  greater_than: "is greater than",
  less_than: "is less than",
  contains: "contains",
};

const NUMERIC_FIELDS = new Set(["inventory", "price"]);
const STRING_OPERATORS = ["equals", "not_equals", "contains"];
const NUMERIC_OPERATORS = [
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
];
const DATE_OPERATORS = ["equals", "not_equals", "contains"];

function createEmptyForm() {
  return {
    name: "",
    ruleType: "out_of_stock",
    collectionIds: [],
    priority: "1",
    isActive: true,
    configuration: {
      timeWindowDays: "30",
      newThresholdDays: "30",
      marginMetric: "amount",
      boostAmount: "10",
      demoteAmount: "10",
    },
    conditions: [{ field: "inventory", operator: "less_than", value: "1" }],
    actions: [{ type: "move_to_bottom", amount: "10" }],
  };
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function getRuleTypeDisplay(rule) {
  if (rule.ruleType && RULE_TYPE_LABELS[rule.ruleType]) {
    return RULE_TYPE_LABELS[rule.ruleType];
  }
  if (Array.isArray(rule.actions) && rule.actions.length > 0) {
    return rule.actions
      .map((action) => ACTION_LABELS[action.type] || action.type)
      .join(", ");
  }
  return "Custom rule";
}

function getRulePayload(form) {
  const payload = {
    name: form.name.trim(),
    ruleType: form.ruleType,
    collectionIds: form.collectionIds,
    priority: Number(form.priority),
    isActive: form.isActive,
    configuration: {
      timeWindowDays: Number(form.configuration?.timeWindowDays || 30),
      newThresholdDays: Number(form.configuration?.newThresholdDays || 30),
      marginMetric: form.configuration?.marginMetric || "amount",
      boostAmount: Number(form.configuration?.boostAmount || 10),
      demoteAmount: Number(form.configuration?.demoteAmount || 10),
    },
  };

  if (form.ruleType === "custom") {
    payload.conditions = form.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: NUMERIC_FIELDS.has(condition.field)
        ? Number(condition.value)
        : String(condition.value).trim(),
    }));
    payload.actions = form.actions.map((action) => ({
      type: action.type,
      ...(action.type === "boost" || action.type === "demote"
        ? { amount: Number(action.amount) }
        : {}),
    }));
  }

  return payload;
}

function validateForm(form) {
  if (!form.name.trim()) return "Enter a rule name.";
  if (!form.collectionIds.length) return "Select at least one target collection.";

  if (form.ruleType === "new_product") {
    const days = Number(form.configuration?.newThresholdDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return "New product threshold must be between 1 and 365 days.";
    }
  }

  if (form.ruleType === "best_seller") {
    const days = Number(form.configuration?.timeWindowDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return "Sales time window must be between 1 and 365 days.";
    }
  }

  if (form.ruleType === "custom") {
    for (const condition of form.conditions) {
      if (condition.value === "" || condition.value === null) {
        return "Enter a value for each condition or remove the empty condition.";
      }
      if (
        NUMERIC_FIELDS.has(condition.field) &&
        !Number.isFinite(Number(condition.value))
      ) {
        return "Inventory and price condition values must be numbers.";
      }
    }

    if (!form.actions.length) return "Add at least one product-order action.";
    for (const action of form.actions) {
      if (
        ["boost", "demote"].includes(action.type) &&
        (!Number.isInteger(Number(action.amount)) ||
          Number(action.amount) < 1 ||
          Number(action.amount) > 100)
      ) {
        return "Boost and demote amounts must be whole numbers from 1 to 100.";
      }
    }
  }

  return null;
}

function SummaryCard({ title, value, loading, subtitle }) {
  const isLong = typeof value === "string" && value.length > 8;
  return (
    <Card padding={{ xs: "300", sm: "400" }}>
      <Box minHeight={{ xs: "58px", sm: "64px" }}>
        <BlockStack gap="050">
          <Text as="h2" variant="bodySm" tone="subdued" truncate>
            {title}
          </Text>
          {loading ? (
            <Box paddingBlockStart="100">
              <Spinner size="small" accessibilityLabel={`Loading ${title.toLowerCase()}`} />
            </Box>
          ) : (
            <BlockStack gap="0">
              <Text
                as="p"
                variant={isLong ? "headingSm" : "headingLg"}
                fontWeight="bold"
              >
                {value}
              </Text>
              {subtitle ? (
                <Text as="span" variant="bodyXs" tone="subdued">
                  {subtitle}
                </Text>
              ) : null}
            </BlockStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

SummaryCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  loading: PropTypes.bool.isRequired,
  subtitle: PropTypes.string,
};

export default function MerchandisingRulesRoute() {
  const { shop } = useLoaderData();
  const { smDown } = useBreakpoints();
  const [overview, setOverview] = useState(null);
  const [rules, setRules] = useState([]);
  const [collections, setCollections] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionToAdd, setCollectionToAdd] = useState("");
  const [pageError, setPageError] = useState("");
  const [collectionsError, setCollectionsError] = useState("");
  const [upgradeRequired, setUpgradeRequired] = useState(null);
  const [operationFeedback, setOperationFeedback] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [applyConfirmationOpen, setApplyConfirmationOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  // Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewTargetRule, setPreviewTargetRule] = useState(null);
  const [previewCollectionId, setPreviewCollectionId] = useState("");
  const [previewMode, setPreviewMode] = useState("rule_only");
  const [previewData, setPreviewData] = useState(null);

  const collectionNames = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection.title])),
    [collections]
  );

  const applyCollectionIds = useMemo(
    () =>
      [...new Set(
        rules
          .filter((rule) => rule.isActive)
          .flatMap((rule) => rule.collectionIds || [])
      )],
    [rules]
  );

  const loadRulesAndOverview = useCallback(async () => {
    setPageLoading(true);
    setPageError("");
    try {
      const [nextOverview, nextRules] = await Promise.all([
        getRuleOverview(shop),
        getMerchandisingRules(shop),
      ]);
      setOverview(nextOverview);
      setRules(nextRules);
    } catch (error) {
      if (
        error.status === 403 ||
        error.response?.code === "UPGRADE_REQUIRED" ||
        error.message?.includes("not included in the") ||
        error.message?.includes("Upgrade to")
      ) {
        setUpgradeRequired(error.response?.requiredPlan || "premium");
      } else {
        setPageError(error.message || "Unable to load saved merchandising rules.");
      }
    } finally {
      setPageLoading(false);
    }
  }, [shop]);

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    setCollectionsError("");
    try {
      setCollections(await getShopCollections(shop));
    } catch (error) {
      setCollectionsError(error.message || "Unable to load Shopify collections.");
    } finally {
      setCollectionsLoading(false);
    }
  }, [shop]);

  const refreshData = useCallback(async () => {
    await Promise.all([loadRulesAndOverview(), loadCollections()]);
  }, [loadCollections, loadRulesAndOverview]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const loadPreview = useCallback(
    async (rule, collectionId, mode = "rule_only") => {
      if (!rule) return;
      const targetId = collectionId || rule.collectionIds?.[0];
      if (!targetId) {
        setPreviewError("Select at least one collection to preview.");
        return;
      }
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const res = await previewMerchandisingRule(shop, {
          rule,
          ruleId: rule._id,
          collectionId: targetId,
          mode,
        });
        setPreviewData(res);
      } catch (err) {
        setPreviewError(err.message || "Failed to load product ordering preview.");
      } finally {
        setPreviewLoading(false);
      }
    },
    [shop]
  );

  const openPreviewForRow = (rule) => {
    setPreviewTargetRule(rule);
    const initialCollectionId = rule.collectionIds?.[0] || "";
    setPreviewCollectionId(initialCollectionId);
    setPreviewMode("rule_only");
    setPreviewData(null);
    setPreviewError("");
    setPreviewModalOpen(true);
    loadPreview(rule, initialCollectionId, "rule_only");
  };

  const handlePreviewFromEditor = () => {
    const validationMessage = validateForm(form);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }
    const payload = getRulePayload(form);
    setPreviewTargetRule(payload);
    const initialCollectionId = payload.collectionIds?.[0] || "";
    setPreviewCollectionId(initialCollectionId);
    setPreviewMode("rule_only");
    setPreviewData(null);
    setPreviewError("");
    setPreviewModalOpen(true);
    loadPreview(payload, initialCollectionId, "rule_only");
  };

  const openCreateEditor = () => {
    setEditingRule(null);
    setForm(createEmptyForm());
    setCollectionToAdd("");
    setFormError("");
    setEditorOpen(true);
  };

  const openEditEditor = (rule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      ruleType: rule.ruleType || "custom",
      collectionIds: [...(rule.collectionIds || [])],
      priority: String(rule.priority ?? 1),
      isActive: rule.isActive ?? true,
      configuration: {
        timeWindowDays: String(rule.configuration?.timeWindowDays ?? 30),
        newThresholdDays: String(rule.configuration?.newThresholdDays ?? 30),
        marginMetric: rule.configuration?.marginMetric || "amount",
        boostAmount: String(rule.configuration?.boostAmount ?? 10),
        demoteAmount: String(rule.configuration?.demoteAmount ?? 10),
      },
      conditions: (rule.conditions || []).map((condition) => ({
        ...condition,
        value: String(condition.value ?? ""),
      })),
      actions: (rule.actions || []).map((action) => ({
        type: action.type,
        amount: String(action.amount ?? 10),
      })),
    });
    setCollectionToAdd("");
    setFormError("");
    setEditorOpen(true);
  };

  const updateCondition = (index, updates) => {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.map((condition, currentIndex) =>
        currentIndex === index ? { ...condition, ...updates } : condition
      ),
    }));
  };

  const updateAction = (index, updates) => {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action, currentIndex) =>
        currentIndex === index ? { ...action, ...updates } : action
      ),
    }));
  };

  const saveRule = async () => {
    const validationMessage = validateForm(form);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const payload = getRulePayload(form);
      if (editingRule) {
        await updateMerchandisingRule(shop, editingRule._id, payload);
      } else {
        await createMerchandisingRule(shop, payload);
      }
      setEditorOpen(false);
      setOperationFeedback({
        tone: "success",
        title: editingRule ? "Rule updated" : "Rule created",
        message: editingRule
          ? `Changes saved for rule "${form.name}".`
          : `Rule "${form.name}" has been created successfully.`,
      });
      await loadRulesAndOverview();
    } catch (error) {
      setFormError(error.message || "The backend could not save this rule.");
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule) => {
    setBusyRuleId(rule._id);
    setOperationFeedback(null);
    try {
      await updateMerchandisingRule(shop, rule._id, { isActive: !rule.isActive });
      setOperationFeedback({
        tone: "success",
        title: rule.isActive ? "Rule disabled" : "Rule enabled",
        message: `Rule "${rule.name}" is now ${rule.isActive ? "inactive" : "active"}.`,
      });
      await loadRulesAndOverview();
    } catch (error) {
      setOperationFeedback({
        tone: "critical",
        title: "Unable to update rule",
        message: error.message,
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  const confirmDeleteRule = async () => {
    if (!deleteCandidate) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const result = await deleteMerchandisingRule(shop, deleteCandidate._id);
      setDeleteCandidate(null);
      setOperationFeedback({
        tone: "success",
        title: "Rule deleted",
        message: result.message || "Rule was deleted from database.",
      });
      await loadRulesAndOverview();
    } catch (error) {
      setDeleteError(error.message || "The backend could not delete this rule.");
    } finally {
      setDeleting(false);
    }
  };

  const handleApplyRules = async () => {
    setApplyConfirmationOpen(false);
    setApplying(true);
    setOperationFeedback(null);

    try {
      const response = await applyMerchandisingRules(shop, "all");
      const results = response.data?.results || [];
      const totalMoved = response.data?.totalProductsChanged ?? 0;
      const failed = results.some((r) => !r.success);

      setOperationFeedback({
        tone: failed ? "critical" : "success",
        title: failed
          ? "Some collection reorders encountered issues"
          : totalMoved > 0
            ? `Merchandising rules successfully applied (${totalMoved} products repositioned)`
            : "Merchandising rules evaluated; collections already in optimal order",
        results,
        message: response.message,
      });
    } catch (error) {
      setOperationFeedback({
        tone: "critical",
        title: "Failed to apply merchandising rules",
        message: error.message || "Shopify API reorder operation encountered an error.",
      });
    } finally {
      setApplying(false);
      await loadRulesAndOverview();
    }
  };

  const addCollection = (collectionId) => {
    if (!collectionId || form.collectionIds.includes(collectionId)) return;
    setForm((current) => ({
      ...current,
      collectionIds: [...current.collectionIds, collectionId],
    }));
  };

  const collectionOptions = [
    { label: "Select a collection…", value: "" },
    ...collections
      .filter((collection) => !form.collectionIds.includes(collection.id))
      .map((collection) => ({
        label: `${collection.title} (${collection.productsCount ?? 0} products)`,
        value: collection.id,
      })),
  ];

  if (upgradeRequired) {
    return (
      <Page
        title="Smart Merchandising Rules"
        subtitle="Define deterministic rules to dynamically control product ordering across your Shopify collections."
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
        paddingInline={{ xs: "400", sm: "600", md: "700" }}
        paddingBlockStart={{ xs: "300", sm: "400" }}
        paddingBlockEnd={{ xs: "400", sm: "500" }}
      >
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          {/* Page Header (with native Polaris padding & margin) */}
          <InlineStack align="space-between" blockAlign="start" wrap gap="200">
            <BlockStack gap="050">
              <Text variant="headingXl" as="h1" fontWeight="bold">
                Smart Merchandising Rules
              </Text>
              <Text variant="bodySm" tone="subdued">
                Define deterministic rules to dynamically control product ordering across your Shopify collections.
              </Text>
            </BlockStack>
          </InlineStack>

          <Banner tone="info">
            <p>
              <strong>Storefront Note:</strong> Applying merchandising rules updates the manual product
              order directly on your live Shopify collections. Products will be displayed on your
              storefront in this deterministic rule order.
            </p>
          </Banner>

          {/* Action Bar */}
          <Card padding={{ xs: "300", sm: "400" }}>
            <InlineStack align="space-between" blockAlign="center" wrap gap="300">
              <Text as="p" variant="bodySm" tone="subdued">
                Rules evaluate real Shopify inventory, order sales history, creation dates, and product costs.
              </Text>
              <InlineStack gap="200" wrap>
                <Button onClick={refreshData} loading={pageLoading || collectionsLoading}>
                  Refresh data
                </Button>
                <Button
                  onClick={() => setApplyConfirmationOpen(true)}
                  loading={applying}
                  disabled={applying || applyCollectionIds.length === 0}
                >
                  Apply Rules
                </Button>
                <Button
                  variant="primary"
                  onClick={openCreateEditor}
                  disabled={collectionsLoading || !!collectionsError || collections.length === 0}
                >
                  Create rule
                </Button>
              </InlineStack>
            </InlineStack>
          </Card>

        {pageError?.includes("not included in the") || collectionsError?.includes("not included in the") ? (
          <Banner
            tone="warning"
            title="Plan Upgrade Required"
            action={{
              content: "View Billing & Plans",
              url: "/app/billing",
            }}
          >
            <p>
              Smart Merchandising Rules is a Premium feature. Upgrade your subscription to create, automate, and publish merchandising rules across your live Shopify collections.
            </p>
          </Banner>
        ) : (
          <>
            {pageError && (
              <Banner
                tone="critical"
                title="Unable to load saved rules"
                action={{ content: "Retry", onAction: refreshData }}
              >
                <p>{pageError}</p>
              </Banner>
            )}

            {collectionsError && (
              <Banner
                tone="critical"
                title="Unable to load Shopify collections"
                action={{ content: "Retry", onAction: loadCollections }}
              >
                <p>{collectionsError}</p>
              </Banner>
            )}
          </>
        )}

        {!collectionsLoading && !collectionsError && collections.length === 0 && (
          <Banner tone="warning" title="No Shopify collections found">
            <p>
              Create a collection in Shopify Admin before defining a rule. Collection choices are
              loaded live from your Shopify store.
            </p>
          </Banner>
        )}

        {operationFeedback && (
          <Banner
            tone={operationFeedback.tone}
            title={operationFeedback.title}
            onDismiss={() => setOperationFeedback(null)}
          >
            {operationFeedback.results && operationFeedback.results.length > 0 ? (
              <BlockStack gap="200">
                {operationFeedback.results.map((result, index) => (
                  <Box key={`${result.collectionId}-${index}`}>
                    <Text as="p">
                      <strong>{result.collectionTitle}:</strong> {result.message}
                      {result.productsChanged > 0 && ` (${result.productsChanged} products moved)`}
                    </Text>
                    {result.warnings && result.warnings.length > 0 && (
                      <Box paddingBlockStart="100" paddingInlineStart="300">
                        {result.warnings.map((w, wIdx) => (
                          <Text as="p" tone="subdued" variant="bodySm" key={`warn-${wIdx}`}>
                            • {w}
                          </Text>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </BlockStack>
            ) : (
              <p>{operationFeedback.message}</p>
            )}
          </Banner>
        )}

        <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap={{ xs: "300", sm: "400" }}>
          <SummaryCard
            title="Total Rules"
            value={overview?.totalRules ?? "—"}
            loading={pageLoading && !overview}
          />
          <SummaryCard
            title="Active Rules"
            value={overview?.activeRules ?? "—"}
            loading={pageLoading && !overview}
          />
          <SummaryCard
            title="Collections Covered"
            value={overview?.collectionsCovered ?? "—"}
            loading={pageLoading && !overview}
          />
          <SummaryCard
            title="Last Applied"
            value={
              overview?.lastApplied
                ? new Date(overview.lastApplied).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })
                : "—"
            }
            subtitle={
              overview?.lastApplied
                ? new Date(overview.lastApplied).toLocaleTimeString(undefined, {
                    timeStyle: "short",
                  })
                : null
            }
            loading={pageLoading && !overview}
          />
        </InlineGrid>

          {pageLoading && !rules.length ? (
            <Card padding="0">
              <Box padding="800">
                <BlockStack gap="300" inlineAlign="center">
                  <Spinner size="large" accessibilityLabel="Loading saved merchandising rules" />
                  <Text as="p" tone="subdued">
                    Loading saved rules from ShopLens database…
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          ) : !pageError && rules.length === 0 ? (
            <Card padding="0">
              <EmptyState
                heading="No merchandising rules configured"
                action={{
                  content: "Create rule",
                  onAction: openCreateEditor,
                  disabled: collectionsLoading || !!collectionsError || collections.length === 0,
                }}
                image=""
              >
                <p>
                  Define rules to boost best sellers, promote new products, prioritize high-margin items,
                  or push out-of-stock items to the bottom of collections.
                </p>
              </EmptyState>
            </Card>
          ) : smDown ? (
            <BlockStack gap="300">
              <Box paddingInline={{ xs: "100", sm: "0" }}>
                <Text as="h2" variant="headingSm" fontWeight="semibold">
                  Saved Rules ({rules.length})
                </Text>
              </Box>
              {rules.map((rule) => (
                <Card key={rule._id} padding={{ xs: "300", sm: "400" }}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center" wrap={false} gap="200">
                      <Text as="h3" variant="headingSm" fontWeight="bold">
                        {rule.name}
                      </Text>
                      <Badge tone={rule.isActive ? "success" : "attention"}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </InlineStack>

                    <BlockStack gap="150">
                      <InlineStack align="space-between" blockAlign="start" gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Type
                        </Text>
                        <Text as="span" variant="bodySm" fontWeight="medium">
                          {getRuleTypeDisplay(rule)}
                        </Text>
                      </InlineStack>

                      <InlineStack align="space-between" blockAlign="start" gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Collections
                        </Text>
                        <Box maxWidth="65%">
                          <Text as="span" variant="bodySm" fontWeight="medium" alignment="end">
                            {(rule.collectionIds || [])
                              .map((id) => collectionNames.get(id) || id)
                              .join(", ") || "None"}
                          </Text>
                        </Box>
                      </InlineStack>

                      <InlineStack align="space-between" blockAlign="center" gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Last applied
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {formatDate(rule.lastRunAt)}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <InlineStack gap="200" align="end" wrap>
                      <Button
                        size="slim"
                        onClick={() => openPreviewForRow(rule)}
                        disabled={!!busyRuleId || applying}
                      >
                        Preview
                      </Button>
                      <Button
                        size="slim"
                        onClick={() => openEditEditor(rule)}
                        disabled={!!busyRuleId || applying}
                      >
                        Edit
                      </Button>
                      <Button
                        size="slim"
                        onClick={() => toggleRule(rule)}
                        loading={busyRuleId === rule._id}
                        disabled={(!!busyRuleId && busyRuleId !== rule._id) || applying}
                      >
                        {rule.isActive ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="slim"
                        tone="critical"
                        onClick={() => {
                          setDeleteError("");
                          setDeleteCandidate(rule);
                        }}
                        disabled={!!busyRuleId || applying}
                      >
                        Delete
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              ))}
            </BlockStack>
          ) : (
            <Card padding="0">
              <Box
                paddingInline="400"
                paddingBlockStart="300"
                paddingBlockEnd="300"
              >
                <Text as="h2" variant="headingSm" fontWeight="semibold">
                  Saved Rules ({rules.length})
                </Text>
              </Box>
              <Divider />
              <IndexTable
                resourceName={{ singular: "rule", plural: "rules" }}
                itemCount={rules.length}
                selectable={false}
                headings={[
                  { title: "Rule name" },
                  { title: "Type" },
                  { title: "Collections" },
                  { title: "Status" },
                  { title: "Applied" },
                  { title: "Actions" },
                ]}
              >
                {rules.map((rule, index) => (
                  <IndexTable.Row id={rule._id} key={rule._id} position={index}>
                    <IndexTable.Cell>
                      <Box minWidth="110px">
                        <Text as="span" fontWeight="bold">
                          {rule.name}
                        </Text>
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box minWidth="110px">
                        <Text as="span" variant="bodySm">
                          {getRuleTypeDisplay(rule)}
                        </Text>
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box minWidth="120px">
                        <BlockStack gap="100">
                          {(rule.collectionIds || []).map((id) => (
                            <Text as="span" key={id} variant="bodySm">
                              {collectionNames.get(id) || `Collection (${id.replace(/^gid:\/\/shopify\/Collection\//, "")})`}
                            </Text>
                          ))}
                        </BlockStack>
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box minWidth="75px">
                        <Badge tone={rule.isActive ? "success" : "attention"}>
                          {rule.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box minWidth="105px">
                        <Text as="span" variant="bodySm">
                          {formatDate(rule.lastRunAt)}
                        </Text>
                      </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Box minWidth="170px">
                        <InlineStack gap="200" wrap={false}>
                          <Button
                            variant="plain"
                            onClick={() => openPreviewForRow(rule)}
                            disabled={!!busyRuleId || applying}
                          >
                            Preview
                          </Button>
                          <Button
                            variant="plain"
                            onClick={() => openEditEditor(rule)}
                            disabled={!!busyRuleId || applying}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="plain"
                            onClick={() => toggleRule(rule)}
                            loading={busyRuleId === rule._id}
                            disabled={(!!busyRuleId && busyRuleId !== rule._id) || applying}
                          >
                            {rule.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="plain"
                            tone="critical"
                            onClick={() => {
                              setDeleteError("");
                              setDeleteCandidate(rule);
                            }}
                            disabled={!!busyRuleId || applying}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </Box>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </Card>
          )}
      </BlockStack>
    </Box>

      {/* Create / Edit Rule Modal */}
      <Modal
        open={editorOpen}
        onClose={() => !saving && setEditorOpen(false)}
        title={editingRule ? "Edit merchandising rule" : "Create merchandising rule"}
        primaryAction={{
          content: editingRule ? "Save changes" : "Create rule",
          onAction: saveRule,
          loading: saving,
          disabled: saving || (!editingRule && (collectionsLoading || !!collectionsError)),
        }}
        secondaryActions={[
          {
            content: "Preview rule",
            onAction: handlePreviewFromEditor,
            disabled: saving,
          },
          {
            content: "Cancel",
            onAction: () => setEditorOpen(false),
            disabled: saving,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {formError && (
              <Banner tone="critical" title="Rule validation error">
                <p>{formError}</p>
              </Banner>
            )}

            <TextField
              label="Rule name"
              value={form.name}
              onChange={(name) => setForm((current) => ({ ...current, name }))}
              placeholder="e.g. Move Out-of-Stock to Bottom, Boost Top Sellers"
              autoComplete="off"
              requiredIndicator
              maxLength={100}
            />

            <Select
              label="Rule type"
              options={RULE_TYPE_OPTIONS}
              value={form.ruleType}
              onChange={(ruleType) => setForm((current) => ({ ...current, ruleType }))}
              helpText="Select the merchandising logic to apply to selected collections."
            />

            {/* Rule-specific Configuration Fields */}
            {form.ruleType === "out_of_stock" && (
              <Banner tone="info">
                <p>
                  Products with 0 or negative inventory will be placed at the bottom of the collection.
                  Products with untracked or unknown inventory are kept in place and not assumed to be out of stock.
                </p>
              </Banner>
            )}

            {form.ruleType === "new_product" && (
              <BlockStack gap="300">
                <TextField
                  label="Consider product 'new' if created within (days)"
                  type="number"
                  value={form.configuration?.newThresholdDays || "30"}
                  onChange={(days) =>
                    setForm((current) => ({
                      ...current,
                      configuration: { ...current.configuration, newThresholdDays: days },
                    }))
                  }
                  min={1}
                  max={365}
                  helpText="Products created within this window will be boosted toward the top, sorted newest first."
                />
              </BlockStack>
            )}

            {form.ruleType === "best_seller" && (
              <BlockStack gap="300">
                <TextField
                  label="Sales lookback window (days)"
                  type="number"
                  value={form.configuration?.timeWindowDays || "30"}
                  onChange={(days) =>
                    setForm((current) => ({
                      ...current,
                      configuration: { ...current.configuration, timeWindowDays: days },
                    }))
                  }
                  min={1}
                  max={365}
                  helpText="Calculates total paid units sold over this period from synced store orders. Products with higher sales are prioritized."
                />
              </BlockStack>
            )}

            {form.ruleType === "high_margin" && (
              <BlockStack gap="300">
                <Select
                  label="Margin calculation metric"
                  options={[
                    { label: "Margin amount (Price − Cost)", value: "amount" },
                    { label: "Margin percentage ((Price − Cost) / Price)", value: "percentage" },
                  ]}
                  value={form.configuration?.marginMetric || "amount"}
                  onChange={(marginMetric) =>
                    setForm((current) => ({
                      ...current,
                      configuration: { ...current.configuration, marginMetric },
                    }))
                  }
                  helpText="Uses real product variant costs. Products with missing cost data are safely excluded from margin ranking without assuming zero cost."
                />
              </BlockStack>
            )}

            {form.ruleType === "custom" && (
              <BlockStack gap="300">
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    Conditions
                  </Text>
                  <Button
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        conditions: [
                          ...current.conditions,
                          { field: "inventory", operator: "less_than", value: "" },
                        ],
                      }))
                    }
                  >
                    Add condition
                  </Button>
                </InlineStack>
                {form.conditions.map((condition, index) => {
                  const operators = NUMERIC_FIELDS.has(condition.field)
                    ? NUMERIC_OPERATORS
                    : condition.field === "createdAt"
                      ? DATE_OPERATORS
                      : STRING_OPERATORS;

                  return (
                    <InlineStack key={`condition-${index}`} gap="200" blockAlign="end" wrap>
                      <Box minWidth="150px">
                        <Select
                          label="Field"
                          options={FIELD_OPTIONS}
                          value={condition.field}
                          onChange={(field) =>
                            updateCondition(index, {
                              field,
                              operator: NUMERIC_FIELDS.has(field) ? "less_than" : "contains",
                              value: "",
                            })
                          }
                        />
                      </Box>
                      <Box minWidth="140px">
                        <Select
                          label="Comparison"
                          options={operators.map((op) => ({
                            label: OPERATOR_LABELS[op],
                            value: op,
                          }))}
                          value={condition.operator}
                          onChange={(operator) => updateCondition(index, { operator })}
                        />
                      </Box>
                      <Box minWidth="140px">
                        <TextField
                          label="Value"
                          type={NUMERIC_FIELDS.has(condition.field) ? "number" : "text"}
                          value={condition.value}
                          onChange={(value) => updateCondition(index, { value })}
                          autoComplete="off"
                        />
                      </Box>
                      <Button
                        variant="plain"
                        tone="critical"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            conditions: current.conditions.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </InlineStack>
                  );
                })}

                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    Action
                  </Text>
                  <Button
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        actions: [...current.actions, { type: "boost", amount: "10" }],
                      }))
                    }
                  >
                    Add action
                  </Button>
                </InlineStack>
                {form.actions.map((action, index) => (
                  <InlineStack key={`action-${index}`} gap="200" blockAlign="end" wrap>
                    <Box minWidth="260px">
                      <Select
                        label="Action"
                        options={ACTION_OPTIONS}
                        value={action.type}
                        onChange={(type) => updateAction(index, { type })}
                      />
                    </Box>
                    {["boost", "demote"].includes(action.type) && (
                      <Box minWidth="120px">
                        <TextField
                          label="Positions"
                          type="number"
                          value={action.amount}
                          onChange={(amount) => updateAction(index, { amount })}
                          min={1}
                          max={100}
                        />
                      </Box>
                    )}
                    <Button
                      variant="plain"
                      tone="critical"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          actions: current.actions.filter((_, i) => i !== index),
                        }))
                      }
                      disabled={form.actions.length === 1}
                    >
                      Remove
                    </Button>
                  </InlineStack>
                ))}
              </BlockStack>
            )}

            <Divider />

            {/* Target Collections Selection */}
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Target Collections
              </Text>
              <InlineStack gap="200" blockAlign="end" wrap={false}>
                <Box minWidth="280px">
                  <Select
                    label="Add collection"
                    labelHidden
                    options={collectionOptions}
                    value={collectionToAdd}
                    onChange={setCollectionToAdd}
                    disabled={collectionsLoading || collections.length === 0}
                  />
                </Box>
                <Button
                  onClick={() => {
                    addCollection(collectionToAdd);
                    setCollectionToAdd("");
                  }}
                  disabled={!collectionToAdd}
                >
                  Add
                </Button>
              </InlineStack>

              {form.collectionIds.length > 0 ? (
                <BlockStack gap="200">
                  {form.collectionIds.map((id) => (
                    <InlineStack key={id} align="space-between" blockAlign="center">
                      <Text as="span">{collectionNames.get(id) || id}</Text>
                      <Button
                        variant="plain"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            collectionIds: current.collectionIds.filter((cid) => cid !== id),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </InlineStack>
                  ))}
                </BlockStack>
              ) : (
                <Text as="p" tone="subdued">
                  Select at least one live Shopify collection for this rule to target.
                </Text>
              )}
            </BlockStack>

            <Checkbox
              label="Rule is active"
              checked={form.isActive}
              onChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Preview Product Ordering Modal */}
      <Modal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Preview Product Ordering"
        size="large"
        primaryAction={{
          content: "Apply Rules to Shopify",
          onAction: () => {
            setPreviewModalOpen(false);
            setApplyConfirmationOpen(true);
          },
          disabled:
            previewLoading ||
            !previewData ||
            previewData.productsEvaluated === 0,
        }}
        secondaryActions={[
          {
            content: "Refresh Preview",
            onAction: () =>
              loadPreview(previewTargetRule, previewCollectionId, previewMode),
            loading: previewLoading,
          },
          {
            content: "Close",
            onAction: () => setPreviewModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>
                Preview how this rule changes product positions. Your storefront will not change until you apply the rule.
              </p>
            </Banner>

            {previewError && (
              <Banner
                tone="critical"
                title="Preview calculation error"
                action={{
                  content: "Retry",
                  onAction: () =>
                    loadPreview(previewTargetRule, previewCollectionId, previewMode),
                }}
              >
                <p>{previewError}</p>
              </Banner>
            )}

            {/* Collection & Mode Selector Controls */}
            {previewTargetRule && (
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="300" blockAlign="center">
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Rule: {previewTargetRule.name || "Unsaved rule"}
                  </Text>
                  <Badge tone="info">{getRuleTypeDisplay(previewTargetRule)}</Badge>
                </InlineStack>

                <InlineStack gap="200" blockAlign="center" wrap>
                  {previewTargetRule.collectionIds?.length > 1 && (
                    <Box minWidth="200px">
                      <Select
                        label="Collection"
                        labelHidden
                        options={(previewTargetRule.collectionIds || []).map((id) => ({
                          label: collectionNames.get(id) || id,
                          value: id,
                        }))}
                        value={previewCollectionId}
                        onChange={(colId) => {
                          setPreviewCollectionId(colId);
                          loadPreview(previewTargetRule, colId, previewMode);
                        }}
                        disabled={previewLoading}
                      />
                    </Box>
                  )}
                  <Box minWidth="180px">
                    <Select
                      label="Mode"
                      labelHidden
                      options={[
                        { label: "This rule alone", value: "rule_only" },
                        { label: "Combined with active rules", value: "combined" },
                      ]}
                      value={previewMode}
                      onChange={(mode) => {
                        setPreviewMode(mode);
                        loadPreview(previewTargetRule, previewCollectionId, mode);
                      }}
                      disabled={previewLoading}
                    />
                  </Box>
                </InlineStack>
              </InlineStack>
            )}

            {previewLoading && !previewData ? (
              <Box padding="800">
                <BlockStack gap="300" inlineAlign="center">
                  <Spinner size="large" accessibilityLabel="Loading preview data" />
                  <Text as="p" tone="subdued">
                    Fetching live Shopify products, variant costs, and calculating proposed ordering…
                  </Text>
                </BlockStack>
              </Box>
            ) : previewData ? (
              <BlockStack gap="400">
                {/* Summary Metrics */}
                <InlineGrid columns={{ xs: 1, sm: 3 }} gap={{ xs: "200", sm: "300" }}>
                  <SummaryCard
                    title="Products Evaluated"
                    value={previewData.productsEvaluated}
                    loading={previewLoading}
                  />
                  <SummaryCard
                    title="Products Changing Position"
                    value={previewData.productsChanged}
                    loading={previewLoading}
                  />
                  <SummaryCard
                    title="Products Unchanged"
                    value={previewData.productsUnchanged}
                    loading={previewLoading}
                  />
                </InlineGrid>

                {/* Warnings / Data limitations Banner */}
                {previewData.warnings && previewData.warnings.length > 0 && (
                  <Banner tone="warning" title="Data Notice">
                    <BlockStack gap="100">
                      {previewData.warnings.map((w, wIdx) => (
                        <Text as="p" variant="bodySm" key={`prev-warn-${wIdx}`}>
                          • {w}
                        </Text>
                      ))}
                    </BlockStack>
                  </Banner>
                )}

                {/* Comparison Table */}
                <Card padding="0">
                  {previewData.products.length === 0 ? (
                    <Box padding="600">
                      <Text as="p" tone="subdued" alignment="center">
                        This collection currently has no products to order.
                      </Text>
                    </Box>
                  ) : (
                    <IndexTable
                      resourceName={{ singular: "product", plural: "products" }}
                      itemCount={previewData.products.length}
                      selectable={false}
                      headings={[
                        { title: "Current" },
                        { title: "Product" },
                        { title: "Preview Position" },
                        { title: "Reason" },
                      ]}
                    >
                      {previewData.products.map((item, index) => {
                        const isPromoted = item.currentPosition > item.previewPosition;

                        return (
                          <IndexTable.Row
                            id={item.productId}
                            key={item.productId}
                            position={index}
                          >
                            <IndexTable.Cell>
                              <Text as="span" variant="bodyMd" tone="subdued">
                                #{item.currentPosition}
                              </Text>
                            </IndexTable.Cell>

                            <IndexTable.Cell>
                              <InlineStack gap="300" blockAlign="center" wrap={false}>
                                {item.imageUrl ? (
                                  <Thumbnail
                                    source={item.imageUrl}
                                    alt={item.title}
                                    size="small"
                                  />
                                ) : (
                                  <Box
                                    minWidth="40px"
                                    minHeight="40px"
                                    background="bg-surface-secondary"
                                    borderRadius="100"
                                  />
                                )}
                                <BlockStack gap="050">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {item.title}
                                  </Text>
                                  <InlineStack gap="200" wrap>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      ${Number(item.price).toFixed(2)}
                                    </Text>
                                    {item.inventory !== null &&
                                    item.inventory !== undefined ? (
                                      <Badge
                                        tone={
                                          item.inventory <= 0 ? "critical" : "info"
                                        }
                                      >
                                        {item.inventory <= 0
                                          ? "Out of stock"
                                          : `${item.inventory} in stock`}
                                      </Badge>
                                    ) : (
                                      <Badge tone="subdued">Untracked</Badge>
                                    )}
                                    {item.cost !== null && item.cost !== undefined && (
                                      <Text as="span" variant="bodySm" tone="subdued">
                                        Cost: ${Number(item.cost).toFixed(2)}
                                      </Text>
                                    )}
                                  </InlineStack>
                                </BlockStack>
                              </InlineStack>
                            </IndexTable.Cell>

                            <IndexTable.Cell>
                              {item.isChanged ? (
                                <InlineStack gap="100" blockAlign="center">
                                  <Badge tone={isPromoted ? "success" : "warning"}>
                                    {`#${item.currentPosition} → #${item.previewPosition} (${isPromoted ? "▲" : "▼"} ${Math.abs(item.previewPosition - item.currentPosition)})`}
                                  </Badge>
                                </InlineStack>
                              ) : (
                                <Text as="span" tone="subdued">
                                  #{item.previewPosition} (unchanged)
                                </Text>
                              )}
                            </IndexTable.Cell>

                            <IndexTable.Cell>
                              <Text as="span" variant="bodySm">
                                {item.reason}
                              </Text>
                            </IndexTable.Cell>
                          </IndexTable.Row>
                        );
                      })}
                    </IndexTable>
                  )}
                </Card>
              </BlockStack>
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteCandidate}
        onClose={() => !deleting && setDeleteCandidate(null)}
        title="Delete merchandising rule?"
        primaryAction={{
          content: "Delete rule",
          destructive: true,
          onAction: confirmDeleteRule,
          loading: deleting,
          disabled: deleting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteCandidate(null),
            disabled: deleting,
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete “{deleteCandidate?.name}”? This will remove the rule from
            your store’s merchandising configuration.
          </Text>
          {deleteError && (
            <Box paddingBlockStart="300">
              <Banner tone="critical" title="Unable to delete rule">
                <p>{deleteError}</p>
              </Banner>
            </Box>
          )}
        </Modal.Section>
      </Modal>

      {/* Apply Rules Confirmation Modal */}
      <Modal
        open={applyConfirmationOpen}
        onClose={() => !applying && setApplyConfirmationOpen(false)}
        title="Apply active merchandising rules?"
        primaryAction={{
          content: "Apply rules",
          onAction: handleApplyRules,
          loading: applying,
          disabled: applying || applyCollectionIds.length === 0,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setApplyConfirmationOpen(false),
            disabled: applying,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              The rule engine will calculate the optimal product order for each collection with active
              rules, apply the order to Shopify using the Admin GraphQL API, and verify the resulting
              positions.
            </Text>
            <Text as="p" tone="subdued">
              Target collections ({applyCollectionIds.length}):
            </Text>
            <BlockStack gap="100">
              {applyCollectionIds.map((id) => (
                <Text as="span" key={id} fontWeight="semibold">
                  • {collectionNames.get(id) || id}
                </Text>
              ))}
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
