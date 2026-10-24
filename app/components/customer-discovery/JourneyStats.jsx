import {
  Card,
  InlineGrid,
  Box,
  Text,
  BlockStack,
} from "@shopify/polaris";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function StatCard({ title, value, description }) {
  return (
    <Card padding={{ xs: "300", sm: "400" }}>
      <Box minHeight={{ xs: "64px", sm: "76px" }}>
        <BlockStack gap="050">
          <Text variant="bodySm" tone="subdued" truncate>
            {title}
          </Text>

          <Text variant="headingLg" as="p" fontWeight="bold">
            {value}
          </Text>

          {description && (
            <Text variant="bodyXs" tone="subdued" truncate>
              {description}
            </Text>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function JourneyStats({ totals }) {
  return (
    <InlineGrid
      columns={{
        xs: 2,
        sm: 2,
        md: 4,
      }}
      gap={{ xs: "300", sm: "400" }}
    >
      <StatCard
        title="Customers Tracked"
        value={formatNumber(totals?.customersTracked)}
        description="Unique discovery sessions"
      />

      <StatCard
        title="Product Views"
        value={formatNumber(totals?.productViews)}
        description="Customers reaching products"
      />

      <StatCard
        title="Cart Adds"
        value={formatNumber(totals?.cartAdds)}
        description="Customers adding products"
      />

      <StatCard
        title="Purchases"
        value={formatNumber(totals?.purchases)}
        description="Completed purchases"
      />
    </InlineGrid>
  );
}