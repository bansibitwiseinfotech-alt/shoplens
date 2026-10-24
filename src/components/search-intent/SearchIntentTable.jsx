/* eslint-disable react/prop-types */
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    Badge,
    Spinner,
    Box,
    EmptyState,
    IndexTable,
} from "@shopify/polaris";
import {
    buildShopperNeed,
    calculateUnderstandingQuality,
    formatAttributeValue,
} from "../../utils/shopperNeed.js";

function formatAttributeChip(val, tone = "subdued") {
    if (!val || typeof val !== "string" || !val.trim()) {
        return <Text as="span" tone="subdued">—</Text>;
    }
    const formatted = formatAttributeValue(val);
    return <Badge tone={tone}>{formatted}</Badge>;
}

function renderUnderstandingQualityBadge(item) {
    const quality = calculateUnderstandingQuality(item);

    if (quality.score == null) {
        return <Text as="span" tone="subdued">—</Text>;
    }

    return <Badge tone={quality.tone}>{quality.formatted}</Badge>;
}

export default function SearchIntentTable({
    items = [],
    loading,
    pagination,
    onPageChange,
    onViewDetails,
}) {
    const hasItems = items && items.length > 0;
    const totalItems = Number(pagination?.total) || 0;
    const pageSize = Number(pagination?.limit) || 20;
    const currentPage = Math.max(1, Number(pagination?.page) || 1);
    const totalPages = Math.max(1, Number(pagination?.totalPages) || Math.ceil(totalItems / pageSize) || 1);
    const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    const headings = [
        { title: "Customer Search" },
        { title: "Product Type" },
        { title: "Brand" },
        { title: "Color" },
        { title: "Size" },
        { title: "Price" },
        { title: "Category" },
        { title: "Understanding Quality", alignment: "center" },
        { title: "Searches", alignment: "end" },
        { title: "Shopper Need" },
    ];

    const rowMarkup = items.map((item, idx) => {
        const shopperNeed = buildShopperNeed(item);

        return (
            <IndexTable.Row
                id={item._id || `${item.searchQuery}-${idx}`}
                key={item._id || `${item.searchQuery}-${idx}`}
                position={idx}
                onClick={() => onViewDetails && onViewDetails(item)}
            >
                <IndexTable.Cell>
                    <Box minWidth="140px">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {item.searchQuery}
                        </Text>
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="90px">
                        {formatAttributeChip(item.productType, "info")}
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="80px">
                        {formatAttributeChip(item.brand, "success")}
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="70px">
                        {formatAttributeChip(item.color, "attention")}
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="60px">
                        {formatAttributeChip(item.size, "warning")}
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="80px">
                        {formatAttributeChip(item.price, "attention")}
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="90px">
                        {formatAttributeChip(item.category, "new")}
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="120px">
                        <InlineStack align="center" blockAlign="center">
                            {renderUnderstandingQualityBadge(item)}
                        </InlineStack>
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="70px">
                        <Text variant="bodyMd" fontWeight="bold" alignment="end" as="span">
                            {(item.searchCount ?? 1).toLocaleString()}
                        </Text>
                    </Box>
                </IndexTable.Cell>

                <IndexTable.Cell>
                    <Box minWidth="220px">
                        <Text variant="bodySm" as="span">
                            {shopperNeed}
                        </Text>
                    </Box>
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    });

    return (
        <Card padding="0">
            {/* Table Header Label */}
            <Box padding={{ xs: "300", sm: "400" }} borderBlockEndWidth="025" borderColor="border-subdued">
                <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                    <BlockStack gap="050">
                        <Text variant="headingMd" as="h2">
                            Customer Search Intent Queries
                        </Text>
                        <Text variant="bodyXs" tone="subdued">
                            Real search queries parsed into structured product attributes and shopper needs. Click any row to view details.
                        </Text>
                    </BlockStack>
                    <InlineStack gap="200" blockAlign="center" wrap>
                        <Badge tone="success">Live · Auto-updating</Badge>
                        {totalItems > 0 && (
                            <Badge tone="info">
                                {`${totalItems.toLocaleString()} ${totalItems === 1 ? "search" : "searches"} analyzed`}
                            </Badge>
                        )}
                    </InlineStack>
                </InlineStack>
            </Box>

            {/* Loading State */}
            {loading && !hasItems && (
                <Box padding="800">
                    <BlockStack align="center" inlineAlign="center" gap="300">
                        <Spinner accessibilityLabel="Loading search intent data" size="large" />
                        <Text as="p" tone="subdued" variant="bodyMd">
                            Loading search intent data…
                        </Text>
                    </BlockStack>
                </Box>
            )}

            {/* Empty State */}
            {!loading && !hasItems && (
                <Box padding="600">
                    <EmptyState
                        heading="No search data available"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                        <p>Customer search queries will appear here once your store receives searches.</p>
                    </EmptyState>
                </Box>
            )}

            {/* Native Shopify Polaris IndexTable */}
            {hasItems && (
                <IndexTable
                    resourceName={{
                        singular: "search query",
                        plural: "search queries",
                    }}
                    itemCount={totalItems}
                    headings={headings}
                    selectable={false}
                    pagination={{
                        hasPrevious: currentPage > 1,
                        onPrevious: () => onPageChange && onPageChange(currentPage - 1),
                        hasNext: currentPage < totalPages,
                        onNext: () => onPageChange && onPageChange(currentPage + 1),
                        label: `Showing ${startItem}–${endItem} of ${totalItems} searches`,
                    }}
                >
                    {rowMarkup}
                </IndexTable>
            )}
        </Card>
    );
}
