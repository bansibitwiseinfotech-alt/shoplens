/* eslint-disable react/prop-types */
import { Card, InlineGrid, BlockStack, Text, SkeletonDisplayText, SkeletonBodyText } from "@shopify/polaris";

export default function SearchIntentSummary({ overview, loading }) {
    const totalUnique = overview?.totalUniqueQueries ?? 0;
    const totalSearches = overview?.totalSearches ?? 0;
    const avgConfidence = overview?.averageConfidence ?? 0;

    return (
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
            {/* Card 1: Unique Searches */}
            <Card padding="400">
                <BlockStack gap="200">
                    <Text variant="headingSm" as="h2" tone="subdued">
                        Unique Searches
                    </Text>
                    {loading ? (
                        <>
                            <SkeletonDisplayText size="small" />
                            <SkeletonBodyText lines={1} />
                        </>
                    ) : (
                        <>
                            <Text variant="heading2xl" as="p" fontWeight="bold">
                                {totalUnique.toLocaleString()}
                            </Text>
                            <Text variant="bodySm" as="p" tone="subdued">
                                Different customer searches analyzed
                            </Text>
                        </>
                    )}
                </BlockStack>
            </Card>

            {/* Card 2: Total Searches */}
            <Card padding="400">
                <BlockStack gap="200">
                    <Text variant="headingSm" as="h2" tone="subdued">
                        Total Searches
                    </Text>
                    {loading ? (
                        <>
                            <SkeletonDisplayText size="small" />
                            <SkeletonBodyText lines={1} />
                        </>
                    ) : (
                        <>
                            <Text variant="heading2xl" as="p" fontWeight="bold">
                                {totalSearches.toLocaleString()}
                            </Text>
                            <Text variant="bodySm" as="p" tone="subdued">
                                Total search activity analyzed
                            </Text>
                        </>
                    )}
                </BlockStack>
            </Card>

            {/* Card 3: Intent Confidence */}
            <Card padding="400">
                <BlockStack gap="200">
                    <Text variant="headingSm" as="h2" tone="subdued">
                        Intent Confidence
                    </Text>
                    {loading ? (
                        <>
                            <SkeletonDisplayText size="small" />
                            <SkeletonBodyText lines={1} />
                        </>
                    ) : (
                        <>
                            <Text variant="heading2xl" as="p" fontWeight="bold">
                                {avgConfidence}%
                            </Text>
                            <Text variant="bodySm" as="p" tone="subdued">
                                Average confidence in detected intent
                            </Text>
                        </>
                    )}
                </BlockStack>
            </Card>
        </InlineGrid>
    );
}
