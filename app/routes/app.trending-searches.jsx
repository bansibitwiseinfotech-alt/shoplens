import { useCallback, useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import {
  Page,
  Card,
  Text,
  InlineStack,
  BlockStack,
  Select,
  Banner,
  Spinner,
  Button,
  Box,
  Badge,
  EmptyState,
  Divider,
  InlineGrid,
  useBreakpoints,
  Tooltip,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getTrendingOverview } from "../services/trendingSearchApi.js";
import PlanUpgradeGate from "../components/billing/PlanUpgradeGate.jsx";
import TrendingSummary from "../components/trending-searches/TrendingSummary.jsx";
import TrendingSearchTable from "../components/trending-searches/TrendingSearchTable.jsx";
import TrendingSearchDetails from "../components/trending-searches/TrendingSearchDetails.jsx";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    return { shop: session?.shop || "" };
  } catch (_) {
    return { shop: "" };
  }
};

const PERIOD_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 14 days", value: "14" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 60 days", value: "60" },
  { label: "Last 90 days", value: "90" },
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatGrowth(value) {
  const num = Math.round(Number(value || 0));
  if (num > 0) return `+${num}%`;
  return `${num}%`;
}

function getTrendBadgeTone(trendType) {
  switch (trendType) {
    case "Rising":
      return "success";
    case "New":
      return "info";
    case "Seasonal":
      return "attention";
    case "Stable":
    default:
      return "neutral";
  }
}

export default function TrendingSearchesRoute() {
  const { shop } = useLoaderData();
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(null);
  const [period, setPeriod] = useState("30");
  const [selectedTrend, setSelectedTrend] = useState(null);

  const fetchData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await getTrendingOverview({
          shop,
          days: Number(period),
        });
        setData(result);
      } catch (err) {
        console.error("[ShopLens] Trending searches fetch error:", err);
        if (
          err.status === 403 ||
          err.response?.code === "UPGRADE_REQUIRED" ||
          err.message?.includes("not included in the") ||
          err.message?.includes("Upgrade to")
        ) {
          setUpgradeRequired(err.response?.requiredPlan || "pro");
        } else {
          setError(
            err.message ||
              "Something went wrong while loading trending search data."
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [shop, period]
  );

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const fastestGrowingSearches = data?.fastestGrowingSearches || [];
  const biggestTrend = data?.biggestTrend;
  const isEmpty = !loading && fastestGrowingSearches.length === 0;

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
        paddingInline={{ xs: "300", sm: "400", md: "600" }}
        paddingBlockStart={{ xs: "300", sm: "400" }}
        paddingBlockEnd={{ xs: "400", sm: "500" }}
      >
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          {/* Header */}
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="center" gap="200">
              <Text variant="headingLg" as="h1" fontWeight="bold">
                Trending Search Detection
              </Text>

              <Tooltip content="Refresh trending searches">
                <Button
                  icon={RefreshIcon}
                  onClick={() => fetchData(true)}
                  loading={refreshing}
                  accessibilityLabel="Refresh trending searches"
                >
                  {isMobile ? undefined : "Refresh"}
                </Button>
              </Tooltip>
            </InlineStack>

            <Text variant="bodySm" tone="subdued">
              Identify rapidly growing searches and emerging customer demand before it peaks.
            </Text>
          </BlockStack>

          {/* Error State */}
          {error && (
            <Banner
              title="Unable to load trending searches"
              tone="critical"
              action={{
                content: "Try again",
                onAction: () => fetchData(false),
              }}
            >
              <p>{error}</p>
            </Banner>
          )}

          {/* Compact, Sleek Filter Bar */}
          <Card padding={{ xs: "300", sm: "400" }}>
            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Box minWidth="150px">
                  <Select
                    label="Period"
                    labelInline
                    options={PERIOD_OPTIONS}
                    value={period}
                    onChange={setPeriod}
                    disabled={loading || refreshing}
                  />
                </Box>
                <Badge tone="info">Live Demand Detection</Badge>
              </InlineStack>

              <Text variant="bodySm" tone="subdued">
                Comparing current {period} days vs prior {period} days
              </Text>
            </InlineStack>
          </Card>

        {/* Initial Loading State */}
        {loading && !data ? (
          <Card>
            <Box padding="1200">
              <BlockStack gap="400" inlineAlign="center">
                <Spinner
                  accessibilityLabel="Loading trending searches"
                  size="large"
                />
                <Text variant="bodyMd" tone="subdued">
                  Analyzing real customer search data...
                </Text>
              </BlockStack>
            </Box>
          </Card>
        ) : isEmpty ? (
          /* Empty State */
          <Card>
            <Box padding="800">
              <EmptyState
                heading="No growing searches found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  There are not enough search signals in this period to identify
                  a meaningful trend.
                </p>
              </EmptyState>
            </Box>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <TrendingSummary summary={data?.summary} />

            {/* Full-Width Fastest Growing Searches Table */}
            <TrendingSearchTable
              searches={fastestGrowingSearches}
              onSelectTrend={setSelectedTrend}
            />

            {/* Spotlight & Merchandising Playbook: Balanced 2-Column Row */}
            {biggestTrend && (
              <InlineGrid columns={{ xs: "1fr", md: "1fr 1fr" }} gap={{ xs: "300", sm: "400" }}>
                {/* Biggest Opportunity Spotlight */}
                <Card padding={{ xs: "300", sm: "400" }}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h3">
                        Biggest Opportunity
                      </Text>
                      <Badge tone={getTrendBadgeTone(biggestTrend.trendType)}>
                        {biggestTrend.trendType}
                      </Badge>
                    </InlineStack>

                    <Divider />

                    <BlockStack gap="050">
                      <Text variant="headingLg" as="p" fontWeight="bold">
                        {biggestTrend.query}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        Fastest growing search term in your catalog
                      </Text>
                    </BlockStack>

                    <Box
                      background="bg-surface-secondary"
                      borderRadius="200"
                      padding="300"
                    >
                      <BlockStack gap="150">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="bodySm" tone="subdued">
                            Current Searches
                          </Text>
                          <Text variant="headingSm" as="p">
                            {formatNumber(biggestTrend.currentSearches)}
                          </Text>
                        </InlineStack>

                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="bodySm" tone="subdued">
                            Previous Searches
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {formatNumber(biggestTrend.previousSearches)}
                          </Text>
                        </InlineStack>

                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="bodySm" tone="subdued">
                            Demand Growth
                          </Text>
                          <Text
                            variant="headingSm"
                            tone={biggestTrend.growthPercent > 0 ? "success" : undefined}
                            fontWeight="bold"
                            as="p"
                          >
                            {formatGrowth(biggestTrend.growthPercent)}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </Box>

                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h4">
                        Recommended Action
                      </Text>
                      <Text variant="bodySm" as="p">
                        {biggestTrend.recommendation}
                      </Text>
                    </BlockStack>

                    <Button
                      fullWidth
                      onClick={() => setSelectedTrend(biggestTrend)}
                    >
                      View trend details
                    </Button>
                  </BlockStack>
                </Card>

                {/* Merchandising Playbook Card */}
                <Card padding={{ xs: "300", sm: "400" }}>
                  <BlockStack gap="300">
                    <BlockStack gap="050">
                      <Text variant="headingSm" as="h3">
                        Merchandising Playbook
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Strategic actions based on detected customer demand patterns.
                      </Text>
                    </BlockStack>

                      <Divider />

                      <BlockStack gap="300">
                        <Box
                          background="bg-surface-secondary"
                          padding="300"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <BlockStack gap="100">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text variant="bodySm" fontWeight="semibold">
                                Homepage & Hero Placement
                              </Text>
                              <Badge tone="success" size="small">
                                Rising
                              </Badge>
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued">
                              Feature surging products on hero banners and top-ranked collection slots to capture active demand peaks.
                            </Text>
                          </BlockStack>
                        </Box>

                        <Box
                          background="bg-surface-secondary"
                          padding="300"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <BlockStack gap="100">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text variant="bodySm" fontWeight="semibold">
                                Catalog & Landing Pages
                              </Text>
                              <Badge tone="info" size="small">
                                New
                              </Badge>
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued">
                              Verify inventory for emerging search queries and create dedicated landing pages or collections before competitors react.
                            </Text>
                          </BlockStack>
                        </Box>

                        <Box
                          background="bg-surface-secondary"
                          padding="300"
                          borderRadius="200"
                          borderWidth="025"
                          borderColor="border-subdued"
                        >
                          <BlockStack gap="100">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text variant="bodySm" fontWeight="semibold">
                                Advance Bundles & Campaigns
                              </Text>
                              <Badge tone="attention" size="small">
                                Seasonal
                              </Badge>
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued">
                              Prepare promotional bundles and pre-order campaigns 2–3 weeks early before recurring seasonal demand reaches its highest peak.
                            </Text>
                          </BlockStack>
                        </Box>
                      </BlockStack>
                    </BlockStack>
                </Card>
              </InlineGrid>
            )}
          </>
        )}
        </BlockStack>
      </Box>

      {/* Trend Details Modal */}
      <TrendingSearchDetails
        trend={selectedTrend}
        onClose={() => setSelectedTrend(null)}
      />
    </Page>
  );
}