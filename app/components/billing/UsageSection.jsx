import PropTypes from "prop-types";
import {
  Card,
  Box,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  ProgressBar,
  InlineGrid,
  SkeletonBodyText,
} from "@shopify/polaris";

/**
 * Helper to format date strings cleanly.
 */
function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function UsageSection({ usageData, currentPlan = "free", isLoading = false }) {
  if (isLoading) {
    return (
      <Card roundedAbove="sm">
        <BlockStack gap="400">
          <SkeletonBodyText lines={2} />
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <SkeletonBodyText lines={3} />
            <SkeletonBodyText lines={3} />
            <SkeletonBodyText lines={3} />
            <SkeletonBodyText lines={3} />
          </InlineGrid>
        </BlockStack>
      </Card>
    );
  }

  const metrics = usageData?.usage?.metrics || {};
  const currentPeriodStart = usageData?.currentPeriodStart;
  const currentPeriodEnd = usageData?.currentPeriodEnd;

  const periodLabel =
    currentPeriodStart && currentPeriodEnd
      ? `${formatDate(currentPeriodStart)} – ${formatDate(currentPeriodEnd)}`
      : usageData?.usage?.period || null;

  const isPremium = currentPlan === "premium";

  const metricCards = [
    {
      key: "searchIntelligenceProducts",
      title: "Search Intelligence",
      subtitle: "Tracked Products",
      metric: metrics.searchIntelligenceProducts,
    },
    {
      key: "searchIntelligenceTrends",
      title: "Search Trends",
      subtitle: "Tracked Trends",
      metric: metrics.searchIntelligenceTrends,
    },
    {
      key: "productDiscoverability",
      title: "Discoverability",
      subtitle: "Analyzed Products",
      metric: metrics.productDiscoverabilityProducts,
    },
    {
      key: "zeroResultSearch",
      title: "Zero-Result Searches",
      subtitle: "Unique Queries",
      metric: metrics.zeroResultSearchQueries,
    },
  ];

  return (
    <Card roundedAbove="sm">
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <BlockStack gap="100">
            <Text variant="headingMd" as="h3" fontWeight="bold">
              Current Plan Usage
            </Text>
            <Text variant="bodySm" tone="subdued">
              Real-time consumption for your store in the current billing cycle.
            </Text>
          </BlockStack>

          {periodLabel && (
            <Badge tone="info">{`Cycle: ${periodLabel}`}</Badge>
          )}
        </InlineStack>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          {metricCards.map(({ key, title, subtitle, metric }) => {
            const used = metric ? Number(metric.used || 0) : 0;
            const limit = metric?.limit;
            const isUnlimited = isPremium || metric?.isUnlimited || limit === null;

            let progressPercentage = 0;
            let progressTone = undefined;

            if (!isUnlimited && typeof limit === "number" && limit > 0) {
              progressPercentage = Math.min(100, Math.round((used / limit) * 100));
              if (progressPercentage >= 100) {
                progressTone = "critical";
              } else if (progressPercentage >= 80) {
                progressTone = "attention";
              }
            }

            return (
              <Box
                key={key}
                padding="300"
                borderWidth="025"
                borderColor="border-subdued"
                borderRadius="200"
                background="bg-surface-secondary"
              >
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4" fontWeight="semibold">
                    {title}
                  </Text>

                  <Text variant="bodyXs" tone="subdued">
                    {subtitle}
                  </Text>

                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodyMd" fontWeight="bold">
                      {metric ? `${used}` : "—"}
                    </Text>

                    {isUnlimited ? (
                      <Badge tone="success">Unlimited</Badge>
                    ) : (
                      <Text variant="bodySm" tone="subdued">
                        {metric && typeof limit === "number" ? `/ ${limit} max` : "Unavailable"}
                      </Text>
                    )}
                  </InlineStack>

                  {!isUnlimited && metric && typeof limit === "number" && (
                    <Box paddingBlockStart="100">
                      <ProgressBar
                        progress={progressPercentage}
                        size="small"
                        tone={progressTone}
                      />
                    </Box>
                  )}
                </BlockStack>
              </Box>
            );
          })}
        </InlineGrid>
      </BlockStack>
    </Card>
  );
}

UsageSection.propTypes = {
  usageData: PropTypes.object,
  currentPlan: PropTypes.string,
  isLoading: PropTypes.bool,
};

export default UsageSection;
