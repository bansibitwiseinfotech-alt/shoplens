import { useState, useEffect, useCallback } from "react";
import {
    Box,
    BlockStack,
    InlineStack,
    Text,
    Badge,
    Divider,
    Button,
    Card,
    List,
    InlineGrid,
    Modal,
} from "@shopify/polaris";
import {
    ClipboardIcon,
    ClipboardCheckIcon,
    ExternalIcon,
} from "@shopify/polaris-icons";

/**
 * Format full date and time (e.g. "Oct 3, 2026, 11:15 AM")
 */
function formatFullDate(date) {
    if (!date) return "—";
    try {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch (_) {
        return "—";
    }
}

/**
 * Format relative time (e.g. "3m ago", "17 hours ago", "Yesterday")
 */
function formatRelativeTime(date) {
    if (!date) return "";
    try {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return "";
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();

        // If timestamp is ahead of now (minor clock skew or timezone offset)
        if (diffMs < 0) {
            if (diffMs > -60000) return "Just now";
            return "Just now";
        }

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
        return "";
    } catch (_) {
        return "";
    }
}

/**
 * Authoritative classification badges & descriptions
 */
function getClassificationInfo(classification) {
    switch (classification) {
        case "high_volume_recurring":
            return {
                label: "High Volume + Recurring",
                tone: "critical",
                description:
                    "Critical search gap with high query volume repeated over multiple days.",
            };
        case "high_volume":
            return {
                label: "High Volume",
                tone: "warning",
                description:
                    "Substantial search volume returning zero products, creating high drop-off.",
            };
        case "recurring":
            return {
                label: "Recurring",
                tone: "info",
                description:
                    "Repeated searches across different days indicating steady customer demand.",
            };
        case "one_off":
        default:
            return {
                label: "One-off",
                tone: "subdued",
                description:
                    "Isolated search instance. May represent an unusual query, typo, or emerging interest.",
            };
    }
}

function getOpportunityBadge(item) {
    const opp = item?.opportunity;
    if (opp === "Opportunity") {
        return { label: "Opportunity", tone: "success" };
    }
    if (opp === "Potential Opportunity") {
        return { label: "Potential Opportunity", tone: "attention" };
    }
    if (opp === "At Risk") {
        return { label: "At Risk", tone: "warning" };
    }
    if (opp === "Low") {
        return { label: "Low", tone: "subdued" };
    }
    if (opp === "No Opportunity") {
        return { label: "No Opportunity", tone: "subdued" };
    }

    const potentialCount = Number(item?.potentialProducts || 0);
    const searches = Number(item?.searches || 1);

    if (potentialCount > 0) {
        if (searches >= 5 || item?.isHighVolume || item?.isRecurring) {
            return { label: "Opportunity", tone: "success" };
        }
        if (searches >= 4) {
            return { label: "Potential Opportunity", tone: "attention" };
        }
        return { label: "Low", tone: "subdued" };
    }

    if (searches >= 4 || item?.isHighVolume || item?.isRecurring) {
        return { label: "At Risk", tone: "warning" };
    }

    return { label: "No Opportunity", tone: "subdued" };
}

function getImpactTone(level) {
    switch (level) {
        case "High":
            return "critical";
        case "Medium":
            return "attention";
        case "Low":
        default:
            return "info";
    }
}

export default function SearchGapDrawer({ isOpen, onClose, item, shop }) {
    const [copied, setCopied] = useState(false);

    // Reset copied status when item changes
    useEffect(() => {
        setCopied(false);
    }, [item]);

    // Copy query handler
    const handleCopyQuery = useCallback(() => {
        if (!item?.query) return;
        navigator.clipboard
            ?.writeText(item.query)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {
                // fallback if navigator.clipboard fails
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
    }, [item?.query]);

    if (!isOpen || !item) return null;

    const classificationInfo = getClassificationInfo(item.classification);
    const oppBadge = getOpportunityBadge(item);
    const searches = Number(item.searches || 1).toLocaleString();
    const potentialProducts = Number(
        item.potentialProducts || 0
    ).toLocaleString();
    const clicks = Number(item.clicks || 0).toLocaleString();
    const purchases = Number(item.purchases || 0).toLocaleString();
    const impactLevel = item.impactLevel || oppBadge.label || "Low";
    const customerSignal = item.customerSignal || "No results";
    const problem =
        item.problem ||
        "Customers are searching for a product or need but receive no suitable search results.";
    const recommendation =
        item.recommendation ||
        "Review product availability, search synonyms, product tags, pricing filters, and search relevance rules.";

    const uniqueCustomers =
        item.uniqueCustomers !== undefined && item.uniqueCustomers !== null
            ? Number(item.uniqueCustomers).toLocaleString()
            : "—";
    const activeDays = Number(item.activeDays || 1);

    const lastSeenFormatted = formatFullDate(item.lastSeen);
    const lastSeenRelative = formatRelativeTime(item.lastSeen);

    // Shopify Admin products search link
    const shopDomain = shop || "promobile-hub.myshopify.com";
    const shopifyAdminCatalogUrl = `https://${shopDomain}/admin/products?selectedView=all&query=${encodeURIComponent(
        item.query || ""
    )}`;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Search Gap & Opportunity"
            size="large"
            limitHeight
            footer={
                <InlineStack align="space-between" blockAlign="center">
                    <Button
                        icon={ExternalIcon}
                        url={shopifyAdminCatalogUrl}
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
                        Zero-result query analytics & customer demand
                    </Text>
                    {/* Selected Query Spotlight Card */}
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
                                    SEARCH QUERY
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
                                &quot;{item.query}&quot;
                            </Text>

                            <InlineStack gap="200" blockAlign="center" wrap>
                                <Badge tone="critical">{customerSignal}</Badge>
                                <Badge tone={oppBadge.tone}>
                                    {oppBadge.label}
                                </Badge>
                                <Badge tone={getImpactTone(impactLevel)}>
                                    {impactLevel} Impact
                                </Badge>
                                <Badge tone={classificationInfo.tone}>
                                    {classificationInfo.label}
                                </Badge>
                            </InlineStack>
                        </BlockStack>
                    </Card>

                    {/* Metrics Summary Grid */}
                    <Card padding="400">
                        <BlockStack gap="300">
                            <Text variant="headingSm" as="h4">
                                Opportunity & Demand Metrics
                            </Text>
                            <Divider />
                            <InlineGrid columns={{ xs: 2, sm: 2 }} gap="300">
                                <Box
                                    padding="200"
                                    borderRadius="200"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Searches
                                        </Text>
                                        <Text
                                            variant="headingLg"
                                            as="span"
                                            fontWeight="bold"
                                        >
                                            {searches}
                                        </Text>
                                        <Text variant="bodyXs" tone="subdued">
                                            Customer search volume
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="200"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Potential Products
                                        </Text>
                                        <Text
                                            variant="headingLg"
                                            as="span"
                                            fontWeight="bold"
                                            tone={
                                                item.potentialProducts > 0
                                                    ? "success"
                                                    : undefined
                                            }
                                        >
                                            {potentialProducts}
                                        </Text>
                                        <Text variant="bodyXs" tone="subdued">
                                            Matching products in catalog
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="200"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Zero-Result Status
                                        </Text>
                                        <Text
                                            variant="headingMd"
                                            as="span"
                                            fontWeight="bold"
                                            tone="critical"
                                        >
                                            0 Results
                                        </Text>
                                        <Text variant="bodyXs" tone="subdued">
                                            No products returned
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="200"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Opportunity Level
                                        </Text>
                                        <Text
                                            variant="headingMd"
                                            as="span"
                                            fontWeight="bold"
                                        >
                                            {oppBadge.label}
                                        </Text>
                                        <Text variant="bodyXs" tone="subdued">
                                            Commercial potential
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="200"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Clicks
                                        </Text>
                                        <Text
                                            variant="headingLg"
                                            as="span"
                                            fontWeight="bold"
                                        >
                                            {clicks}
                                        </Text>
                                        <Text variant="bodyXs" tone="subdued">
                                            Post-search clicks
                                        </Text>
                                    </BlockStack>
                                </Box>

                                <Box
                                    padding="200"
                                    borderRadius="200"
                                    background="bg-surface-secondary"
                                >
                                    <BlockStack gap="050">
                                        <Text variant="bodyXs" tone="subdued">
                                            Purchases
                                        </Text>
                                        <Text
                                            variant="headingLg"
                                            as="span"
                                            fontWeight="bold"
                                        >
                                            {purchases}
                                        </Text>
                                        <Text variant="bodyXs" tone="subdued">
                                            Attributed orders
                                        </Text>
                                    </BlockStack>
                                </Box>
                            </InlineGrid>
                        </BlockStack>
                    </Card>

                    {/* Problem Explanation */}
                    <Card padding="400">
                        <BlockStack gap="200">
                            <Text variant="headingSm" as="h4">
                                Why This Is An Opportunity
                            </Text>
                            <Divider />
                            <Text as="p" variant="bodyMd">
                                {problem}
                            </Text>
                        </BlockStack>
                    </Card>

                    {/* Recommended Action */}
                    <Card padding="400">
                        <BlockStack gap="200">
                            <Text variant="headingSm" as="h4">
                                Recommended Action
                            </Text>
                            <Divider />
                            <Text as="p" variant="bodyMd" tone="subdued">
                                {recommendation}
                            </Text>
                        </BlockStack>
                    </Card>

                    {/* Diagnostics backed by store data */}
                    <Card padding="400">
                        <BlockStack gap="200">
                            <Text variant="headingSm" as="h4">
                                Activity & Discovery Signal
                            </Text>
                            <Divider />
                            <List type="bullet">
                                <List.Item>
                                    Returned{" "}
                                    <Text as="span" fontWeight="semibold">
                                        0 products
                                    </Text>{" "}
                                    across all storefront search attempts.
                                </List.Item>
                                <List.Item>
                                    Searched{" "}
                                    <Text as="span" fontWeight="semibold">
                                        {searches} times
                                    </Text>{" "}
                                    by shoppers seeking items in your catalog.
                                </List.Item>
                                {uniqueCustomers !== "—" && (
                                    <List.Item>
                                        Triggered by{" "}
                                        <Text as="span" fontWeight="semibold">
                                            {uniqueCustomers} unique shopper
                                            session(s)
                                        </Text>
                                        .
                                    </List.Item>
                                )}
                                <List.Item>
                                    {activeDays > 1 ? (
                                        <>
                                            Repeated demand across{" "}
                                            <Text
                                                as="span"
                                                fontWeight="semibold"
                                            >
                                                {activeDays} different days
                                            </Text>{" "}
                                            — confirms steady demand.
                                        </>
                                    ) : (
                                        <>
                                            Active on{" "}
                                            <Text
                                                as="span"
                                                fontWeight="semibold"
                                            >
                                                1 day
                                            </Text>{" "}
                                            — currently classified as an
                                            isolated query.
                                        </>
                                    )}
                                </List.Item>
                                <List.Item>
                                    {lastSeenFormatted !== "—" && (
                                        <>
                                            Last detected on{" "}
                                            <Text
                                                as="span"
                                                fontWeight="semibold"
                                            >
                                                {lastSeenFormatted}
                                            </Text>
                                            {lastSeenRelative
                                                ? ` (${lastSeenRelative})`
                                                : ""}
                                            .
                                        </>
                                    )}
                                </List.Item>
                            </List>
                        </BlockStack>
                    </Card>
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}
