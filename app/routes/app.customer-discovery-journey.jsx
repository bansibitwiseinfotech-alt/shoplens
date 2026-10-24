import { useCallback, useEffect, useState } from "react";
import { useLoaderData } from "react-router";

import {
  Page,
  InlineGrid,
  Card,
  Text,
  InlineStack,
  BlockStack,
  Select,
  Banner,
  Spinner,
  Button,
  Box,
} from "@shopify/polaris";

import { RefreshIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";

import {
  getCustomerDiscoveryOverview,
} from "../services/customerDiscoveryApi.js";
import PlanUpgradeGate from "../components/billing/PlanUpgradeGate.jsx";

import JourneyStats from "../components/customer-discovery/JourneyStats.jsx";
import JourneyFunnel from "../components/customer-discovery/JourneyFunnel.jsx";
import DropOffInsight from "../components/customer-discovery/DropOffInsight.jsx";
import JourneyTable from "../components/customer-discovery/JourneyTable.jsx";


/* ---------------------------------------------------------
 * Loader
 * --------------------------------------------------------- */

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);

    return {
      shop:
        session?.shop ||
        "promobile-hub.myshopify.com",
    };
  } catch (_) {
    return {
      shop: "promobile-hub.myshopify.com",
    };
  }
};


/* ---------------------------------------------------------
 * Date range options
 * --------------------------------------------------------- */

const PERIOD_OPTIONS = [
  {
    label: "Last 7 days",
    value: "7",
  },
  {
    label: "Last 30 days",
    value: "30",
  },
  {
    label: "Last 90 days",
    value: "90",
  },
];


/* ---------------------------------------------------------
 * Main page
 * --------------------------------------------------------- */

export default function CustomerDiscoveryJourneyRoute() {
  const { shop } = useLoaderData();

  const [data, setData] = useState(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [upgradeRequired, setUpgradeRequired] = useState(null);

  const [period, setPeriod] = useState("30");


  /* -------------------------------------------------------
   * Load customer journey data
   * ------------------------------------------------------- */

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      setError("");

      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result =
          await getCustomerDiscoveryOverview({
            shop,
            days: period,
          });

        setData(result);
      } catch (err) {
        console.error(
          "[ShopLens] Customer Discovery Journey fetch error:",
          err
        );

        if (
          err.status === 403 ||
          err.response?.code === "UPGRADE_REQUIRED" ||
          err.message?.includes("not included in the") ||
          err.message?.includes("Upgrade to")
        ) {
          setUpgradeRequired(err.response?.requiredPlan || "premium");
        } else {
          setError(
            err.message ||
              "Something went wrong while loading customer discovery data."
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [shop, period]
  );


  /* -------------------------------------------------------
   * Reload when date range changes
   * ------------------------------------------------------- */

  useEffect(() => {
    loadData(false);
  }, [loadData]);


  /* -------------------------------------------------------
   * Empty state
   * ------------------------------------------------------- */

  const isEmpty =
    !data ||
    (
      (data.totals?.customersTracked || 0) === 0 &&
      (data.totals?.searchCustomers || 0) === 0 &&
      (data.totals?.productViews || 0) === 0 &&
      (data.totals?.cartAdds || 0) === 0 &&
      (data.totals?.purchases || 0) === 0
    );


  /* -------------------------------------------------------
   * Date formatter
   * ------------------------------------------------------- */

  const formatDate = (dateStr) => {
    if (!dateStr) {
      return "";
    }

    return new Date(dateStr).toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    );
  };


  /* -------------------------------------------------------
   * Initial loading
   * ------------------------------------------------------- */

  if (loading && !data) {
    return (
      <Page fullWidth>
        <Box
          paddingInline={{ xs: "400", sm: "600", md: "700" }}
          paddingBlockStart={{ xs: "300", sm: "400" }}
          paddingBlockEnd={{ xs: "400", sm: "500" }}
        >
          <Card padding="0">
            <Box padding="1200">
              <BlockStack
                gap="400"
                inlineAlign="center"
              >
                <Spinner
                  accessibilityLabel="Loading customer discovery journey"
                  size="large"
                />

                <Text
                  variant="bodyMd"
                  tone="subdued"
                >
                  Loading customer discovery journey…
                </Text>
              </BlockStack>
            </Box>
          </Card>
        </Box>
      </Page>
    );
  }


  /* -------------------------------------------------------
   * Page
   * ------------------------------------------------------- */

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
            title="Premium Feature"
            description="Upgrade to Premium to unlock this feature."
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
          {/* Header */}
          <InlineStack
            align="space-between"
            blockAlign="start"
            wrap
            gap="200"
          >
            <BlockStack gap="050">
              <Text variant="headingXl" as="h1" fontWeight="bold">
                Customer Discovery Journey
              </Text>
              <Text variant="bodySm" tone="subdued">
                See how customers move from product discovery to purchase and identify the biggest drop-off points.
              </Text>
            </BlockStack>

            <Button
              icon={RefreshIcon}
              onClick={() => loadData(true)}
              loading={refreshing}
              accessibilityLabel="Refresh customer discovery journey"
            >
              Refresh
            </Button>
          </InlineStack>

          {/* -------------------------------------------------
           * Error banner
           * ------------------------------------------------- */}

          {error && (
            <Banner
              title="Unable to load customer journey"
              tone="critical"
              action={{
                content: "Try again",
                onAction: () => loadData(true),
              }}
            >
              <p>{error}</p>
            </Banner>
          )}

          {/* -------------------------------------------------
           * Date range selector
           * ------------------------------------------------- */}

          <Card padding={{ xs: "300", sm: "400" }}>
            <InlineStack
              align="space-between"
              blockAlign="center"
              wrap
              gap="200"
            >
              <Box minWidth="180px">
                <Select
                  label="Date range"
                  labelInline
                  options={PERIOD_OPTIONS}
                  value={period}
                  onChange={setPeriod}
                  disabled={
                    loading || refreshing
                  }
                />
              </Box>

              {data?.dateRange?.from &&
                data?.dateRange?.to && (
                  <Text
                    variant="bodySm"
                    tone="subdued"
                  >
                    Period:{" "}
                    {formatDate(
                      data.dateRange.from
                    )}{" "}
                    –{" "}
                    {formatDate(
                      data.dateRange.to
                    )}
                  </Text>
                )}
            </InlineStack>
          </Card>


        {/* -------------------------------------------------
         * Empty state
         * ------------------------------------------------- */}

        {isEmpty ? (
          <Card>
            <Box padding="1000">
              <BlockStack
                gap="300"
                inlineAlign="center"
              >
                <Text
                  variant="headingMd"
                  as="h3"
                  alignment="center"
                >
                  No customer journey data yet
                </Text>

                <Text
                  tone="subdued"
                  as="p"
                  alignment="center"
                >
                  ShopLens will show the customer
                  discovery path here once shoppers
                  interact with your storefront.
                </Text>
              </BlockStack>
            </Box>
          </Card>
        ) : (
          <>
            {/* -------------------------------------------------
             * Top stats
             * ------------------------------------------------- */}

            <JourneyStats
              totals={data.totals}
            />


            <InlineGrid
              columns={{
                xs: 1,
                md: [
                  "twoThirds",
                  "oneThird",
                ],
              }}
              gap="400"
            >
              <JourneyFunnel
                funnel={data.funnel}
                overallPurchaseRate={
                  data.overallPurchaseRate
                }
              />

              <DropOffInsight
                biggestDropOff={
                  data.biggestDropOff
                }
                overallPurchaseRate={
                  data.overallPurchaseRate
                }
              />
            </InlineGrid>


            {/* -------------------------------------------------
             * Journey performance table
             * ------------------------------------------------- */}

            <JourneyTable
              stageConversions={
                data.stageConversions
              }
            />
          </>
        )}
        </BlockStack>
      </Box>
    </Page>
  );
}