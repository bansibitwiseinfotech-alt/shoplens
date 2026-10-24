/* eslint-disable react/prop-types */
import { useState } from "react";
import {
    Modal,
    BlockStack,
    InlineGrid,
    InlineStack,
    Text,
    Badge,
    Box,
    Card,
    Divider,
    Button,
    Spinner,
    Banner,
    Thumbnail,
    Icon,
} from "@shopify/polaris";
import { ExternalIcon, SearchIcon } from "@shopify/polaris-icons";
import { matchProducts } from "../../services/searchIntentApi.js";

function formatDisplayValue(val) {
    if (!val || typeof val !== "string" || !val.trim()) {
        return "Not specified";
    }
    return val
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

export default function SearchIntentDetailsModal({ item, shop, open, onClose }) {
    const [matchingLoading, setMatchingLoading] = useState(false);
    const [matchedData, setMatchedData] = useState(null);
    const [matchError, setMatchError] = useState(null);

    if (!item) return null;

    const query = item.searchQuery || "";
    const searches = item.searchCount ?? 1;

    // Attributes
    const productType = item.productType || "";
    const brand = item.brand || "";
    const color = item.color || "";
    const size = item.size || "";
    const category = item.category || "";
    const otherReqs = Array.isArray(item.otherRequirements)
        ? item.otherRequirements.filter(Boolean)
        : [];

    // Filter list of active badges for Search Requirements
    const detectedBadges = [];
    if (productType) detectedBadges.push({ label: formatDisplayValue(productType), tone: "info" });
    if (brand) detectedBadges.push({ label: formatDisplayValue(brand), tone: "success" });
    if (color) detectedBadges.push({ label: formatDisplayValue(color), tone: "attention" });
    if (size) detectedBadges.push({ label: formatDisplayValue(size), tone: "warning" });
    if (category && category.toLowerCase() !== productType.toLowerCase()) {
        detectedBadges.push({ label: formatDisplayValue(category), tone: "new" });
    }
    otherReqs.forEach((r) => {
        detectedBadges.push({ label: formatDisplayValue(r), tone: "info" });
    });

    const handleFindMatchingProducts = async () => {
        setMatchingLoading(true);
        setMatchError(null);
        try {
            const res = await matchProducts({
                shop,
                searchQuery: query,
                structuredIntent: item.structuredIntent || {},
                attributes: {
                    productType,
                    brand,
                    color,
                    size,
                    category,
                    otherRequirements: otherReqs,
                },
            });

            if (res?.success && res?.data) {
                setMatchedData(res.data);
            } else {
                setMatchedData({ products: [] });
            }
        } catch (err) {
            console.error("[SearchIntent] Matching products error:", err);
            setMatchError(err.message || "Failed to find matching products.");
        } finally {
            setMatchingLoading(false);
        }
    };

    const handleModalClose = () => {
        setMatchedData(null);
        setMatchError(null);
        setMatchingLoading(false);
        onClose();
    };

    return (
        <Modal
            open={open}
            onClose={handleModalClose}
            title="Search Intent Details"
            primaryAction={{
                content: "Close",
                onAction: handleModalClose,
            }}
            size="large"
        >
            <Modal.Section>
                <BlockStack gap="500">
                    {/* Customer Search Section */}
                    <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border-subdued"
                    >
                        <InlineStack align="space-between" blockAlign="center" wrap>
                            <BlockStack gap="100">
                                <Text variant="bodyXs" as="p" tone="subdued" fontWeight="medium">
                                    Customer Search
                                </Text>
                                <Text variant="headingLg" as="h3" fontWeight="bold">
                                    &ldquo;{query}&rdquo;
                                </Text>
                            </BlockStack>
                            <Badge tone="info" size="large">
                                {`${searches.toLocaleString()} ${searches === 1 ? "search" : "searches"}`}
                            </Badge>
                        </InlineStack>
                    </Box>

                    {/* ShopLens understands Section */}
                    <BlockStack gap="300">
                        <Text variant="headingSm" as="h4">
                            ShopLens understands
                        </Text>
                        <Card padding="400">
                            <BlockStack gap="300">
                                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Product
                                        </Text>
                                        <Text
                                            variant="bodyMd"
                                            fontWeight={productType ? "semibold" : "regular"}
                                            tone={productType ? "default" : "subdued"}
                                        >
                                            {formatDisplayValue(productType)}
                                        </Text>
                                    </BlockStack>

                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Brand
                                        </Text>
                                        <Text
                                            variant="bodyMd"
                                            fontWeight={brand ? "semibold" : "regular"}
                                            tone={brand ? "default" : "subdued"}
                                        >
                                            {formatDisplayValue(brand)}
                                        </Text>
                                    </BlockStack>

                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Color
                                        </Text>
                                        <Text
                                            variant="bodyMd"
                                            fontWeight={color ? "semibold" : "regular"}
                                            tone={color ? "default" : "subdued"}
                                        >
                                            {formatDisplayValue(color)}
                                        </Text>
                                    </BlockStack>

                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Size
                                        </Text>
                                        <Text
                                            variant="bodyMd"
                                            fontWeight={size ? "semibold" : "regular"}
                                            tone={size ? "default" : "subdued"}
                                        >
                                            {formatDisplayValue(size)}
                                        </Text>
                                    </BlockStack>

                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Category
                                        </Text>
                                        <Text
                                            variant="bodyMd"
                                            fontWeight={category ? "semibold" : "regular"}
                                            tone={category ? "default" : "subdued"}
                                        >
                                            {formatDisplayValue(category)}
                                        </Text>
                                    </BlockStack>

                                    {otherReqs.length > 0 && (
                                        <BlockStack gap="050">
                                            <Text variant="bodyXs" tone="subdued">
                                                Other Requirements
                                            </Text>
                                            <Text variant="bodyMd" fontWeight="semibold">
                                                {otherReqs.map(formatDisplayValue).join(", ")}
                                            </Text>
                                        </BlockStack>
                                    )}
                                </InlineGrid>
                            </BlockStack>
                        </Card>
                    </BlockStack>

                    {/* Search Requirements Badges Section */}
                    <BlockStack gap="200">
                        <Text variant="headingSm" as="h4">
                            Search Requirements
                        </Text>
                        {detectedBadges.length > 0 ? (
                            <InlineStack gap="200" wrap>
                                {detectedBadges.map((badge, idx) => (
                                    <Badge key={`${badge.label}-${idx}`} tone={badge.tone} size="large">
                                        {badge.label}
                                    </Badge>
                                ))}
                            </InlineStack>
                        ) : (
                            <Text variant="bodySm" tone="subdued">
                                No specific product attributes detected in this search query.
                            </Text>
                        )}
                    </BlockStack>

                    <Divider />

                    {/* Find Matching Products Section */}
                    <Card padding="400">
                        <BlockStack gap="300">
                            <BlockStack gap="100">
                                <Text variant="headingSm" as="h4">
                                    Find Matching Products
                                </Text>
                                <Text variant="bodySm" tone="subdued">
                                    Use these search requirements to find products that match what the customer is looking for.
                                </Text>
                            </BlockStack>

                            <Button
                                variant="primary"
                                onClick={handleFindMatchingProducts}
                                loading={matchingLoading}
                                disabled={matchingLoading}
                            >
                                Find Matching Products
                            </Button>

                            {/* Matching Error */}
                            {matchError && (
                                <Banner tone="critical" title="Unable to find matching products">
                                    <Text as="p">{matchError}</Text>
                                </Banner>
                            )}

                            {/* Loading State for Matching */}
                            {matchingLoading && (
                                <Box padding="400">
                                    <InlineStack align="center" blockAlign="center" gap="200">
                                        <Spinner size="small" />
                                        <Text as="p" tone="subdued">
                                            Matching Shopify products using detected search requirements...
                                        </Text>
                                    </InlineStack>
                                </Box>
                            )}

                            {/* Matching Results */}
                            {!matchingLoading && matchedData && (
                                <BlockStack gap="300">
                                    <Divider />
                                    <InlineStack align="space-between" blockAlign="center">
                                        <Text variant="headingXs" as="h5">
                                            Smart Product Matching Results
                                        </Text>
                                        <Badge tone={matchedData.products?.length > 0 ? "success" : "subdued"}>
                                            {`${matchedData.products?.length || 0} ${matchedData.products?.length === 1 ? "product" : "products"} found`}
                                        </Badge>
                                    </InlineStack>

                                    {matchedData.products?.length === 0 ? (
                                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                            <Text as="p" tone="subdued">
                                                No matching products found in your Shopify store catalog for these search requirements.
                                            </Text>
                                        </Box>
                                    ) : (
                                        <BlockStack gap="200">
                                            {matchedData.products.map((prod, idx) => (
                                                <Box
                                                    key={prod.id || idx}
                                                    padding="300"
                                                    borderWidth="025"
                                                    borderColor="border-subdued"
                                                    borderRadius="200"
                                                >
                                                    <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
                                                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                                                            {prod.image ? (
                                                                <Thumbnail
                                                                    source={prod.image}
                                                                    alt={prod.title || "Product"}
                                                                    size="small"
                                                                />
                                                            ) : (
                                                                <Box
                                                                    background="bg-surface-secondary"
                                                                    borderRadius="100"
                                                                    padding="200"
                                                                >
                                                                    <Icon source={SearchIcon} tone="subdued" />
                                                                </Box>
                                                            )}
                                                            <BlockStack gap="050">
                                                                <Text variant="bodyMd" fontWeight="bold">
                                                                    {prod.title}
                                                                </Text>
                                                                <InlineStack gap="200" wrap>
                                                                    {prod.vendor && (
                                                                        <Text variant="bodyXs" tone="subdued">
                                                                            Vendor: {prod.vendor}
                                                                        </Text>
                                                                    )}
                                                                    {prod.productType && (
                                                                        <Text variant="bodyXs" tone="subdued">
                                                                            Type: {prod.productType}
                                                                        </Text>
                                                                    )}
                                                                    {prod.price != null && (
                                                                        <Text variant="bodyXs" fontWeight="medium">
                                                                            ${Number(prod.price).toFixed(2)}
                                                                        </Text>
                                                                    )}
                                                                </InlineStack>
                                                            </BlockStack>
                                                        </InlineStack>

                                                        {prod.adminUrl && (
                                                            <Button
                                                                size="slim"
                                                                icon={ExternalIcon}
                                                                url={prod.adminUrl}
                                                                external
                                                            >
                                                                Shopify Admin
                                                            </Button>
                                                        )}
                                                    </InlineStack>
                                                </Box>
                                            ))}
                                        </BlockStack>
                                    )}
                                </BlockStack>
                            )}
                        </BlockStack>
                    </Card>
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}
