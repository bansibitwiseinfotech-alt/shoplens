import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Card,
  Box,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  InlineGrid,
  ButtonGroup,
  Button,
  Divider,
  useBreakpoints,
} from "@shopify/polaris";

/**
 * Compare Features & Plan Limits Table
 * Desktop : InlineGrid "2fr 1fr 1fr 1fr" — 100 % Polaris, zero custom CSS.
 * Mobile  : Segmented plan selector + card-based feature list.
 */
export default function PlanComparisonTable({
  currentPlanId = "free",
  interval = "monthly",
}) {
  const isYearly = interval === "yearly";
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

  const [selectedMobilePlan, setSelectedMobilePlan] = useState(
    currentPlanId || "pro"
  );

  useEffect(() => {
    if (currentPlanId) setSelectedMobilePlan(currentPlanId);
  }, [currentPlanId]);

  // ── Data ──────────────────────────────────────────────────────────────────

  const categories = [
    {
      category: "CORE SEARCH & DISCOVERY",
      items: [
        {
          name: "Search Intelligence (Products Tracked)",
          free: "Up to 20",
          pro: "Up to 50",
          premium: "More than 200",
        },
        {
          name: "Search Intelligence Trends",
          free: "Up to 20",
          pro: "Up to 50",
          premium: "More than 200",
        },
        {
          name: "Product Discoverability",
          free: "Up to 20",
          pro: "Up to 50",
          premium: "More than 200",
        },
        {
          name: "Zero-Result Search Queries",
          free: "Up to 20",
          pro: "Up to 50",
          premium: "More than 200",
        },
      ],
    },
    {
      category: "MERCHANDISING & INTELLIGENCE",
      items: [
        { name: "Collection Merchandising",    free: false, pro: true,  premium: true },
        { name: "Search Intent Analyzer",      free: false, pro: true,  premium: true },
        { name: "Trending Searches Analytics", free: false, pro: true,  premium: true },
      ],
    },
    {
      category: "ADVANCED AUTOMATION & OPTIMIZATION",
      items: [
        { name: "Merchandising Recommendations", free: false, pro: false, premium: true },
        { name: "Smart Merchandising Rules",     free: false, pro: false, premium: true },
        { name: "Merchandising Simulator",       free: false, pro: false, premium: true },
        { name: "Customer Discovery Journey",    free: false, pro: false, premium: true },
      ],
    },
  ];

  const planInfo = {
    free: {
      name: "Free",
      price: isYearly ? "$0 /year" : "$0 /month",
      billingNote: "Free Forever",
    },
    pro: {
      name: "Pro",
      price: isYearly ? "$190 /year" : "$19 /month",
      billingNote: isYearly ? "Save $38/year" : "Billed monthly",
    },
    premium: {
      name: "Premium",
      price: isYearly ? "$490 /year" : "$49 /month",
      billingNote: isYearly ? "Save $98/year" : "Billed monthly",
    },
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Renders a cell value: boolean → badge/dash, string → text. */
  const renderCellContent = (value) => {
    if (value === true)  return <Badge tone="success" size="small">Included</Badge>;
    if (value === false) return <Text variant="bodySm" tone="subdued">—</Text>;
    return <Text variant="bodySm" fontWeight="medium">{value}</Text>;
  };

  /**
   * Extra Polaris Box props for a plan-column cell.
   * Highlights the active plan with a subtle success background.
   */
  const planCellBox = (planId) =>
    planId === currentPlanId
      ? { background: "bg-surface-success-subdued" }
      : {};

  /** Desktop column definition — feature col twice the plan cols. */
  const COLS = "2fr 1fr 1fr 1fr";

  /** Plan column header with optional "Current" badge. */
  const PlanHeading = ({ planId, label }) => (
    <InlineStack gap="100" blockAlign="center" wrap>
      <Text variant="bodySm" fontWeight="semibold">{label}</Text>
      {currentPlanId === planId && (
        <Badge tone="success" size="small">Current</Badge>
      )}
    </InlineStack>
  );
  PlanHeading.propTypes = {
    planId: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card roundedAbove="sm" padding="0">

      {/* ── Title ── */}
      <Box
        paddingInline={{ xs: "300", sm: "400" }}
        paddingBlock={{ xs: "300", sm: "400" }}
        borderBlockEndWidth="025"
        borderColor="border"
      >
        <BlockStack gap="100">
          <Text variant="headingMd" as="h3">
            Compare Features &amp; Plan Limits
          </Text>
          <Text variant="bodySm" tone="subdued">
            See exactly which features and usage limits are included in each ShopLens plan.
          </Text>
        </BlockStack>
      </Box>

      {/* ════════════════════════════════════════════════════
          MOBILE — segmented selector + per-category cards
          ════════════════════════════════════════════════════ */}
      {isMobile ? (
        <Box
          paddingInline={{ xs: "300", sm: "400" }}
          paddingBlock={{ xs: "300", sm: "400" }}
        >
          <BlockStack gap="400">

            {/* Plan selector */}
            <ButtonGroup variant="segmented" fullWidth>
              <Button
                pressed={selectedMobilePlan === "free"}
                onClick={() => setSelectedMobilePlan("free")}
              >
                Free
              </Button>
              <Button
                pressed={selectedMobilePlan === "pro"}
                onClick={() => setSelectedMobilePlan("pro")}
              >
                Pro
              </Button>
              <Button
                pressed={selectedMobilePlan === "premium"}
                onClick={() => setSelectedMobilePlan("premium")}
              >
                Premium
              </Button>
            </ButtonGroup>

            {/* Active plan summary */}
            <Box
              background="bg-surface-secondary"
              padding="300"
              borderRadius="200"
              borderWidth="025"
              borderColor="border"
            >
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <BlockStack gap="050">
                  <InlineStack gap="150" blockAlign="center" wrap>
                    <Text variant="bodyMd" fontWeight="bold">
                      {planInfo[selectedMobilePlan]?.name} Plan
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      ({planInfo[selectedMobilePlan]?.price})
                    </Text>
                  </InlineStack>
                  <Text variant="bodyXs" tone="subdued">
                    {planInfo[selectedMobilePlan]?.billingNote}
                  </Text>
                </BlockStack>
                {currentPlanId === selectedMobilePlan && (
                  <Badge tone="success">Current Plan</Badge>
                )}
              </InlineStack>
            </Box>

            {/* Feature cards per category */}
            <BlockStack gap="400">
              {categories.map((cat) => (
                <BlockStack key={cat.category} gap="200">

                  <Text variant="bodyXs" fontWeight="bold" tone="subdued">
                    {cat.category}
                  </Text>

                  <Box
                    background="bg-surface"
                    borderWidth="025"
                    borderColor="border"
                    borderRadius="200"
                    paddingInline="300"
                  >
                    <BlockStack>
                      {cat.items.map((item, itemIdx) => (
                        <Box key={item.name}>
                          <Box paddingBlock="300">
                            <InlineStack
                              align="space-between"
                              blockAlign="center"
                              gap="300"
                              wrap={false}
                            >
                              <Box>
                                <Text variant="bodySm">{item.name}</Text>
                              </Box>
                              <Box>
                                {renderCellContent(item[selectedMobilePlan])}
                              </Box>
                            </InlineStack>
                          </Box>
                          {itemIdx < cat.items.length - 1 && <Divider />}
                        </Box>
                      ))}
                    </BlockStack>
                  </Box>

                </BlockStack>
              ))}
            </BlockStack>

          </BlockStack>
        </Box>

      ) : (

        /* ═══════════════════════════════════════════════════════
           DESKTOP — InlineGrid "2fr 1fr 1fr 1fr", Polaris only
           ═══════════════════════════════════════════════════════ */
        <Box>

          {/* Column headers */}
          <Box
            background="bg-surface-secondary"
            paddingInline="400"
            paddingBlock="300"
            borderBlockEndWidth="025"
            borderColor="border"
          >
            <InlineGrid columns={COLS} gap="400">
              <Text variant="bodySm" fontWeight="semibold">Feature</Text>

              <Box {...planCellBox("free")}>
                <PlanHeading
                  planId="free"
                  label={`Free (${isYearly ? "$0/yr" : "$0/mo"})`}
                />
              </Box>

              <Box {...planCellBox("pro")}>
                <PlanHeading
                  planId="pro"
                  label={`Pro (${isYearly ? "$190/yr" : "$19/mo"})`}
                />
              </Box>

              <Box {...planCellBox("premium")}>
                <PlanHeading
                  planId="premium"
                  label={`Premium (${isYearly ? "$490/yr" : "$49/mo"})`}
                />
              </Box>
            </InlineGrid>
          </Box>

          {/* Category + feature rows */}
          {categories.map((cat, catIdx) => (
            <Box key={cat.category}>

              {/* Category label row */}
              <Box
                background="bg-surface-secondary"
                paddingInline="400"
                paddingBlock="200"
                borderBlockEndWidth="025"
                borderColor="border"
              >
                <Text variant="bodyXs" fontWeight="bold" tone="subdued">
                  {cat.category}
                </Text>
              </Box>

              {/* Feature rows */}
              {cat.items.map((item, itemIdx) => {
                const showDivider =
                  itemIdx < cat.items.length - 1 ||
                  catIdx < categories.length - 1;
                return (
                  <Box
                    key={item.name}
                    paddingInline="400"
                    paddingBlock="300"
                    borderBlockEndWidth={showDivider ? "025" : undefined}
                    borderColor={showDivider ? "border" : undefined}
                  >
                    <InlineGrid columns={COLS} gap="400">

                      <Text variant="bodySm">{item.name}</Text>

                      <Box {...planCellBox("free")}>
                        {renderCellContent(item.free)}
                      </Box>

                      <Box {...planCellBox("pro")}>
                        {renderCellContent(item.pro)}
                      </Box>

                      <Box {...planCellBox("premium")}>
                        {renderCellContent(item.premium)}
                      </Box>

                    </InlineGrid>
                  </Box>
                );
              })}

            </Box>
          ))}

        </Box>
      )}

    </Card>
  );
}

PlanComparisonTable.propTypes = {
  currentPlanId: PropTypes.string,
  interval: PropTypes.oneOf(["monthly", "yearly"]),
};


