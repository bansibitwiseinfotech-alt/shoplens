import { Card, InlineGrid, BlockStack, Text } from "@shopify/polaris";

export default function MerchandisingSummaryCards({ summary }) {
  const cards = [
    {
      label: "Collections",
      value: summary.totalCollections,
      detail: "Total collections with products",
    },
    {
      label: "Collections With Sales",
      value: summary.collectionsWithSales,
      detail: "Collections that generated purchases",
    },
    {
      label: "Needs Attention",
      value: summary.underperformingCollections,
      detail: "Collections below your store average",
    },
    {
      label: "Products to Reposition",
      value: summary.productsToReposition,
      detail: "Products that may need a better position",
    },
  ];

  return (
    <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap={{ xs: "300", sm: "400" }}>
      {cards.map((card) => (
        <Card key={card.label} padding={{ xs: "300", sm: "400" }}>
          <BlockStack gap="100">
            <Text variant="bodySm" tone="subdued" truncate>
              {card.label}
            </Text>
            <Text variant="headingLg" as="p">
              {card.value.toLocaleString("en-US")}
            </Text>
            <Text variant="bodyXs" tone="subdued" truncate>
              {card.detail}
            </Text>
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}
