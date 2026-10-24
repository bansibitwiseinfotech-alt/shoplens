import {
  Card,
  Box,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  Badge,
  Icon,
  ProgressBar,
} from "@shopify/polaris";
import {
  SearchIcon,
  CollectionIcon,
  ProductIcon,
  CartIcon,
  OrderIcon,
  ArrowDownIcon,
} from "@shopify/polaris-icons";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatPercent(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? num.toString() : num.toFixed(2);
}

function getStepIcon(key) {
  const icons = {
    search: SearchIcon,
    collection: CollectionIcon,
    product: ProductIcon,
    cart: CartIcon,
    purchase: OrderIcon,
  };

  return icons[key] || SearchIcon;
}

export default function JourneyFunnel({
  funnel = [],
  overallPurchaseRate = 0,
}) {
  const totalStarting = funnel?.[0]?.customers || 1;

  return (
    <Card padding={{ xs: "300", sm: "400" }}>
      <BlockStack gap="300">
          <InlineStack
            align="space-between"
            blockAlign="center"
            wrap
          >
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">
                Customer Journey
              </Text>

              <Text variant="bodySm" tone="subdued" as="p">
                Track customers from discovery to purchase.
              </Text>
            </BlockStack>

            <Badge tone="success">
              {formatPercent(overallPurchaseRate)}% overall
            </Badge>
          </InlineStack>

          <Divider />

          <BlockStack gap="150">
            {(funnel || []).map((step, index) => {
              const nextStep = funnel[index + 1];
              const retention = Math.min(
                100,
                Math.max(0, (step.customers / totalStarting) * 100)
              );

              return (
                <BlockStack key={step.key || index} gap="100">
                  <Box
                    background="bg-surface-secondary"
                    borderRadius="200"
                    paddingInline="300"
                    paddingBlock="200"
                  >
                    <BlockStack gap="150">
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        wrap
                        gap="100"
                      >
                        <InlineStack
                          gap="200"
                          blockAlign="center"
                          wrap={false}
                        >
                          <Box
                            background="bg-surface"
                            borderRadius="150"
                            padding="100"
                          >
                            <Icon source={getStepIcon(step.key)} tone="base" />
                          </Box>

                          <InlineStack gap="150" blockAlign="center" wrap={false}>
                            <Text
                              variant="headingSm"
                              as="h3"
                            >
                              {step.label}
                            </Text>

                            <Badge tone="neutral" size="small">
                              {formatNumber(step.customers)}
                            </Badge>
                          </InlineStack>
                        </InlineStack>

                        <Text variant="bodySm" tone="success" fontWeight="semibold">
                          {formatPercent(retention)}% retained
                        </Text>
                      </InlineStack>

                      <ProgressBar
                        progress={retention}
                        size="small"
                        tone="success"
                      />
                    </BlockStack>
                  </Box>

                  {nextStep && (
                    <Box paddingInlineStart="300" paddingBlock="050">
                      <InlineStack
                        gap="150"
                        blockAlign="center"
                        wrap={false}
                      >
                        <Box minWidth="20px">
                          <Icon source={ArrowDownIcon} tone="subdued" />
                        </Box>

                        <Text variant="bodyXs" tone="subdued" as="span">
                          {formatPercent(nextStep?.conversionRate)}% continued to {nextStep?.label || "next stage"}
                        </Text>

                        <Text
                          variant="bodyXs"
                          tone="critical"
                          as="span"
                        >
                          • {formatNumber(nextStep?.dropOff)} dropped
                        </Text>
                      </InlineStack>
                    </Box>
                  )}
                </BlockStack>
              );
            })}
          </BlockStack>
        </BlockStack>
    </Card>
  );
}