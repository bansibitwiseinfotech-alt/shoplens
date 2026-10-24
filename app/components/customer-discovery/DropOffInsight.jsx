import {
  Card,
  Box,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Divider,
} from "@shopify/polaris";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatPercent(value) {
  const num = Number(value || 0);

  return Number.isInteger(num)
    ? num.toString()
    : num.toFixed(2);
}

function getDropOffDetails(from, to) {
  if (from === "Product" && to === "Cart") {
    return {
      benchmark: "55% – 65%",
      impact: "+8 to +12 extra orders",
      checklist: [
        "Keep Add to Cart CTA visible above the fold.",
        "Show verified reviews, ratings, and stock urgency.",
        "Highlight clear return policy and delivery assurances.",
        "Enable Shop Pay / Apple Pay accelerated checkout.",
      ],
      opportunity:
        "Product → Cart has the highest leverage for improving overall discovery revenue.",
    };
  }

  if (from === "Collection" && to === "Product") {
    return {
      benchmark: "65% – 75%",
      impact: "+10 to +15 product views",
      checklist: [
        "Move top-converting products to the top.",
        "Add Bestseller or Trending badges.",
        "Improve collection load speed and product imagery.",
        "Use filters for size, color, and price.",
      ],
      opportunity:
        "Promoting bestsellers helps turn collection browsers into product viewers.",
    };
  }

  if (from === "Search" && to === "Collection") {
    return {
      benchmark: "70% – 80%",
      impact: "+15% discovery retention",
      checklist: [
        "Review zero-result queries and add search synonyms.",
        "Highlight popular collections in search.",
        "Enable instant autocomplete.",
        "Show trending products when shoppers focus search.",
      ],
      opportunity:
        "Guiding search queries to relevant collections reduces early discovery drop-offs.",
    };
  }

  if (from === "Cart" && to === "Purchase") {
    return {
      benchmark: "60% – 70%",
      impact: "+5 to +10 completed purchases",
      checklist: [
        "Show shipping costs before checkout.",
        "Offer multiple express checkout options.",
        "Send automated abandoned-cart reminders.",
        "Add security and payment assurances.",
      ],
      opportunity:
        "A smoother checkout helps recover shoppers with strong purchase intent.",
    };
  }

  return {
    benchmark: "50% – 60%",
    impact: "+10% journey improvement",
    checklist: [
      "Identify friction points in the customer journey.",
      "A/B test product copy and promotional banners.",
      "Simplify navigation and filtering.",
    ],
    opportunity:
      "Addressing key drop-offs steadily improves overall store conversion.",
  };
}

export default function DropOffInsight({
  biggestDropOff,
  overallPurchaseRate = 0,
}) {
  /*
   * Empty state
   */
  if (!biggestDropOff || !biggestDropOff.dropOff) {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="200">
            <Text variant="headingMd" as="h3">
              Biggest Drop-off
            </Text>

            <Text variant="bodyMd" fontWeight="semibold">
              Not enough journey data
            </Text>

            <Text variant="bodySm" tone="subdued" as="p">
              More customer journey activity is needed to identify the
              biggest drop-off.
            </Text>
          </BlockStack>
        </Box>
      </Card>
    );
  }

  const details = getDropOffDetails(
    biggestDropOff?.from,
    biggestDropOff?.to
  );

  return (
    <Card padding={{ xs: "300", sm: "400" }}>
      <BlockStack gap="300">
          {/* Header */}
          <InlineStack
            align="space-between"
            blockAlign="center"
            wrap
            gap="150"
          >
            <Text variant="headingMd" as="h3">
              Biggest Drop-off
            </Text>

            <Badge tone="critical">
              Needs attention
            </Badge>
          </InlineStack>

          <Divider />

          {/* Drop-off summary */}
          <BlockStack gap="050">
            <Text variant="headingLg" as="p">
              {biggestDropOff.from} → {biggestDropOff.to}
            </Text>

            <InlineStack
              gap="100"
              blockAlign="center"
              wrap
            >
              <Text variant="bodyMd" fontWeight="semibold">
                {formatNumber(biggestDropOff.dropOff)} customers
              </Text>

              <Text variant="bodySm" tone="subdued">
                dropped off
              </Text>
            </InlineStack>
          </BlockStack>

          {/* Conversion metrics */}
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="300"
          >
            <BlockStack gap="150">
              <InlineStack
                align="space-between"
                blockAlign="center"
                wrap
                gap="100"
              >
                <Text variant="bodySm" tone="subdued">
                  Step conversion
                </Text>

                <Text variant="bodyMd" fontWeight="semibold">
                  {formatPercent(
                    biggestDropOff.conversionRate
                  )}
                  %
                </Text>
              </InlineStack>

              <InlineStack
                align="space-between"
                blockAlign="center"
                wrap
                gap="100"
              >
                <Text variant="bodySm" tone="subdued">
                  Overall purchase rate
                </Text>

                <Text variant="bodySm" fontWeight="semibold">
                  {formatPercent(overallPurchaseRate)}%
                </Text>
              </InlineStack>
            </BlockStack>
          </Box>

          {/* Recommendations */}
          <BlockStack gap="150">
            <Text variant="headingSm" as="h4">
              Actionable Recommendations
            </Text>

            <BlockStack gap="100">
              {(details?.checklist || []).map((tip, idx) => (
                <InlineStack
                  key={idx}
                  gap="100"
                  blockAlign="start"
                  wrap={false}
                >
                  <Text
                    variant="bodySm"
                    tone="subdued"
                    as="span"
                  >
                    •
                  </Text>

                  <Text variant="bodySm" as="span">
                    {tip}
                  </Text>
                </InlineStack>
              ))}
            </BlockStack>
          </BlockStack>

          {/* Benchmark and estimated lift */}
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="300"
          >
            <BlockStack gap="150">
              <InlineStack
                align="space-between"
                blockAlign="center"
                wrap={false}
              >
                <Text
                  variant="bodySm"
                  fontWeight="semibold"
                >
                  Industry benchmark
                </Text>

                <Text variant="bodySm" tone="subdued">
                  {details.benchmark}
                </Text>
              </InlineStack>

              <InlineStack
                align="space-between"
                blockAlign="center"
                wrap={false}
              >
                <Text
                  variant="bodySm"
                  fontWeight="semibold"
                >
                  Estimated lift
                </Text>

                <Text
                  variant="bodySm"
                  tone="success"
                  fontWeight="semibold"
                >
                  {details.impact}
                </Text>
              </InlineStack>

              <Divider />

              <Text
                variant="bodyXs"
                tone="subdued"
                as="p"
              >
                {details.opportunity}
              </Text>
            </BlockStack>
          </Box>

          {/* Key Friction Drivers */}
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="300"
          >
            <BlockStack gap="100">
              <Text
                variant="bodySm"
                fontWeight="semibold"
              >
                Key Friction Drivers to Audit
              </Text>

              <Text variant="bodyXs" tone="subdued">
                {"• Mobile product page CTA placement & scroll depth"}
              </Text>

              <Text variant="bodyXs" tone="subdued">
                {"• Variant selection clarity & out-of-stock notice"}
              </Text>

              <Text variant="bodyXs" tone="subdued">
                {"• Shipping fees, delivery dates, and return clarity near price"}
              </Text>
            </BlockStack>
          </Box>
        </BlockStack>
    </Card>
  );
}
