import { useCallback, useEffect, useRef, useState } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Badge,
  Button,
  Select,
  TextField,
  EmptyState,
  Banner,
  Spinner,
  Divider,
  DataTable,
  Sheet,
  InlineGrid,
  Pagination,
  Checkbox,
  Collapsible,
  SkeletonBodyText,
  SkeletonDisplayText,
  Scrollable,
  useBreakpoints,
  Tooltip,
} from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import {
  RefreshIcon,
  XIcon,
} from "@shopify/polaris-icons";

import { recommendationsApi } from "../services/recommendations.client";
import PlanUpgradeGate from "../components/billing/PlanUpgradeGate.jsx";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];

// Status options for filter toolbar
const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Needs review", value: "PENDING" },
  { label: "Ready to fix (Reviewed)", value: "REVIEWED" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "ACTION_FAILED" },
  { label: "Dismissed", value: "DISMISSED" },
];

const PRIORITY_OPTIONS = [
  { label: "All priorities", value: "" },
  { label: "High priority", value: "HIGH" },
  { label: "Medium priority", value: "MEDIUM" },
  { label: "Low priority", value: "LOW" },
];

const MODULE_OPTIONS = [
  { label: "All intelligence modules", value: "" },
  { label: "Zero-Result Searches", value: "zero_result_searches" },
  { label: "Product Discoverability", value: "product_discoverability" },
  { label: "Collection Merchandising", value: "collection_merchandising" },
  { label: "Search Intelligence", value: "search_intelligence" },
  { label: "Trending Searches", value: "trending_searches" },
  { label: "Customer Discovery Journey", value: "customer_discovery_journey" },
  { label: "Missed Opportunities", value: "missed_opportunities" },
];

const SORT_OPTIONS = [
  { label: "Priority (High to Low)", value: "priority_desc" },
  { label: "Priority (Low to High)", value: "priority_asc" },
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Highest confidence", value: "confidence_desc" },
];

function humanize(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function priorityBadge(priority) {
  const value = String(priority || "").toUpperCase();
  if (value === "HIGH" || value === "CRITICAL") {
    return <Badge tone="critical">High priority</Badge>;  
  }
  if (value === "MEDIUM") {
    return <Badge tone="warning">Medium priority</Badge>;
  }
  if (value === "LOW") {
    return <Badge tone="info">Low priority</Badge>;
  }
  return <Badge>{humanize(value || "Low")}</Badge>;
}

function statusBadge(status, item = null) {
  const value = String(status || "PENDING").toUpperCase();

  switch (value) {
    case "COMPLETED": {
      const isManual =
        item?.executionState === "SUCCESS" ||
        item?.executionOutcome?.executedBy === "merchant";
      return <Badge tone="success">{isManual ? "Completed" : "Auto-fixed"}</Badge>;
    }
    case "IN_PROGRESS":
      return <Badge tone="warning">In progress</Badge>;
    case "REVIEWED":
      return <Badge tone="info">Ready to fix</Badge>;
    case "ACTION_FAILED":
      return <Badge tone="critical">Failed</Badge>;
    case "DISMISSED":
      return <Badge>Dismissed</Badge>;
    case "PENDING":
    default:
      return <Badge tone="attention">Needs review</Badge>;
  }
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getId(item) {
  return item?._id || item?.id || "";
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function formatResourceName(item) {
  if (item?.affectedProducts && item.affectedProducts.length > 0) {
    const first = item.affectedProducts[0];
    const title = first.title || first.name || first.productId || "Product";
    if (item.affectedProducts.length > 1) {
      return `${title} (+${item.affectedProducts.length - 1} more)`;
    }
    return title;
  }
  if (item?.targetQuery) {
    return `Search query: "${item.targetQuery}"`;
  }
  if (item?.affectedCollections && item.affectedCollections.length > 0) {
    const firstCol = item.affectedCollections[0];
    return `Collection: ${firstCol.title || firstCol.collectionId || "Collection"}`;
  }
  if (item?.targetResource && item.targetResource !== "Store Catalog") {
    return item.targetResource;
  }
  const mod = String(item?.sourceModule || item?.type || "").toLowerCase();
  if (mod.includes("journey") || mod.includes("dropoff")) {
    return "Store Discovery Funnel (Product to Cart)";
  }
  return "";
}

function isTagAction(actionType, item = null) {
  const t = String(actionType || item?.actionType || item?.type || "").toUpperCase();
  if (t === "ADD_SEARCH_TAG" || t === "CONNECT_SEARCH_CATALOG" || t === "ADD_TAG") return true;
  if (
    (t === "IMPROVE_DISCOVERABILITY" || t === "LOW_DISCOVERABILITY") &&
    Boolean(item?.proposedChanges?.tag) &&
    item?.proposedChanges?.collectionCount !== 0 &&
    !item?.suggestedAction?.toLowerCase().includes("collection")
  ) {
    return true;
  }
  return false;
}

function isCollectionRepositionAction(actionType) {
  const t = String(actionType || "").toUpperCase();
  return t === "REPOSITION_IN_COLLECTION" || t === "PROMOTE_IN_COLLECTION";
}

function isAddToCollectionAction(actionType, item = null) {
  const t = String(actionType || item?.actionType || item?.type || "").toUpperCase();
  if (t === "ADD_TO_COLLECTION") return true;
  if (
    (t === "IMPROVE_DISCOVERABILITY" || t === "LOW_DISCOVERABILITY") &&
    (item?.proposedChanges?.collectionCount === 0 ||
      item?.suggestedAction?.toLowerCase().includes("collection") ||
      !item?.proposedChanges?.tag)
  ) {
    return true;
  }
  return false;
}

function getExecutionCapability(item) {
  if (!item) return { executable: false, reason: "No recommendation selected." };
  const actionType = String(item.actionType || item.type || "").toUpperCase();

  // 1. Collection Repositioning
  if (isCollectionRepositionAction(actionType)) {
    const hasCollection = Boolean(
      item.affectedCollections?.length || item.proposedChanges?.collectionId
    );
    const hasProduct = Boolean(
      item.affectedProducts?.length || item.proposedChanges?.productId
    );
    if (!hasCollection || !hasProduct) {
      return {
        executable: false,
        reason:
          "Both a target collection and target product are required to reposition products in a collection.",
      };
    }
    return {
      executable: true,
      kind: "collection_reposition",
      targetCollection: item.affectedCollections?.[0] || null,
      targetProduct: item.affectedProducts?.[0] || null,
      description: "Applies new manual ordering in Shopify collection and verifies final arrangement.",
    };
  }

  // 2. Add to Collection (Checked before tagging!)
  if (isAddToCollectionAction(actionType, item)) {
    const targetProduct =
      item.affectedProducts?.[0] ||
      (item.proposedChanges?.productId
        ? {
            productId: item.proposedChanges.productId,
            title: item.proposedChanges.productTitle || "Product",
          }
        : null);

    if (!targetProduct) {
      return {
        executable: false,
        reason: "No target product is linked to this recommendation. Please verify catalog inventory.",
      };
    }

    return {
      executable: true,
      kind: "add_to_collection",
      targetProduct,
      description: "Adds product to selected storefront collection in Shopify Admin.",
    };
  }

  // 3. Product Tagging
  if (isTagAction(actionType, item)) {
    const targetProduct =
      item.affectedProducts?.[0] ||
      (item.proposedChanges?.productId
        ? {
            productId: item.proposedChanges.productId,
            title: item.proposedChanges.productTitle || "Product",
          }
        : null);

    if (!targetProduct) {
      return {
        executable: false,
        reason:
          "No catalog product is linked to this recommendation. Please verify catalog inventory before tagging.",
      };
    }
    return {
      executable: true,
      kind: "tag",
      targetProduct,
      description: "Appends the specified tag to the product in Shopify Admin and updates store catalog cache.",
    };
  }

  return {
    executable: false,
    reason: `Automated 1-click execution is not available for ${humanize(actionType)}. Please review and apply recommendations directly in the ${humanize(item.sourceModule || "source")} module or Shopify Admin.`,
  };
}

export default function RecommendationsPage() {
  const { smDown, mdDown } = useBreakpoints();
  const [isClientMobile, setIsClientMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsClientMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isMobile = smDown || mdDown || isClientMobile;
  const [recommendations, setRecommendations] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    needsReview: 0,
    highPriority: 0,
    completed: 0,
    pending: 0,
    reviewed: 0,
    inProgress: 0,
    dismissed: 0,
    actionFailed: 0,
    high: 0,
    medium: 0,
    low: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  // Available collections for dropdown
  const [storeCollections, setStoreCollections] = useState([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [sortBy, setSortBy] = useState("priority_desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const scrollToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const topEl = document.getElementById("recommendations-top");
      if (topEl) {
        topEl.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      }
    } catch (err) {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    scrollToTop();
  }, [page, scrollToTop]);

  // Loading & status feedback
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executingAction, setExecutingAction] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [upgradeRequired, setUpgradeRequired] = useState(null);

  // Recommendation details and fix actions share the right-side drawer.
  const [activeModalItem, setActiveModalItem] = useState(null);
  const recommendationRequestId = useRef(0);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalDetailsExpanded, setModalDetailsExpanded] = useState(false);
  const [actionFormData, setActionFormData] = useState({
    customTag: "",
    targetPosition: "1",
    selectedCollectionId: "",
    note: "",
  });
  const [actionConfirmed, setActionConfirmed] = useState(false);
  const [actionModalState, setActionModalState] = useState("initial"); // "initial" | "submitting" | "success" | "error"
  const [actionModalError, setActionModalError] = useState("");
  const [actionModalOutcome, setActionModalOutcome] = useState(null);

  // Fetch recommendations list
  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await recommendationsApi.list({
        status: statusFilter,
        priority: priorityFilter,
        sourceModule: moduleFilter,
        search: search.trim(),
        sortBy,
        page,
        limit: 15,
      });

      const items = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response)
            ? response
            : [];

      setRecommendations(items);

      if (response?.summary) {
        setSummary(response.summary);
      }

      if (response?.pagination) {
        setPagination(response.pagination);
      }
    } catch (err) {
      if (
        err.status === 403 ||
        err.response?.code === "UPGRADE_REQUIRED" ||
        err.message?.includes("not included in the") ||
        err.message?.includes("Upgrade to")
      ) {
        setUpgradeRequired(err.response?.requiredPlan || "premium");
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, moduleFilter, search, sortBy, page]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  // Load available collections once for selection dropdowns
  useEffect(() => {
    recommendationsApi
      .getCollections()
      .then((res) => {
        if (Array.isArray(res?.data)) {
          setStoreCollections(res.data);
        }
      })
      .catch((err) => {
        console.warn("[Recommendations] Collection fetch warning:", err?.message || err);
      });
  }, []);

  const hasActiveFilters = Boolean(
    statusFilter || priorityFilter || moduleFilter || search
  );

  function handleClearFilters() {
    setStatusFilter("");
    setPriorityFilter("");
    setModuleFilter("");
    setSearch("");
    setSortBy("priority_desc");
    setPage(1);
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    setNotice("");

    try {
      const res = await recommendationsApi.refresh();
      await loadRecommendations();
      const count = res?.data?.count ?? 0;
      const autoSolvedCount = res?.data?.autoSolved ?? 0;
      if (autoSolvedCount > 0) {
        setNotice(
          `Recommendations refreshed. ${count} active recommendation(s) generated, and ${autoSolvedCount} previously unresolved item(s) were automatically resolved based on updated store data.`
        );
      } else {
        setNotice(
          `Recommendations refreshed. ${count} active recommendation(s) generated from live intelligence modules.`
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  // Open recommendation details and actions in the right-side drawer.
  async function openReviewAndFix(item) {
    const requestId = recommendationRequestId.current + 1;
    recommendationRequestId.current = requestId;
    setActiveModalItem(item);
    setModalLoading(true);
    setModalDetailsExpanded(false);
    setActionConfirmed(false);
    setActionModalState("initial");
    setActionModalError("");
    setActionModalOutcome(null);

    // Initial form defaults
    const defaultTag =
      item?.proposedChanges?.tag ||
      (item?.targetQuery
        ? `trending-${item.targetQuery.replace(/\s+/g, "-").toLowerCase()}`
        : "discoverable");
    const defaultPosition = String(
      item?.proposedChanges?.recommendedPosition ??
      item?.proposedChanges?.targetPosition ??
      1
    );
    const defaultColId =
      item?.affectedCollections?.[0]?.collectionId ||
      item?.proposedChanges?.collectionId ||
      (storeCollections[0]?.id || "");

    setActionFormData({
      customTag: defaultTag,
      targetPosition: defaultPosition,
      selectedCollectionId: defaultColId,
      note: "",
    });

    try {
      const response = await recommendationsApi.getDetails(getId(item));
      const details = response?.data || response?.recommendation || response;
      if (details && requestId === recommendationRequestId.current) {
        setActiveModalItem(details);
      }
    } catch (err) {
      if (requestId === recommendationRequestId.current) {
        setActionModalError(
          `Could not load recommendation details: ${getErrorMessage(err)}`
        );
        setActionModalState("error");
      }
    } finally {
      if (requestId === recommendationRequestId.current) {
        setModalLoading(false);
      }
    }
  }

  function closeRecommendationDrawer() {
    if (executingAction) return;
    recommendationRequestId.current += 1;
    setActiveModalItem(null);
    setModalLoading(false);
  }

  // Execute Action from Modal
  async function handleExecuteAction() {
    if (!activeModalItem) return;
    const id = getId(activeModalItem);
    if (!id) return;

    const capability = getExecutionCapability(activeModalItem);
    if (!capability.executable) {
      setActionModalError(capability.reason);
      setActionModalState("error");
      return;
    }

    if (capability.kind === "tag" && !actionFormData.customTag.trim()) {
      setActionModalError("Product tag cannot be empty.");
      setActionModalState("error");
      return;
    }

    if (capability.kind === "collection_reposition") {
      const pos = Number.parseInt(actionFormData.targetPosition, 10);
      if (!Number.isInteger(pos) || pos < 1) {
        setActionModalError("Target position must be a positive integer (1 or higher).");
        setActionModalState("error");
        return;
      }
    }

    if (capability.kind === "add_to_collection" && !actionFormData.selectedCollectionId) {
      setActionModalError("Please select a target collection.");
      setActionModalState("error");
      return;
    }

    if (actionFormData.note.length > 500) {
      setActionModalError("Execution note cannot exceed 500 characters.");
      setActionModalState("error");
      return;
    }

    setExecutingAction(true);
    setActionModalError("");
    setActionModalState("submitting");

    try {
      const payload = {
        actionType: activeModalItem.actionType || activeModalItem.type,
        note: actionFormData.note.trim(),
      };

      if (capability.kind === "tag") {
        payload.customTag = actionFormData.customTag.trim();
        payload.productId =
          capability.targetProduct?.productId ||
          activeModalItem.affectedProducts?.[0]?.productId;
      } else if (capability.kind === "collection_reposition") {
        payload.targetPosition = Number.parseInt(actionFormData.targetPosition, 10);
        payload.collectionId =
          capability.targetCollection?.collectionId ||
          activeModalItem.affectedCollections?.[0]?.collectionId;
        payload.productId =
          capability.targetProduct?.productId ||
          activeModalItem.affectedProducts?.[0]?.productId;
      } else if (capability.kind === "add_to_collection") {
        payload.collectionId = actionFormData.selectedCollectionId;
        payload.productId =
          capability.targetProduct?.productId ||
          activeModalItem.affectedProducts?.[0]?.productId;
      }

      const res = await recommendationsApi.executeAction(id, payload);
      const updatedItem = res?.data || res?.recommendation;
      const outcome = updatedItem?.executionOutcome || res?.data?.executionOutcome;

      setActionModalState("success");
      setActionModalOutcome(
        outcome || {
          summary: res?.message || "Change applied and verified successfully in Shopify.",
          executedAt: new Date(),
        }
      );

      setNotice(
        res?.message ||
          outcome?.summary ||
          `Recommendation applied successfully on ${formatResourceName(activeModalItem)}.`
      );

      // Refresh list and summary cards immediately
      await loadRecommendations();
    } catch (err) {
      const msg = getErrorMessage(err);
      setActionModalError(msg);
      setActionModalState("error");
      loadRecommendations().catch(() => {});
    } finally {
      setExecutingAction(false);
    }
  }

  // Dismiss Recommendation
  async function handleDismiss() {
    if (!activeModalItem) return;
    const id = getId(activeModalItem);
    if (!id) return;

    setDismissing(true);
    try {
      await recommendationsApi.dismiss(id, {
        reason: "Merchant dismissed from recommendations dashboard",
        note: actionFormData.note.trim(),
      });
      setNotice(`Recommendation "${activeModalItem.title}" dismissed.`);
      closeRecommendationDrawer();
      await loadRecommendations();
    } catch (err) {
      setActionModalError(getErrorMessage(err));
    } finally {
      setDismissing(false);
    }
  }

  // Calculated 4 summary card values
  const needsReviewCount = summary.needsReview ?? (summary.pending + summary.reviewed);
  const highPriorityCount = summary.highPriority ?? summary.high;
  const completedCount = summary.completed ?? 0;
  const totalCount = summary.total ?? 0;

  if (upgradeRequired) {
    return (
      <Page
        title="Merchandising Recommendations"
        subtitle="Find store issues and fix them with clear, actionable recommendations."
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
          <Box id="recommendations-top" />

          {/* Header */}
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="center" gap="200">
              <Text as="h1" variant="headingLg" fontWeight="bold">
                Merchandising Recommendations
              </Text>

              <Tooltip content="Refresh recommendations">
                <Button
                  icon={RefreshIcon}
                  onClick={handleRefresh}
                  loading={refreshing}
                  accessibilityLabel="Refresh recommendations"
                >
                  {isMobile ? undefined : "Refresh"}
                </Button>
              </Tooltip>
            </InlineStack>

            <Text as="p" variant="bodySm" tone="subdued">
              Find store issues and fix them with clear, actionable recommendations.
            </Text>
          </BlockStack>

          {/* Alerts and Notifications */}
          {error && (
            <Banner title="Operation failed" tone="critical" onDismiss={() => setError("")}>
              <p>{error}</p>
            </Banner>
          )}

          {notice && (
            <Banner tone="success" onDismiss={() => setNotice("")}>
              <p>{notice}</p>
            </Banner>
          )}

          {/* =========================================================================
              FOUR SUMMARY CARDS
              ========================================================================= */}
          <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap={{ xs: "200", sm: "300", md: "400" }}>
            <Card padding={{ xs: "300", sm: "400" }}>
              <BlockStack gap="050">
                <Text as="p" tone="subdued" variant="bodySm" truncate>
                  Needs review
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {needsReviewCount}
                </Text>
                <Text as="p" variant="bodyXs" tone="subdued" truncate>
                  Merchant inspection
                </Text>
              </BlockStack>
            </Card>

            <Card padding={{ xs: "300", sm: "400" }}>
              <BlockStack gap="050">
                <Text as="p" tone="subdued" variant="bodySm" truncate>
                  High priority
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold" tone={highPriorityCount > 0 ? "critical" : undefined}>
                  {highPriorityCount}
                </Text>
                <Text as="p" variant="bodyXs" tone="subdued" truncate>
                  High commercial impact
                </Text>
              </BlockStack>
            </Card>

            <Card padding={{ xs: "300", sm: "400" }}>
              <BlockStack gap="050">
                <Text as="p" tone="subdued" variant="bodySm" truncate>
                  Completed
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold" tone={completedCount > 0 ? "success" : undefined}>
                  {completedCount}
                </Text>
                <Text as="p" variant="bodyXs" tone="subdued" truncate>
                  Executed & verified
                </Text>
              </BlockStack>
            </Card>

            <Card padding={{ xs: "300", sm: "400" }}>
              <BlockStack gap="050">
                <Text as="p" tone="subdued" variant="bodySm" truncate>
                  Total
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {totalCount}
                </Text>
                <Text as="p" variant="bodyXs" tone="subdued" truncate>
                  Across all modules
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>

          {/* =========================================================================
              COMPACT FILTER TOOLBAR
              ========================================================================= */}
          <Card padding={{ xs: "300", sm: "400" }}>
            <BlockStack gap="200">
              <TextField
                label="Search"
                labelHidden
                placeholder="Search by title, product, or issue"
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                clearButton
                onClearButtonClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                autoComplete="off"
              />

              <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="200">
                <Select
                  label="Status"
                  labelHidden
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                />

                <Select
                  label="Priority"
                  labelHidden
                  options={PRIORITY_OPTIONS}
                  value={priorityFilter}
                  onChange={(val) => {
                    setPriorityFilter(val);
                    setPage(1);
                  }}
                />

                <Select
                  label="Module"
                  labelHidden
                  options={MODULE_OPTIONS}
                  value={moduleFilter}
                  onChange={(val) => {
                    setModuleFilter(val);
                    setPage(1);
                  }}
                />

                <Select
                  label="Sort by"
                  labelHidden
                  options={SORT_OPTIONS}
                  value={sortBy}
                  onChange={(val) => setSortBy(val)}
                />
              </InlineGrid>

              {hasActiveFilters && (
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Filters applied
                  </Text>
                  <Button size="slim" variant="plain" onClick={handleClearFilters}>
                    Clear all filters
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>

        {/* =========================================================================
            RECOMMENDATION LIST
            ========================================================================= */}
        {loading ? (
          <Card padding="500">
            <BlockStack gap="400">
              <InlineStack gap="300" blockAlign="center">
                <Spinner size="small" />
                <Text as="span" variant="bodyMd">
                  Loading recommendations from store data…
                </Text>
              </InlineStack>
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={3} />
            </BlockStack>
          </Card>
        ) : recommendations.length === 0 ? (
          <Card padding="500">
            <EmptyState
              heading={
                hasActiveFilters
                  ? "No recommendations match your filters"
                  : "No merchandising issues detected"
              }
              image=""
            >
              <BlockStack gap="200">
                <Text as="p" tone="subdued">
                  {hasActiveFilters
                    ? "Try adjusting search terms or clearing your filters."
                    : "Your store catalog, collections, and search queries are performing well. Click 'Refresh recommendations' to re-scan for new issues."}
                </Text>
                <InlineStack align="center" gap="200">
                  {hasActiveFilters ? (
                    <Button onClick={handleClearFilters}>Reset filters</Button>
                  ) : (
                    <Button variant="primary" onClick={handleRefresh} loading={refreshing}>
                      Refresh recommendations
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="300">
            {smDown ? (
              <BlockStack gap="200">
                {recommendations.map((item, index) => {
                  const id = getId(item) || `recommendation-${index}`;
                  const title = item.title || "Untitled recommendation";
                  const isCompleted = item.status === "COMPLETED";
                  const isDismissed = item.status === "DISMISSED";

                  return (
                    <Card key={id} padding="300">
                      <BlockStack gap="300">
                        <Text as="h3" variant="bodyMd" fontWeight="semibold" breakWord>
                          {title}
                        </Text>
                        <InlineStack gap="150" blockAlign="center" wrap>
                          {priorityBadge(item.priority)}
                          {statusBadge(item.status, item)}
                          <Badge tone="subdued">
                            {humanize(item.sourceModule || "General")}
                          </Badge>
                        </InlineStack>
                        <Button
                          fullWidth
                          variant={isCompleted || isDismissed ? "secondary" : "primary"}
                          onClick={() => openReviewAndFix(item)}
                          accessibilityLabel={`${isCompleted ? "View result for" : isDismissed ? "View details for" : "Review and fix"} ${title}`}
                        >
                          {isCompleted
                            ? "View result"
                            : isDismissed
                              ? "View details"
                              : "Review & Fix"}
                        </Button>
                      </BlockStack>
                    </Card>
                  );
                })}
              </BlockStack>
            ) : (
              <Card padding="0">
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={[
                    "Recommendation",
                    "Priority",
                    "Status and module",
                    "Action",
                  ]}
                  verticalAlign="middle"
                  rows={recommendations.map((item, index) => {
                    const id = getId(item) || `recommendation-${index}`;
                    const title = item.title || "Untitled recommendation";
                    const isCompleted = item.status === "COMPLETED";
                    const isDismissed = item.status === "DISMISSED";

                    return [
                      <Text
                        key={`${id}-title`}
                        as="span"
                        variant="bodyMd"
                        fontWeight="semibold"
                        breakWord
                      >
                        {title}
                      </Text>,
                      priorityBadge(item.priority),
                      <BlockStack key={`${id}-status`} gap="100">
                        {statusBadge(item.status, item)}
                        <Badge tone="subdued">
                          {humanize(item.sourceModule || "General")}
                        </Badge>
                      </BlockStack>,
                      <InlineStack key={`${id}-action`} align="end">
                        <Button
                          variant={isCompleted || isDismissed ? "secondary" : "primary"}
                          onClick={() => openReviewAndFix(item)}
                          accessibilityLabel={`${isCompleted ? "View result for" : isDismissed ? "View details for" : "Review and fix"} ${title}`}
                        >
                          {isCompleted
                            ? "View result"
                            : isDismissed
                              ? "View details"
                              : "Review & Fix"}
                        </Button>
                      </InlineStack>,
                    ];
                  })}
                />
              </Card>
            )}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <Box paddingBlockStart="300">
                <InlineStack
                  align="space-between"
                  blockAlign="center"
                  gap="200"
                  wrap
                >
                  <Text as="span" variant="bodySm" tone="subdued">
                    Showing {((pagination.page - 1) * pagination.limit) + 1}–
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                    {pagination.total} recommendations
                  </Text>
                  <Pagination
                    hasPrevious={pagination.page > 1}
                    onPrevious={() => {
                      setPage((p) => Math.max(1, p - 1));
                      scrollToTop();
                    }}
                    hasNext={pagination.page < pagination.totalPages}
                    onNext={() => {
                      setPage((p) => Math.min(pagination.totalPages, p + 1));
                      scrollToTop();
                    }}
                  />
                </InlineStack>
              </Box>
            )}
          </BlockStack>
        )}
      </BlockStack>
    </Box>

      {/* =========================================================================
          RECOMMENDATION DETAILS DRAWER
          ========================================================================= */}
      {(() => {
        if (!activeModalItem) return null;
        const capability = getExecutionCapability(activeModalItem);
        const resourceName = formatResourceName(activeModalItem);
        const isCompleted = activeModalItem.status === "COMPLETED";
        const isDismissed = activeModalItem.status === "DISMISSED";

        let validationError = "";
        if (capability.executable) {
          if (capability.kind === "tag" && !actionFormData.customTag.trim()) {
            validationError = "Product tag cannot be empty.";
          } else if (capability.kind === "collection_reposition") {
            const pos = Number.parseInt(actionFormData.targetPosition, 10);
            if (!Number.isInteger(pos) || pos < 1) {
              validationError = "Target position must be 1 or higher.";
            }
          } else if (capability.kind === "add_to_collection" && !actionFormData.selectedCollectionId) {
            validationError = "Please select a target collection.";
          }
          if (actionFormData.note.length > 500) {
            validationError = "Execution note exceeds 500 characters.";
          }
        }

        return (
          <Sheet
            open={Boolean(activeModalItem)}
            onClose={closeRecommendationDrawer}
            accessibilityLabel={
              activeModalItem.title || "Recommendation details"
            }
          >
            <Scrollable
              vertical
              focusable
              scrollbarWidth="thin"
              style={{ height: "100%" }}
            >
              <Box padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="400">
                <InlineStack
                  align="space-between"
                  blockAlign="start"
                  gap="200"
                >
                  <Text as="h2" variant="headingLg" breakWord>
                    {activeModalItem.title || "Recommendation details"}
                  </Text>
                  <Button
                    icon={XIcon}
                    variant="tertiary"
                    accessibilityLabel="Close recommendation details"
                    disabled={executingAction}
                    onClick={closeRecommendationDrawer}
                  />
                </InlineStack>
              {modalLoading ? (
                <Box padding="600">
                  <InlineStack align="center" gap="300">
                    <Spinner size="small" />
                    <Text as="span">Loading store evidence…</Text>
                  </InlineStack>
                </Box>
              ) : (
                <BlockStack gap="400">
                  {/* SUCCESS STATE BANNER */}
                  {actionModalState === "success" && (
                    <Banner tone="success" title="Change verified & applied">
                      <BlockStack gap="150">
                        <Text as="p" fontWeight="medium">
                          {actionModalOutcome?.summary ||
                            "Merchandising update was successfully applied and verified in Shopify."}
                        </Text>
                        <Text as="p" variant="bodyXs" tone="subdued">
                          Verified at: {formatDate(actionModalOutcome?.executedAt || new Date())}
                        </Text>
                        {actionFormData.note && (
                          <Text as="p" variant="bodySm">
                            Documented note: &ldquo;{actionFormData.note}&rdquo;
                          </Text>
                        )}
                      </BlockStack>
                    </Banner>
                  )}

                  {/* ERROR STATE BANNER */}
                  {actionModalState === "error" && actionModalError && (
                    <Banner
                      tone="critical"
                      title={
                        actionModalError.startsWith(
                          "Could not load recommendation details:"
                        )
                          ? "Could not load recommendation details"
                          : "Could not complete action in Shopify"
                      }
                    >
                      <BlockStack gap="100">
                        <Text as="p">{actionModalError}</Text>
                        <Text as="p" variant="bodyXs" tone="subdued">
                          Your store was not marked as updated. You can adjust the settings below and retry.
                        </Text>
                      </BlockStack>
                    </Banner>
                  )}

                  {/* Top Badges Strip */}
                  <Card background="bg-surface-secondary" padding="300">
                    <InlineStack align="space-between" blockAlign="center" wrap>
                      <InlineStack gap="200" wrap>
                        {priorityBadge(activeModalItem.priority)}
                        {statusBadge(activeModalItem.status, activeModalItem)}
                        <Badge tone="info">
                          {humanize(activeModalItem.sourceModule || "General")}
                        </Badge>
                      </InlineStack>
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Last updated: {formatDate(activeModalItem.updatedAt || activeModalItem.createdAt)}
                      </Text>
                    </InlineStack>
                  </Card>

                  {/* SECTION A: WHAT'S THE PROBLEM? */}
                  <Card padding="300">
                    <BlockStack gap="150">
                      <Text as="h3" variant="headingSm">
                        What&rsquo;s the problem?
                      </Text>
                      <Text as="p">
                        {activeModalItem.problemDetected ||
                          activeModalItem.description ||
                          "Store analysis detected a merchandising bottleneck affecting discoverability or conversion."}
                      </Text>
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Affected resource:
                        </Text>
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {resourceName}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  {/* SECTION B: WHY DOES IT MATTER? */}
                  <Card padding="300">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        Why does it matter?
                      </Text>
                      <Text as="p" tone="subdued">
                        {activeModalItem.whyItMatters ||
                          "Addressing discoverability and search gaps directly improves conversion and prevents lost shopper visits."}
                      </Text>

                      {/* Supporting evidence cards */}
                      {Array.isArray(activeModalItem.evidence) && activeModalItem.evidence.length > 0 ? (
                        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="200">
                          {activeModalItem.evidence.map((ev, idx) => (
                            <Card key={idx} background="bg-surface-secondary" padding="200">
                              <BlockStack gap="050">
                                <Text as="p" variant="bodyXs" tone="subdued" fontWeight="medium">
                                  {ev.metric || "Evidence"}
                                </Text>
                                <Text as="p" variant="headingSm" fontWeight="bold">
                                  {typeof ev.value === "object" ? "—" : String(ev.value ?? "—")}
                                </Text>
                                {ev.comparisonValue && (
                                  <Text as="p" variant="bodyXs" tone="info">
                                    {ev.comparisonValue}
                                  </Text>
                                )}
                                {ev.explanation && (
                                  <Text as="p" variant="bodyXs" tone="subdued">
                                    {ev.explanation}
                                  </Text>
                                )}
                              </BlockStack>
                            </Card>
                          ))}
                        </InlineGrid>
                      ) : (
                        <Text as="p" variant="bodyXs" tone="subdued">
                          No additional numerical metrics recorded for this recommendation.
                        </Text>
                      )}
                    </BlockStack>
                  </Card>

                  {/* SECTION C: RECOMMENDED FIX */}
                  <Card padding="300">
                    <BlockStack gap="150">
                      <Text as="h3" variant="headingSm">
                        Recommended fix
                      </Text>
                      <Text as="p">
                        {activeModalItem.suggestedAction ||
                          "Review catalog settings and make the recommended merchandising adjustment."}
                      </Text>
                    </BlockStack>
                  </Card>

                  {/* SECTION D: WHAT WILL CHANGE? */}
                  {actionModalState !== "success" && (
                    <Card padding="300">
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">
                          What will change?
                        </Text>

                        {/* Tagging Action Input */}
                        {capability.kind === "tag" && (
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm">
                              <Text as="span" fontWeight="semibold">Product name: </Text>
                              <Text as="span">{capability.targetProduct?.title || formatResourceName(activeModalItem)}</Text>
                            </Text>
                            <TextField
                              label="Exact product tag to add in Shopify"
                              value={actionFormData.customTag}
                              onChange={(val) => {
                                setActionFormData((prev) => ({ ...prev, customTag: val }));
                                setActionModalError("");
                              }}
                              helpText="Appends this tag to the Shopify product so shoppers and storefront search filters find it."
                              autoComplete="off"
                              disabled={executingAction || isCompleted}
                            />
                            <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                              <Text as="p" variant="bodySm">
                                <Text as="span" fontWeight="semibold">Expected change: </Text>
                                <Text as="span">
                                  Appends tag &ldquo;{actionFormData.customTag || "tag"}&rdquo; to &ldquo;{capability.targetProduct?.title || "Product"}&rdquo;. Verified in Shopify product tags.
                                </Text>
                              </Text>
                            </Box>
                          </BlockStack>
                        )}

                        {/* Collection Repositioning Input */}
                        {capability.kind === "collection_reposition" && (
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm">
                              <Text as="span" fontWeight="semibold">Product name: </Text>
                              <Text as="span">{capability.targetProduct?.title || formatResourceName(activeModalItem)}</Text>
                            </Text>
                            <Text as="p" variant="bodySm">
                              <Text as="span" fontWeight="semibold">Collection: </Text>
                              <Text as="span">{capability.targetCollection?.title || capability.targetCollection?.collectionId || "Collection"}</Text>
                            </Text>
                            <TextField
                              label="Target position in collection"
                              type="number"
                              min="1"
                              value={actionFormData.targetPosition}
                              onChange={(val) => {
                                setActionFormData((prev) => ({ ...prev, targetPosition: val }));
                                setActionModalError("");
                              }}
                              helpText="Slot #1 places the product at the top of the collection. Verified via Shopify GraphQL."
                              autoComplete="off"
                              disabled={executingAction || isCompleted}
                            />
                            <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                              <Text as="p" variant="bodySm">
                                <Text as="span" fontWeight="semibold">Expected change: </Text>
                                <Text as="span">
                                  Moves &ldquo;{capability.targetProduct?.title || "Product"}&rdquo; to position #{actionFormData.targetPosition || "1"} in &ldquo;{capability.targetCollection?.title || "Collection"}&rdquo;.
                                </Text>
                              </Text>
                            </Box>
                          </BlockStack>
                        )}

                        {/* Add to Collection Input */}
                        {capability.kind === "add_to_collection" && (() => {
                          const productName = capability.targetProduct?.title || formatResourceName(activeModalItem);
                          const selectedCol = storeCollections.find(
                            (c) => (c.id || c.collectionId) === actionFormData.selectedCollectionId
                          );
                          const colTitle = selectedCol?.title || "selected collection";

                          return (
                            <BlockStack gap="200">
                              <Text as="p" variant="bodySm">
                                <Text as="span" fontWeight="semibold">Product name: </Text>
                                <Text as="span">{productName}</Text>
                              </Text>
                              <Select
                                label="Selected collection"
                                options={
                                  storeCollections.length > 0
                                    ? storeCollections.map((c) => ({
                                        label: c.title,
                                        value: c.id || c.collectionId,
                                      }))
                                    : [{ label: "No collections available", value: "" }]
                                }
                                value={actionFormData.selectedCollectionId}
                                onChange={(val) => {
                                  setActionFormData((prev) => ({ ...prev, selectedCollectionId: val }));
                                  setActionModalError("");
                                }}
                                disabled={executingAction || isCompleted}
                                helpText="Select which storefront collection this product should be placed into."
                              />
                              <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                                <Text as="p" variant="bodySm">
                                  <Text as="span" fontWeight="semibold">Expected collection assignment: </Text>
                                  <Text as="span">
                                    Product &ldquo;{productName}&rdquo; will be added to the collection &ldquo;{colTitle}&rdquo;. Verified via Shopify GraphQL.
                                  </Text>
                                </Text>
                              </Box>
                            </BlockStack>
                          );
                        })()}

                        {/* Unsupported / Manual guidance */}
                        {!capability.executable && (
                          <Banner tone="info" title="Manual store adjustment required">
                            <BlockStack gap="150">
                              <Text as="p">{capability.reason}</Text>
                              {activeModalItem.sourcePath && (
                                <InlineStack>
                                  <Button url={activeModalItem.sourcePath}>
                                    Open in {humanize(activeModalItem.sourceModule || "Source")} module
                                  </Button>
                                </InlineStack>
                              )}
                            </BlockStack>
                          </Banner>
                        )}
                      </BlockStack>
                    </Card>
                  )}

                  {/* SECTION E: CONFIRM & EXECUTE (When not completed) */}
                  {!isCompleted && !isDismissed && actionModalState !== "success" && capability.executable && (
                    <Card background="bg-surface-secondary" padding="300">
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">
                          Confirm & execute
                        </Text>

                        {/* Optional Execution Note */}
                        <TextField
                          label="Execution note (optional)"
                          value={actionFormData.note}
                          onChange={(val) => setActionFormData((prev) => ({ ...prev, note: val }))}
                          placeholder="e.g. Promoted for seasonal campaign"
                          helpText={`Document the business reason for this change (${actionFormData.note.length}/500)`}
                          autoComplete="off"
                          error={actionFormData.note.length > 500 ? "Note exceeds 500 characters" : undefined}
                          disabled={executingAction}
                        />

                        {/* Explicit Confirmation Checkbox */}
                        <Checkbox
                          label="I confirm that I want to apply this change to my Shopify store."
                          checked={actionConfirmed}
                          onChange={setActionConfirmed}
                          disabled={executingAction}
                        />
                      </BlockStack>
                    </Card>
                  )}

                  {/* PREVIOUS EXECUTION OUTCOME (if already executed) */}
                  {activeModalItem.executionOutcome?.executedAt && (
                    <Banner
                      tone={
                        activeModalItem.executionState === "SUCCESS"
                          ? "success"
                          : "critical"
                      }
                      title="Verified execution outcome"
                    >
                      <BlockStack gap="100">
                        <Text as="p">
                          {activeModalItem.executionOutcome.summary ||
                            `Execution state: ${activeModalItem.executionState}`}
                        </Text>
                        {activeModalItem.executionOutcome.error && (
                          <Text as="p" tone="critical">
                            Error: {activeModalItem.executionOutcome.error}
                          </Text>
                        )}
                        {activeModalItem.executionOutcome.note && (
                          <Text as="p" variant="bodySm">
                            Merchant note: &ldquo;{activeModalItem.executionOutcome.note}&rdquo;
                          </Text>
                        )}
                        <Text as="p" variant="bodyXs" tone="subdued">
                          Executed by {activeModalItem.executionOutcome.executedBy || "merchant"} at{" "}
                          {formatDate(activeModalItem.executionOutcome.executedAt)}
                        </Text>
                      </BlockStack>
                    </Banner>
                  )}

                  {/* OPTIONAL TECHNICAL DETAILS COLLAPSIBLE */}
                  <Box paddingBlockStart="100">
                    <Button
                      variant="plain"
                      size="slim"
                      onClick={() => setModalDetailsExpanded(!modalDetailsExpanded)}
                    >
                      {modalDetailsExpanded ? "Hide technical details" : "View technical details & evidence"}
                    </Button>

                    <Collapsible open={modalDetailsExpanded} id="technical-details-collapsible">
                      <Box paddingBlockStart="200">
                        <Card background="bg-surface-tertiary" padding="200">
                          <BlockStack gap="150">
                            <Text as="p" variant="bodyXs" fontWeight="semibold">
                              Technical Metadata
                            </Text>
                            <InlineGrid columns={{ xs: 2, sm: 4 }} gap="150">
                              <BlockStack gap="050">
                                <Text as="span" variant="bodyXs" tone="subdued">Confidence</Text>
                                <Text as="span" variant="bodySm" fontWeight="bold">
                                  {activeModalItem.confidence ?? 0}%
                                </Text>
                              </BlockStack>
                              <BlockStack gap="050">
                                <Text as="span" variant="bodyXs" tone="subdued">Priority score</Text>
                                <Text as="span" variant="bodySm" fontWeight="bold">
                                  {activeModalItem.priorityScore ?? 0}/100
                                </Text>
                              </BlockStack>
                              <BlockStack gap="050">
                                <Text as="span" variant="bodyXs" tone="subdued">Action type</Text>
                                <Text as="span" variant="bodySm">
                                  {activeModalItem.actionType || "N/A"}
                                </Text>
                              </BlockStack>
                              <BlockStack gap="050">
                                <Text as="span" variant="bodyXs" tone="subdued">Source module</Text>
                                <Text as="span" variant="bodySm">
                                  {activeModalItem.sourceModule || "General"}
                                </Text>
                              </BlockStack>
                            </InlineGrid>
                            {activeModalItem.fingerprint && (
                              <Text as="p" variant="bodyXs" tone="subdued">
                                Fingerprint: <code>{activeModalItem.fingerprint.slice(0, 16)}…</code>
                              </Text>
                            )}
                          </BlockStack>
                        </Card>
                      </Box>
                    </Collapsible>
                  </Box>
                </BlockStack>
              )}
                <Divider />
                <InlineStack align="end" gap="200" wrap>
                  {!isCompleted &&
                    !isDismissed &&
                    actionModalState !== "success" && (
                      <Button
                        tone="critical"
                        onClick={handleDismiss}
                        loading={dismissing}
                        disabled={executingAction}
                      >
                        Dismiss
                      </Button>
                    )}
                  {activeModalItem.sourcePath && (
                    <Button
                      url={activeModalItem.sourcePath}
                      disabled={executingAction}
                    >
                      Open in {humanize(activeModalItem.sourceModule || "Source")} module
                    </Button>
                  )}
                  {actionModalState === "success" || isCompleted || isDismissed ? (
                    <Button
                      variant="primary"
                      onClick={closeRecommendationDrawer}
                    >
                      Close
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={handleExecuteAction}
                      loading={executingAction}
                      disabled={
                        !actionConfirmed ||
                        executingAction ||
                        !capability.executable ||
                        Boolean(validationError)
                      }
                    >
                      {actionModalState === "error" ? "Retry fix" : "Apply fix now"}
                    </Button>
                  )}
                </InlineStack>
                </BlockStack>
              </Box>
            </Scrollable>
          </Sheet>
        );
      })()}
    </Page>
  );
}