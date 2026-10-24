import {
  Modal,
  Box,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Badge,
  Divider,
} from "@shopify/polaris";

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

function getMeaning(trendType) {
  switch (trendType) {
    case "Rising":
      return "Search demand has increased significantly compared with the previous period.";
    case "New":
      return "Customers have started searching for this term recently, indicating newly detected demand.";
    case "Seasonal":
      return "This search shows a recurring demand pattern that may be related to a seasonal period.";
    case "Stable":
    default:
      return "Search activity for this term is currently stable.";
  }
}

export default function TrendingSearchDetails({
  trend,
  onClose,
}) {
  if (!trend) return null;

  const badgeTone = getTrendBadgeTone(trend.trendType);
  const meaning = getMeaning(trend.trendType);

  return (
    <Modal
      open={Boolean(trend)}
      onClose={onClose}
      title={
        <Text variant="headingMd" as="span" breakWord>
          Search trend: {trend.query}
        </Text>
      }
      size="large"
      primaryAction={{
        content: "Done",
        onAction: onClose,
      }}
    >
      <Modal.Section>
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          {/* Key metrics header */}
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding={{ xs: "300", sm: "400" }}
          >
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="start" gap="200" wrap>
                <Text variant="headingMd" as="h3" breakWord>
                  {trend.query}
                </Text>
                <Badge tone={badgeTone}>
                  {trend.trendType}
                </Badge>
              </InlineStack>

              <Divider />

              <InlineGrid columns={{ xs: 2, sm: 3 }} gap={{ xs: "200", sm: "300" }}>
                <BlockStack gap="050">
                  <Text variant="bodyXs" tone="subdued">
                    Current Searches
                  </Text>
                  <Text variant="headingSm" as="p">
                    {formatNumber(trend.currentSearches)}
                  </Text>
                </BlockStack>

                <BlockStack gap="050">
                  <Text variant="bodyXs" tone="subdued">
                    Previous Searches
                  </Text>
                  <Text variant="headingSm" tone="subdued" as="p">
                    {formatNumber(trend.previousSearches)}
                  </Text>
                </BlockStack>

                <BlockStack gap="050">
                  <Text variant="bodyXs" tone="subdued">
                    Growth
                  </Text>
                  <Text
                    variant="headingSm"
                    tone={trend.growthPercent > 0 ? "success" : undefined}
                    as="p"
                  >
                    {formatGrowth(trend.growthPercent)}
                  </Text>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Box>

          {/* What This Means */}
          <BlockStack gap="100">
            <Text variant="headingSm" as="h4">
              What This Means
            </Text>
            <Text variant="bodyMd" tone="subdued" as="p">
              {meaning}
            </Text>
          </BlockStack>

          <Divider />

          {/* Recommended Action */}
          <BlockStack gap="100">
            <Text variant="headingSm" as="h4">
              Recommended Action
            </Text>
            <Text variant="bodyMd" as="p">
              {trend.recommendation || "Review product availability and merchandising for this search."}
            </Text>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}