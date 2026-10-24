import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getMerchandisingOverview } from "../services/merchandisingApi.js";
import PlanUpgradeGate from "../components/billing/PlanUpgradeGate.jsx";
import MerchandisingSummaryCards from "../components/merchandising/MerchandisingSummaryCards.jsx";
import CollectionPerformanceTable from "../components/merchandising/CollectionPerformanceTable.jsx";
import CollectionDetailsModal from "../components/merchandising/CollectionDetailsModal.jsx";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

function getDateRangeFromPreset(preset) {
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

function formatDate(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function CollectionMerchandisingRoute() {
  const { shop } = useLoaderData();
  const [datePreset, setDatePreset] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);

  const { startDate, endDate } = useMemo(
    () => getDateRangeFromPreset(datePreset),
    [datePreset]
  );

  const fetchData = useCallback(
    async (manualRefresh = false) => {
      if (manualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const overview = await getMerchandisingOverview({
          shop,
          startDate,
          endDate,
        });
        setOverviewData(overview);
      } catch (err) {
        console.error("[ShopLens] Merchandising data fetch error:", err);
        if (
          err.status === 403 ||
          err.response?.code === "UPGRADE_REQUIRED" ||
          err.message?.includes("not included in the") ||
          err.message?.includes("Upgrade to")
        ) {
          setUpgradeRequired(err.response?.requiredPlan || "pro");
        } else {
          setError(err.message || "Failed to load collection merchandising data.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [shop, startDate, endDate]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Deep-link auto-select when ?collectionId= is provided in URL
  useEffect(() => {
    if (typeof window !== "undefined" && overviewData?.collections?.length) {
      const params = new URLSearchParams(window.location.search);
      const collectionIdParam = params.get("collectionId");
      if (collectionIdParam) {
        const match = overviewData.collections.find((c) =>
          String(c.id).includes(collectionIdParam) ||
          String(c.shopifyCollectionId || "").includes(collectionIdParam) ||
          String(c.title || "").toLowerCase() === collectionIdParam.toLowerCase()
        );
        if (match) {
          setSelectedCollection(match);
        }
      }
    }
  }, [overviewData]);

  const attentionCollection = overviewData?.collections.find(
    (collection) => collection.performance === "Needs Attention"
  );

  if (upgradeRequired) {
    return (
      <Page fullWidth>
        <Box
          paddingInline={{ xs: "400", sm: "600", md: "700" }}
          paddingBlockStart={{ xs: "300", sm: "400" }}
          paddingBlockEnd={{ xs: "400", sm: "500" }}
        >
          <PlanUpgradeGate
            plan={upgradeRequired}
            title="Pro Feature"
            description="Upgrade to Pro to unlock this feature."
          />
        </Box>
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
                Collection Merchandising Intelligence
              </Text>
              <Text variant="bodySm" tone="subdued">
                Understand which collections perform well and which products need better positioning.
              </Text>
            </BlockStack>
            <Button
              icon={RefreshIcon}
              loading={refreshing}
              onClick={() => fetchData(true)}
              accessibilityLabel="Refresh collection merchandising"
            >
              Refresh
            </Button>
          </InlineStack>

          {/* Controls Bar */}
          <Card padding={{ xs: "300", sm: "400" }}>
            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
              <Box minWidth="180px">
                <Select
                  label="Date range"
                  labelInline
                  options={[
                    { label: "Last 7 days", value: "7d" },
                    { label: "Last 30 days", value: "30d" },
                    { label: "Last 90 days", value: "90d" },
                  ]}
                  value={datePreset}
                  onChange={setDatePreset}
                  disabled={loading || refreshing}
                />
              </Box>
              <Text variant="bodySm" tone="subdued">
                Period: {formatDate(startDate)} – {formatDate(endDate)}
              </Text>
            </InlineStack>
          </Card>

          {error && (
            <Banner
              tone="critical"
              title="Unable to load merchandising data"
              action={{ content: "Retry", onAction: () => fetchData(true) }}
            >
              <p>{error}</p>
            </Banner>
          )}

          {loading && !overviewData ? (
            <Box padding="1200">
              <BlockStack gap="400" inlineAlign="center">
                <Spinner size="large" accessibilityLabel="Loading collection performance" />
                <Text variant="bodyMd" tone="subdued" alignment="center">
                  Loading your collection performance…
                </Text>
              </BlockStack>
            </Box>
          ) : overviewData ? (
            <BlockStack gap={{ xs: "300", sm: "400" }}>
              <MerchandisingSummaryCards summary={overviewData.summary} />

              <Banner
                tone={attentionCollection ? "warning" : "success"}
                title={
                  attentionCollection
                    ? "Collection performance needs attention"
                    : "All collections are performing normally"
                }
                action={
                  attentionCollection
                    ? {
                        content: "View Collection",
                        onAction: () => setSelectedCollection(attentionCollection),
                      }
                    : undefined
                }
              >
                <p>
                  {attentionCollection
                    ? `${overviewData.summary.underperformingCollections} ${
                        overviewData.summary.underperformingCollections === 1
                          ? "collection is"
                          : "collections are"
                      } performing below your store average.`
                    : "No collection currently needs attention."}
                </p>
              </Banner>

              <CollectionPerformanceTable
                collections={overviewData.collections}
                onSelectCollection={setSelectedCollection}
              />
            </BlockStack>
          ) : null}

          {selectedCollection && (
            <CollectionDetailsModal
              open
              onClose={() => setSelectedCollection(null)}
              collectionId={selectedCollection.collectionId}
              collectionTitle={selectedCollection.title}
              shop={shop}
              startDate={startDate}
              endDate={endDate}
            />
          )}
        </BlockStack>
      </Box>
    </Page>
  );
}
