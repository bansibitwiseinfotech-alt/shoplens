import {
    Box,
    BlockStack,
    InlineStack,
    Pagination,
    Text,
} from "@shopify/polaris";

export default function ZeroResultPagination({
    currentPage,
    pageSize,
    totalItems,
    onPageChange,
}) {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    if (totalItems <= 0) return null;

    return (
        <Box padding="400" borderBlockStartWidth="025" borderColor="border">
            <BlockStack gap="200" align="center" inlineAlign="center">
                <InlineStack align="center">
                    <Pagination
                        accessibilityLabel="Search pagination"
                        hasPrevious={currentPage > 1}
                        onPrevious={() =>
                            onPageChange(Math.max(1, currentPage - 1))
                        }
                        hasNext={currentPage < totalPages}
                        onNext={() =>
                            onPageChange(Math.min(totalPages, currentPage + 1))
                        }
                        label={`${currentPage} of ${totalPages}`}
                    />
                </InlineStack>

                <Text variant="bodyXs" tone="subdued">
                    Showing {startItem}–{endItem} of {totalItems} searches
                </Text>
            </BlockStack>
        </Box>
    );
}
