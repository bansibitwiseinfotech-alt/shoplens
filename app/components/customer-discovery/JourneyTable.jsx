import {
  Card,
  DataTable,
  Text,
  Badge,
  Box,
  InlineStack,
  BlockStack,
  InlineGrid,
  useBreakpoints,
} from "@shopify/polaris";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatPercent(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? num.toString() : num.toFixed(2);
}

function getStatus(conversionRate) {
  const rate = Number(conversionRate || 0);

  if (rate >= 70) {
    return {
      label: "Healthy",
      tone: "success",
    };
  }

  if (rate >= 40) {
    return {
      label: "Needs Attention",
      tone: "warning",
    };
  }

  return {
    label: "High Drop-off",
    tone: "critical",
  };
}

export default function JourneyTable({
  stageConversions = [],
}) {
  const { smDown } = useBreakpoints();

  const rows = stageConversions.map((stage) => {
    const status = getStatus(stage.conversionRate);

    return [
      stage.from,
      formatNumber(stage.previousCustomers),
      stage.to,
      formatNumber(stage.customers),
      `${formatPercent(stage.conversionRate)}%`,
      formatNumber(stage.dropOff),
      <Badge tone={status.tone} key={stage.key || `${stage.from}_${stage.to}`}>
        {status.label}
      </Badge>,
    ];
  });

  if (smDown) {
    return (
      <Card padding="0">
        <Box padding="300" borderBlockEndWidth="025" borderColor="border-subdued">
          <Text variant="headingMd" as="h2">
            Journey Performance
          </Text>
        </Box>

        <Box padding="300">
          <BlockStack gap="300">
            {stageConversions.map((stage) => {
              const status = getStatus(stage.conversionRate);
              return (
                <Box
                  key={stage.key || `${stage.from}_${stage.to}`}
                  background="bg-surface-secondary"
                  borderRadius="200"
                  padding="300"
                >
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center" wrap={false} gap="150">
                      <Text variant="bodyMd" fontWeight="bold">
                        {stage.from} → {stage.to}
                      </Text>
                      <Badge tone={status.tone} size="small">
                        {status.label}
                      </Badge>
                    </InlineStack>

                    <InlineGrid columns={3} gap="200">
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">Started</Text>
                        <Text variant="bodyMd" fontWeight="semibold">
                          {formatNumber(stage.previousCustomers)}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">Reached</Text>
                        <Text variant="bodyMd" fontWeight="semibold">
                          {formatNumber(stage.customers)}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">Conversion</Text>
                        <Text
                          variant="bodyMd"
                          fontWeight="bold"
                          tone={status.tone === "critical" ? "critical" : "success"}
                        >
                          {formatPercent(stage.conversionRate)}%
                        </Text>
                      </BlockStack>
                    </InlineGrid>

                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyXs" tone="subdued">
                        Drop-off: {formatNumber(stage.dropOff)} customers
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
              );
            })}
          </BlockStack>
        </Box>

        <Box
          padding="300"
          background="bg-surface-secondary"
          borderBlockStartWidth="025"
          borderColor="border-subdued"
        >
          <BlockStack gap="050">
            <Text variant="bodyXs" tone="subdued">
              Step Conversion = Reached ÷ Started Customers
            </Text>
            <Text variant="bodyXs" tone="subdued">
              Tracks unique shopper progression through storefront discovery
            </Text>
          </BlockStack>
        </Box>
      </Card>
    );
  }

  return (
    <Card padding="0">
      <Box padding="400" borderBlockEndWidth="025" borderColor="border-subdued">
        <Text variant="headingMd" as="h2">
          Journey Performance
        </Text>
      </Box>

      <DataTable
        columnContentTypes={[
          "text",
          "text",
          "text",
          "text",
          "text",
          "text",
          "text",
        ]}
        headings={[
          "Current Step",
          "Customers",
          "Next Step",
          "Reached",
          "Conversion",
          "Drop-off",
          "Status",
        ]}
        rows={rows}
        hoverable
      />

      <Box
        padding="300"
        background="bg-surface-secondary"
        borderBlockStartWidth="025"
        borderColor="border-subdued"
      >
        <InlineStack align="space-between" blockAlign="center" wrap>
          <InlineStack gap="300" blockAlign="center" wrap>
            <Text variant="bodyXs" fontWeight="semibold">
              Calculation Methodology:
            </Text>
            <Text variant="bodyXs" tone="subdued">
              Step Conversion = Next Step ÷ Current Step Customers
            </Text>
            <Text variant="bodyXs" tone="subdued">
              •
            </Text>
            <Text variant="bodyXs" tone="subdued">
              Overall Purchase Rate = Completed Purchases ÷ Search Sessions
            </Text>
          </InlineStack>
          <Text variant="bodyXs" tone="subdued">
            Tracks unique shopper progression through storefront discovery
          </Text>
        </InlineStack>
      </Box>
    </Card>
  );
}