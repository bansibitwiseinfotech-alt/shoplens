import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  IndexTable,
  InlineGrid,
  InlineStack,
  Modal,
  Spinner,
  Text,
  useBreakpoints,
} from "@shopify/polaris";
import { getCollectionDetail } from "../../services/merchandisingApi.js";

const statusTones = {
  Good: "success",
  "Needs Attention": "critical",
  "No Sales": "warning",
  "Not Enough Data": "attention",
};

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatRate(value, { showNotEnoughData = false } = {}) {
  if (value === null || value === undefined) {
    return showNotEnoughData ? "Not enough data" : "—";
  }
  return `${Number(value).toFixed(1)}%`;
}

export default function CollectionDetailsModal({
  open,
  onClose,
  collectionId,
  collectionTitle = "Collection details",
  shop,
  startDate,
  endDate,
}) {
  const { smDown } = useBreakpoints();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(null);

  const loadDetails = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    setError(null);

    try {
      const result = await getCollectionDetail({
        shop,
        collectionId,
        startDate,
        endDate,
      });
      setDetails(result);
    } catch (err) {
      console.error("[ShopLens] Error loading collection detail:", err);
      setError(err.message || "Failed to load collection details.");
    } finally {
      setLoading(false);
    }
  }, [shop, collectionId, startDate, endDate]);

  useEffect(() => {
    if (open && collectionId) {
      loadDetails();
    } else {
      setDetails(null);
      setError(null);
    }
  }, [open, collectionId, loadDetails]);

  const collection = details?.collection;
  const performance = details?.performance;
  const recommendations = details?.recommendations || [];
  const explanation = {
    Good: "This collection is converting at or above your store average.",
    "Needs Attention":
      "This collection gets product clicks, but fewer visitors are buying compared with your store average.",
    "No Sales": "This collection is getting clicks, but has not generated purchases.",
    "Not Enough Data":
      "This collection needs at least 10 product clicks before its performance can be compared.",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={collection?.title || collectionTitle}
      size={smDown ? "fullScreen" : "large"}
      primaryAction={{ content: "Close", onAction: onClose }}
    >
      <Modal.Section>
        {loading ? (
          <Box padding={{ xs: "600", sm: "1200" }}>
            <BlockStack gap="400" inlineAlign="center">
              <Spinner size="large" accessibilityLabel="Loading collection details" />
              <Text variant="bodyMd" tone="subdued" alignment="center">
                Loading collection details…
              </Text>
            </BlockStack>
          </Box>
        ) : error ? (
          <Banner
            tone="critical"
            title="Unable to load collection details"
            action={{ content: "Retry", onAction: loadDetails }}
          >
            <p>{error}</p>
          </Banner>
        ) : performance && collection ? (
          <BlockStack gap={{ xs: "300", sm: "500" }}>
            <Card padding={{ xs: "300", sm: "400" }}>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center" wrap>
                  <Text variant="headingMd" as="h2">
                    {collection.title || collectionTitle}
                  </Text>
                  <Badge tone={statusTones[performance.status] || "attention"}>
                    {performance.status}
                  </Badge>
                </InlineStack>
                <Text variant="bodyMd">{explanation[performance.status]}</Text>
                <InlineGrid columns={{ xs: 2, sm: 4 }} gap={{ xs: "200", sm: "300" }}>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Products</Text>
                    <Text variant="headingSm">{formatCount(collection.products)}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Product clicks</Text>
                    <Text variant="headingSm">{formatCount(performance.productClicks)}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Purchases</Text>
                    <Text variant="headingSm">{formatCount(performance.purchases)}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">This collection</Text>
                    <Text variant="headingSm">
                      {performance.productClicks >= 10
                        ? formatRate(performance.conversionRate)
                        : "—"}
                    </Text>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </Card>

            <Card padding={{ xs: "300", sm: "400" }}>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Compared with your store</Text>
                <BlockStack gap="100">
                  <Text variant="bodyMd">
                    Store average: {formatRate(performance.storeConversionRate)}
                  </Text>
                  {performance.percentagePointsFromAverage !== null &&
                    performance.percentagePointsFromAverage !== undefined &&
                    (performance.status === "Good" ||
                      performance.status === "Needs Attention") && (
                      <Text variant="bodyMd">
                        {performance.percentagePointsFromAverage === 0
                          ? "This collection is in line with your store average."
                          : `This collection is ${performance.percentagePointsFromAverage} percentage points ${
                              performance.status === "Good" ? "above" : "below"
                            } average.`}
                      </Text>
                    )}
                </BlockStack>
              </BlockStack>
            </Card>

            <BlockStack gap={{ xs: "200", sm: "300" }}>
              <BlockStack gap="100">
                <Text variant="headingMd" as="h3">
                  Products That May Need Repositioning
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Suggestions are based on each product’s clicks and purchases. Products are never moved automatically.
                </Text>
              </BlockStack>
              {performance.productClicks === 0 ? (
                <Text variant="bodyMd" tone="subdued">No product clicks yet.</Text>
              ) : performance.purchases === 0 ? (
                <Text variant="bodyMd" tone="subdued">No purchases yet.</Text>
              ) : recommendations.length === 0 ? (
                <Text variant="bodyMd" tone="subdued">
                  {performance.productClicks < 10
                    ? "Not enough data to suggest a change."
                    : "No products currently need repositioning."}
                </Text>
              ) : (
                smDown ? (
                  <BlockStack gap="200">
                    {recommendations.map((product, idx) => (
                      <Card
                        key={String(product.productId || idx)}
                        padding={{ xs: "300", sm: "400" }}
                      >
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="start" gap="200" wrap>
                            <Text variant="bodyMd" fontWeight="semibold" as="h4">
                              {product.productTitle || "Untitled product"}
                            </Text>
                            <Badge
                              tone={
                                product.action === "Consider Moving Higher"
                                  ? "success"
                                  : "warning"
                              }
                            >
                              {product.action}
                            </Badge>
                          </InlineStack>
                          <InlineGrid columns={2} gap="200">
                            <BlockStack gap="050">
                              <Text variant="bodySm" tone="subdued">Position</Text>
                              <Text variant="bodyMd">#{product.position}</Text>
                            </BlockStack>
                            <BlockStack gap="050">
                              <Text variant="bodySm" tone="subdued">Product clicks</Text>
                              <Text variant="bodyMd">{formatCount(product.clicks)}</Text>
                            </BlockStack>
                            <BlockStack gap="050">
                              <Text variant="bodySm" tone="subdued">Purchases</Text>
                              <Text variant="bodyMd">{formatCount(product.purchases)}</Text>
                            </BlockStack>
                            <BlockStack gap="050">
                              <Text variant="bodySm" tone="subdued">Conversion rate</Text>
                              <Text variant="bodyMd">{formatRate(product.conversionRate)}</Text>
                            </BlockStack>
                          </InlineGrid>
                        </BlockStack>
                      </Card>
                    ))}
                  </BlockStack>
                ) : (
                <Card padding="0">
                  <IndexTable
                    resourceName={{
                      singular: "product",
                      plural: "products",
                    }}
                    itemCount={recommendations.length}
                    headings={[
                      { title: "Product" },
                      { title: "Position", alignment: "center" },
                      { title: "Product Clicks", alignment: "end" },
                      { title: "Purchases", alignment: "end" },
                      { title: "Conversion Rate", alignment: "end" },
                      { title: "Suggestion", alignment: "center" },
                    ]}
                    selectable={false}
                  >
                    {recommendations.map((product, idx) => (
                      <IndexTable.Row
                        id={String(product.productId || idx)}
                        key={String(product.productId || idx)}
                        position={idx}
                      >
                        <IndexTable.Cell>
                          <Box minWidth="150px">
                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                              {product.productTitle || "Untitled product"}
                            </Text>
                          </Box>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Box minWidth="70px">
                            <Text variant="bodyMd" alignment="center" as="span">
                              #{product.position}
                            </Text>
                          </Box>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Box minWidth="70px">
                            <Text variant="bodyMd" alignment="end" as="span">
                              {formatCount(product.clicks)}
                            </Text>
                          </Box>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Box minWidth="70px">
                            <Text variant="bodyMd" alignment="end" as="span">
                              {formatCount(product.purchases)}
                            </Text>
                          </Box>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Box minWidth="80px">
                            <Text variant="bodyMd" alignment="end" as="span">
                              {formatRate(product.conversionRate)}
                            </Text>
                          </Box>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Box minWidth="120px">
                            <InlineStack align="center" blockAlign="center">
                              <Badge
                                tone={
                                  product.action === "Consider Moving Higher"
                                    ? "success"
                                    : "warning"
                                }
                              >
                                {product.action}
                              </Badge>
                            </InlineStack>
                          </Box>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </Card>
                )
              )}
            </BlockStack>
          </BlockStack>
        ) : null}
      </Modal.Section>
    </Modal>
  );
}
