/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback } from "react";
import {
    Box,
    BlockStack,
    InlineGrid,
    InlineStack,
    Text,
    Badge,
    Divider,
    Button,
    Card,
    Spinner,
    Banner,
    Modal,
    Thumbnail,
} from "@shopify/polaris";
import {
    ExternalIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardIcon,
    ClipboardCheckIcon,
    ProductIcon,
} from "@shopify/polaris-icons";
import { matchProducts } from "../../services/searchIntentApi.js";
import {
    buildShopperNeed,
    calculateUnderstandingQuality,
    formatAttributeValue,
} from "../../utils/shopperNeed.js";

/**
 * Format relative time (e.g. "Just now", "5 minutes ago", "2 hours ago", "Yesterday")
 */
function formatRelativeTime(date) {
    if (!date) return "—";
    try {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return "—";
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        if (diffMs < 0) return "Just now";

        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return "Just now";
        if (diffMins === 1) return "1 minute ago";
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours === 1) return "1 hour ago";
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 30) return `${diffDays} days ago`;
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch (_) {
        return "—";
    }
}

/**
 * Format currency price display for catalog products
 */
function formatDisplayPrice(priceVal, query) {
    if (priceVal === null || priceVal === undefined) return null;
    const num = Number(priceVal);
    if (Number.isNaN(num)) return String(priceVal);
    const isDollar = query && (query.includes("$") || /\busd\b/i.test(query));
    if (isDollar) {
        return `$${num.toFixed(2)}`;
    }
    return `₹${num.toLocaleString("en-IN")}`;
}

export default function SearchIntentDrawer({ item, shop, open, onClose }) {
    const [copied, setCopied] = useState(false);

    const [matchingLoading, setMatchingLoading] = useState(false);
    const [matchingData, setMatchingData] = useState(null);
    const [matchError, setMatchError] = useState(null);
    const [showProductsList, setShowProductsList] = useState(true);

    // Auto-fetch real product match data for this query when drawer opens
    useEffect(() => {
        if (!open || !item?.searchQuery) {
            setMatchingData(null);
            setMatchError(null);
            setShowProductsList(true);
            return;
        }

        let isMounted = true;
        setMatchingLoading(true);
        setMatchError(null);

        matchProducts({
            shop,
            searchQuery: item.searchQuery,
            structuredIntent: item.structuredIntent || {},
            attributes: {
                productType: item.productType || "",
                brand: item.brand || "",
                color: item.color || "",
                size: item.size || "",
                price: item.price || "",
                category: item.category || "",
                otherRequirements: item.otherRequirements || [],
            },
        })
            .then((res) => {
                if (isMounted) {
                    if (res?.success && res?.data) {
                        setMatchingData(res.data);
                    } else {
                        setMatchingData({ matchedCount: 0, products: [] });
                    }
                }
            })
            .catch((err) => {
                if (isMounted) {
                    console.warn(
                        "[SearchIntentDrawer] Match products error:",
                        err
                    );
                    setMatchError(
                        err.message || "Failed to load matching products"
                    );
                    setMatchingData(null);
                }
            })
            .finally(() => {
                if (isMounted) {
                    setMatchingLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [open, item, shop]);

    // Copy search query handler
    const handleCopyQuery = useCallback(() => {
        if (!item?.searchQuery) return;
        navigator.clipboard
            ?.writeText(item.searchQuery)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
    }, [item?.searchQuery]);

    if (!open || !item) return null;

    const query = item.searchQuery || "";
    const searches = item.searchCount ?? 1;
    const quality = calculateUnderstandingQuality(item);

    const productType = item.productType || "";
    const brand = item.brand || "";
    const color = item.color || "";
    const size = item.size || "";
    const price = item.price || "";
    const category = item.category || "";
    const otherReqs = Array.isArray(item.otherRequirements)
        ? item.otherRequirements.filter(Boolean)
        : [];

    // Filter list of active badges for Search Requirements
    const detectedBadges = [];
    if (productType)
        detectedBadges.push({
            label: formatAttributeValue(productType),
            tone: "info",
        });
    if (brand)
        detectedBadges.push({
            label: formatAttributeValue(brand),
            tone: "success",
        });
    if (color)
        detectedBadges.push({
            label: formatAttributeValue(color),
            tone: "attention",
        });
    if (size) detectedBadges.push({ label: `Size ${size}`, tone: "warning" });
    if (price)
        detectedBadges.push({ label: `Price: ${price}`, tone: "attention" });
    if (category && category.toLowerCase() !== productType.toLowerCase()) {
        detectedBadges.push({
            label: formatAttributeValue(category),
            tone: "new",
        });
    }
    otherReqs.forEach((r) => {
        detectedBadges.push({ label: formatAttributeValue(r), tone: "info" });
    });

    // Query token mappings
    const interpretationMappings = [];
    if (brand) {
        interpretationMappings.push({
            token: brand.toLowerCase(),
            label: "Brand",
        });
    }
    if (productType) {
        interpretationMappings.push({
            token: productType.toLowerCase(),
            label: "Product Type",
        });
    }
    if (color) {
        interpretationMappings.push({
            token: color.toLowerCase(),
            label: "Color",
        });
    }
    if (size) {
        interpretationMappings.push({
            token: size.toLowerCase(),
            label: "Size",
        });
    }
    if (price) {
        interpretationMappings.push({
            token: price.toLowerCase(),
            label: "Price",
        });
    }
    if (category && category.toLowerCase() !== productType.toLowerCase()) {
        interpretationMappings.push({
            token: category.toLowerCase(),
            label: "Category",
        });
    }
    otherReqs.forEach((r) => {
        interpretationMappings.push({
            token: r.toLowerCase(),
            label: "Requirement",
        });
    });

    // Matched attributes list for Smart Product Matching
    const matchedAttributesList =
        matchingData?.matchedAttributesList &&
        matchingData.matchedAttributesList.length > 0
            ? matchingData.matchedAttributesList
            : [
                  productType && "Product Type",
                  brand && "Brand",
                  color && "Color",
                  size && "Size",
                  price && "Price",
                  category && "Category",
              ].filter(Boolean);

    const matchedProductsCount = matchingData?.matchedCount ?? 0;
    const realProducts = matchingData?.products || [];

    const shopDomain = shop || "promobile-hub.myshopify.com";
    const shopifyCatalogSearchUrl = `https://${shopDomain}/admin/products?selectedView=all&query=${encodeURIComponent(query)}`;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Search Intent Details"
            size="large"
            limitHeight
            footer={
                <InlineStack align="space-between" blockAlign="center">
                    <Button
                        icon={ExternalIcon}
                        url={shopifyCatalogSearchUrl}
                        target="_blank"
                    >
                        Search in Products
                    </Button>
                    <Button variant="primary" onClick={onClose}>
                        Done
                    </Button>
                </InlineStack>
            }
        >
            <Modal.Section>
                <BlockStack gap="400">
                    <Text variant="bodySm" tone="subdued">
                        Analyzed customer search query &amp; extracted
                        attributes
                    </Text>
                    {/* 1. Customer Search Spotlight Card */}
                    <Card padding="400">
                        <BlockStack gap="200">
                            <InlineStack
                                align="space-between"
                                blockAlign="center"
                            >
                                <Text
                                    variant="bodyXs"
                                    tone="subdued"
                                    fontWeight="semibold"
                                >
                                    CUSTOMER SEARCH QUERY
                                </Text>
                                <Button
                                    variant="plain"
                                    size="micro"
                                    icon={
                                        copied
                                            ? ClipboardCheckIcon
                                            : ClipboardIcon
                                    }
                                    onClick={handleCopyQuery}
                                >
                                    {copied ? "Copied!" : "Copy"}
                                </Button>
                            </InlineStack>

                            <Text variant="headingXl" as="h3" fontWeight="bold">
                                &ldquo;{query}&rdquo;
                            </Text>

                            <InlineStack gap="200" blockAlign="center" wrap>
                                <Badge tone="info">
                                    {`${searches.toLocaleString()} ${searches === 1 ? "search" : "searches"}`}
                                </Badge>
                                {item.lastSearchedAt && (
                                    <Text variant="bodyXs" tone="subdued">
                                        Last searched:{" "}
                                        {formatRelativeTime(
                                            item.lastSearchedAt
                                        )}
                                    </Text>
                                )}
                            </InlineStack>
                        </BlockStack>
                    </Card>

                    {/* 2. Shopper Need Card */}
                    <Card padding="400">
                        <BlockStack gap="250">
                            <InlineStack
                                align="space-between"
                                blockAlign="center"
                            >
                                <Text
                                    variant="headingSm"
                                    as="h4"
                                    fontWeight="semibold"
                                >
                                    Shopper Need
                                </Text>
                                <Badge tone="info">AI Intent</Badge>
                            </InlineStack>
                            <Divider />
                            <Box
                                padding="300"
                                borderRadius="200"
                                background="bg-surface-secondary"
                                borderInlineStartWidth="050"
                                borderColor="border-brand"
                            >
                                <Text
                                    variant="bodyMd"
                                    as="p"
                                    fontWeight="medium"
                                >
                                    {buildShopperNeed(item)}
                                </Text>
                            </Box>
                        </BlockStack>
                    </Card>

                    {/* 3. Understanding Quality Card */}
                    <Card padding="400">
                        <BlockStack gap="250">
                            <InlineStack
                                align="space-between"
                                blockAlign="center"
                            >
                                <Text
                                    variant="headingSm"
                                    as="h4"
                                    fontWeight="semibold"
                                >
                                    Understanding Quality
                                </Text>
                                <Badge tone={quality.tone}>
                                    {quality.formatted}
                                </Badge>
                            </InlineStack>
                            <Divider />
                            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                                <Box
                                    padding="250"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                    borderWidth="025"
                                    borderColor="border-subdued"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Quality Level
                                        </Text>
                                        <Text
                                            variant="bodyMd"
                                            fontWeight="bold"
                                            tone={
                                                quality.level === "High"
                                                    ? "success"
                                                    : quality.level === "Medium"
                                                      ? "warning"
                                                      : "critical"
                                            }
                                        >
                                            {quality.level}
                                        </Text>
                                    </BlockStack>
                                </Box>
                                <Box
                                    padding="250"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                    borderWidth="025"
                                    borderColor="border-subdued"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Confidence Score
                                        </Text>
                                        <Text
                                            variant="bodyMd"
                                            fontWeight="bold"
                                        >
                                            {quality.score != null
                                                ? `${quality.score}%`
                                                : "0%"}
                                        </Text>
                                    </BlockStack>
                                </Box>
                            </InlineGrid>
                        </BlockStack>
                    </Card>

                    {/* 4. Extracted Shopping Attributes Card */}
                    <Card padding="400">
                        <BlockStack gap="250">
                            <InlineStack
                                align="space-between"
                                blockAlign="center"
                            >
                                <Text
                                    variant="headingSm"
                                    as="h4"
                                    fontWeight="semibold"
                                >
                                    Extracted Shopping Attributes
                                </Text>
                                <Badge
                                    tone={
                                        detectedBadges.length > 0
                                            ? "success"
                                            : "subdued"
                                    }
                                >
                                    {detectedBadges.length > 0
                                        ? `${detectedBadges.length} detected`
                                        : "0 detected"}
                                </Badge>
                            </InlineStack>
                            <Divider />

                            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                                <Box
                                    padding="200"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Product Type
                                        </Text>
                                        <Text
                                            variant="bodySm"
                                            fontWeight={
                                                productType ? "bold" : "regular"
                                            }
                                            tone={
                                                productType
                                                    ? "default"
                                                    : "subdued"
                                            }
                                        >
                                            {productType
                                                ? formatAttributeValue(
                                                      productType
                                                  )
                                                : "—"}
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Brand
                                        </Text>
                                        <Text
                                            variant="bodySm"
                                            fontWeight={
                                                brand ? "bold" : "regular"
                                            }
                                            tone={brand ? "default" : "subdued"}
                                        >
                                            {brand
                                                ? formatAttributeValue(brand)
                                                : "—"}
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Color
                                        </Text>
                                        <Text
                                            variant="bodySm"
                                            fontWeight={
                                                color ? "bold" : "regular"
                                            }
                                            tone={color ? "default" : "subdued"}
                                        >
                                            {color
                                                ? formatAttributeValue(color)
                                                : "—"}
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Size
                                        </Text>
                                        <Text
                                            variant="bodySm"
                                            fontWeight={
                                                size ? "bold" : "regular"
                                            }
                                            tone={size ? "default" : "subdued"}
                                        >
                                            {size || "—"}
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Price
                                        </Text>
                                        <Text
                                            variant="bodySm"
                                            fontWeight={
                                                price ? "bold" : "regular"
                                            }
                                            tone={price ? "default" : "subdued"}
                                        >
                                            {price || "—"}
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="150"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Category
                                        </Text>
                                        <Text
                                            variant="bodySm"
                                            fontWeight={
                                                category ? "bold" : "regular"
                                            }
                                            tone={
                                                category ? "default" : "subdued"
                                            }
                                        >
                                            {category
                                                ? formatAttributeValue(category)
                                                : "—"}
                                        </Text>
                                    </BlockStack>
                                </Box>

                                {otherReqs.length > 0 && (
                                    <Box
                                        padding="200"
                                        borderRadius="150"
                                        background="bg-surface-secondary"
                                    >
                                        <BlockStack gap="050">
                                            <Text
                                                variant="bodyXs"
                                                tone="subdued"
                                            >
                                                Other Requirements
                                            </Text>
                                            <Text
                                                variant="bodySm"
                                                fontWeight="bold"
                                            >
                                                {otherReqs
                                                    .map(formatAttributeValue)
                                                    .join(", ")}
                                            </Text>
                                        </BlockStack>
                                    </Box>
                                )}
                            </InlineGrid>

                            {detectedBadges.length > 0 && (
                                <InlineStack gap="150" wrap>
                                    {detectedBadges.map((badge, idx) => (
                                        <Badge
                                            key={`${badge.label}-${idx}`}
                                            tone={badge.tone}
                                        >
                                            {badge.label}
                                        </Badge>
                                    ))}
                                </InlineStack>
                            )}
                        </BlockStack>
                    </Card>

                    {/* 5. Query Token Interpretation Card (if tokens recognized) */}
                    {interpretationMappings.length > 0 && (
                        <Card padding="400">
                            <BlockStack gap="200">
                                <Text
                                    variant="headingSm"
                                    as="h4"
                                    fontWeight="semibold"
                                >
                                    Query Token Interpretation
                                </Text>
                                <Divider />
                                <BlockStack gap="150">
                                    {interpretationMappings.map((map, idx) => (
                                        <Box
                                            key={`${map.token}-${idx}`}
                                            padding="200"
                                            borderRadius="150"
                                            background="bg-surface-secondary"
                                        >
                                            <InlineStack
                                                align="space-between"
                                                blockAlign="center"
                                            >
                                                <Text
                                                    variant="bodySm"
                                                    fontWeight="bold"
                                                >
                                                    &ldquo;{map.token}&rdquo;
                                                </Text>
                                                <InlineStack
                                                    gap="100"
                                                    blockAlign="center"
                                                >
                                                    <Text
                                                        variant="bodyXs"
                                                        tone="subdued"
                                                    >
                                                        &rarr;
                                                    </Text>
                                                    <Badge tone="info">
                                                        {map.label}
                                                    </Badge>
                                                </InlineStack>
                                            </InlineStack>
                                        </Box>
                                    ))}
                                </BlockStack>
                            </BlockStack>
                        </Card>
                    )}

                    {/* 6. Smart Product Matching Card */}
                    <Card padding="400">
                        <BlockStack gap="300">
                            <InlineStack
                                align="space-between"
                                blockAlign="center"
                            >
                                <InlineStack gap="150" blockAlign="center">
                                    <Text
                                        variant="headingSm"
                                        as="h4"
                                        fontWeight="semibold"
                                    >
                                        Smart Product Matching
                                    </Text>
                                </InlineStack>
                                {matchingLoading ? (
                                    <Spinner size="small" />
                                ) : (
                                    <Badge
                                        tone={
                                            matchedProductsCount > 0
                                                ? "success"
                                                : "subdued"
                                        }
                                    >
                                        {matchedProductsCount > 0
                                            ? `${matchedProductsCount} matching ${matchedProductsCount === 1 ? "product" : "products"}`
                                            : "0 matching products"}
                                    </Badge>
                                )}
                            </InlineStack>
                            <Divider />

                            {matchingLoading && (
                                <Box padding="400">
                                    <InlineStack
                                        align="center"
                                        blockAlign="center"
                                        gap="200"
                                    >
                                        <Spinner size="small" />
                                        <Text variant="bodySm" tone="subdued">
                                            Matching real store products against
                                            detected search requirements...
                                        </Text>
                                    </InlineStack>
                                </Box>
                            )}

                            {matchError && (
                                <Banner tone="critical" title="Matching Error">
                                    <Text as="p">{matchError}</Text>
                                </Banner>
                            )}

                            {!matchingLoading && !matchError && (
                                <>
                                    {matchedProductsCount > 0 ? (
                                        <BlockStack gap="250">
                                            {matchedAttributesList.length >
                                                0 && (
                                                <InlineStack
                                                    gap="150"
                                                    wrap
                                                    blockAlign="center"
                                                >
                                                    <Text
                                                        variant="bodyXs"
                                                        tone="subdued"
                                                        fontWeight="medium"
                                                    >
                                                        Matched on:
                                                    </Text>
                                                    {matchedAttributesList.map(
                                                        (attr) => (
                                                            <Badge
                                                                key={attr}
                                                                tone="success"
                                                            >
                                                                {attr}
                                                            </Badge>
                                                        )
                                                    )}
                                                </InlineStack>
                                            )}

                                            <Button
                                                onClick={() =>
                                                    setShowProductsList(
                                                        (prev) => !prev
                                                    )
                                                }
                                                icon={
                                                    showProductsList
                                                        ? ChevronUpIcon
                                                        : ChevronDownIcon
                                                }
                                                size="slim"
                                                fullWidth
                                            >
                                                {showProductsList
                                                    ? `Hide Matching Products (${matchedProductsCount})`
                                                    : `Show Matching Products (${matchedProductsCount})`}
                                            </Button>

                                            {showProductsList && (
                                                <BlockStack gap="200">
                                                    {realProducts.map(
                                                        (prod, idx) => (
                                                            <Card
                                                                key={
                                                                    prod.id ||
                                                                    idx
                                                                }
                                                                padding="300"
                                                            >
                                                                <BlockStack gap="200">
                                                                    <InlineStack
                                                                        align="space-between"
                                                                        blockAlign="center"
                                                                        wrap
                                                                    >
                                                                        <InlineStack
                                                                            gap="200"
                                                                            blockAlign="center"
                                                                        >
                                                                            <Thumbnail
                                                                                source={
                                                                                    prod.image ||
                                                                                    ProductIcon
                                                                                }
                                                                                alt={
                                                                                    prod.title ||
                                                                                    "Product"
                                                                                }
                                                                                size="small"
                                                                            />
                                                                            <BlockStack gap="050">
                                                                                <Text
                                                                                    as="p"
                                                                                    variant="bodySm"
                                                                                    fontWeight="semibold"
                                                                                    breakWord
                                                                                >
                                                                                    {
                                                                                        prod.title
                                                                                    }
                                                                                </Text>
                                                                                <InlineStack
                                                                                    gap="100"
                                                                                    wrap
                                                                                >
                                                                                    {prod.price !=
                                                                                        null && (
                                                                                        <Text
                                                                                            as="span"
                                                                                            variant="bodyXs"
                                                                                            fontWeight="bold"
                                                                                        >
                                                                                            {formatDisplayPrice(
                                                                                                prod.price,
                                                                                                query
                                                                                            )}
                                                                                        </Text>
                                                                                    )}
                                                                                    {prod.vendor && (
                                                                                        <Text
                                                                                            as="span"
                                                                                            variant="bodyXs"
                                                                                            tone="subdued"
                                                                                        >
                                                                                            Vendor:{" "}
                                                                                            {
                                                                                                prod.vendor
                                                                                            }
                                                                                        </Text>
                                                                                    )}
                                                                                </InlineStack>
                                                                            </BlockStack>
                                                                        </InlineStack>
                                                                        <InlineStack
                                                                            gap="200"
                                                                            blockAlign="center"
                                                                        >
                                                                            {prod.matchScore !=
                                                                                null && (
                                                                                <Badge
                                                                                    tone={
                                                                                        prod.matchScore >=
                                                                                        90
                                                                                            ? "success"
                                                                                            : prod.matchScore >=
                                                                                                70
                                                                                              ? "attention"
                                                                                              : "subdued"
                                                                                    }
                                                                                >
                                                                                    {`${prod.matchScore}% Match · ${prod.matchLevel || "High"}`}
                                                                                </Badge>
                                                                            )}
                                                                            {prod.adminUrl && (
                                                                                <Button
                                                                                    size="slim"
                                                                                    icon={
                                                                                        ExternalIcon
                                                                                    }
                                                                                    url={
                                                                                        prod.adminUrl
                                                                                    }
                                                                                    target="_blank"
                                                                                >
                                                                                    View
                                                                                </Button>
                                                                            )}
                                                                        </InlineStack>
                                                                    </InlineStack>

                                                                    {Array.isArray(
                                                                        prod.matchReasons
                                                                    ) &&
                                                                        prod
                                                                            .matchReasons
                                                                            .length >
                                                                            0 && (
                                                                            <InlineStack
                                                                                gap="100"
                                                                                wrap
                                                                            >
                                                                                {prod.matchReasons.map(
                                                                                    (
                                                                                        reason,
                                                                                        rIdx
                                                                                    ) => (
                                                                                        <Badge
                                                                                            key={`${reason}-${rIdx}`}
                                                                                            tone="success"
                                                                                        >
                                                                                            {
                                                                                                reason
                                                                                            }
                                                                                        </Badge>
                                                                                    )
                                                                                )}
                                                                            </InlineStack>
                                                                        )}
                                                                </BlockStack>
                                                            </Card>
                                                        )
                                                    )}
                                                </BlockStack>
                                            )}
                                        </BlockStack>
                                    ) : (
                                        <Card padding="400">
                                            <BlockStack gap="300">
                                                <Text
                                                    variant="headingSm"
                                                    as="h5"
                                                    fontWeight="semibold"
                                                >
                                                    No strong product matches
                                                    found
                                                </Text>
                                                <Text
                                                    variant="bodySm"
                                                    tone="subdued"
                                                >
                                                    No catalog products matched
                                                    all search constraints
                                                    (product type, brand, or
                                                    price criteria). Unrelated
                                                    products are not forced into
                                                    results.
                                                </Text>
                                                <Banner
                                                    tone="info"
                                                    title="Merchandising Suggestion"
                                                >
                                                    <Text
                                                        as="p"
                                                        variant="bodySm"
                                                    >
                                                        Customer intent:{" "}
                                                        <Text
                                                            as="span"
                                                            fontWeight="semibold"
                                                        >
                                                            {(
                                                                buildShopperNeed(
                                                                    item
                                                                ) || ""
                                                            ).replace(
                                                                /\.$/,
                                                                ""
                                                            )}
                                                        </Text>
                                                        . Consider adding
                                                        matching inventory or
                                                        creating a promotional
                                                        collection to capture
                                                        this demand.
                                                    </Text>
                                                </Banner>
                                            </BlockStack>
                                        </Card>
                                    )}
                                </>
                            )}
                        </BlockStack>
                    </Card>
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}
