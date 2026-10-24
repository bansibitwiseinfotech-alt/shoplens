import {
  Card,
  InlineGrid,
  Box,
  Text,
  BlockStack,
  Badge,
} from "@shopify/polaris";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatGrowth(value) {
  const num = Math.round(Number(value || 0));
  if (num > 0) return `+${num}%`;
  return `${num}%`;
}

export default function TrendingSummary({ summary = {} }) {
  const growthNum = Number(summary.searchGrowth || 0);

  const cards = [
    {
      title: "Trending Searches",
      value: formatNumber(summary.trendingSearches),
      description: "Meaningful growth",
      badgeTone: summary.trendingSearches > 0 ? "success" : "neutral",
      badgeText: summary.trendingSearches > 0 ? "Active" : "None",
    },
    {
      title: "New Trends",
      value: formatNumber(summary.newTrends),
      description: "Newly detected",
      badgeTone: summary.newTrends > 0 ? "info" : "neutral",
      badgeText: summary.newTrends > 0 ? "Emerging" : "None",
    },
    {
      title: "Seasonal Searches",
      value: formatNumber(summary.seasonalSearches),
      description: "Seasonal patterns",
      badgeTone: summary.seasonalSearches > 0 ? "attention" : "neutral",
      badgeText: summary.seasonalSearches > 0 ? "Seasonal" : "None",
    },
    {
      title: "Search Growth",
      value: formatGrowth(summary.searchGrowth),
      description: "vs previous period",
      valueTone: growthNum > 0 ? "success" : growthNum < 0 ? "critical" : undefined,
      badgeTone: growthNum > 0 ? "success" : growthNum < 0 ? "critical" : "neutral",
      badgeText: growthNum > 0 ? "Accelerating" : growthNum < 0 ? "Declining" : "Flat",
    },
  ];

  return (
    <InlineGrid
      columns={{
        xs: 2,
        sm: 2,
        md: 4,
      }}
      gap={{ xs: "200", sm: "300", md: "400" }}
    >
      {cards.map((card) => (
        <Card key={card.title} padding={{ xs: "200", sm: "400" }}>
          <BlockStack gap="100">
            <Text variant="bodySm" tone="subdued" fontWeight="medium">
              {card.title}
            </Text>

            <Text
              variant="headingLg"
              as="p"
              fontWeight="bold"
              tone={card.valueTone}
            >
              {card.value}
            </Text>

            <Box>
              <Badge tone={card.badgeTone} size="small">
                {card.badgeText}
              </Badge>
            </Box>

            <Text variant="bodyXs" tone="subdued">
              {card.description}
            </Text>
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}