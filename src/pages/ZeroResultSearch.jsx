import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Page,
    Card,
    InlineGrid,
    BlockStack,
    InlineStack,
    Text,
    Badge,
    TextField,
    Select,
    Button,
    Banner,
    Spinner,
    Icon,
    EmptySearchResult,
    Box,
    IndexTable,
} from "@shopify/polaris";          
import {
    SearchIcon,
    RefreshIcon,
    ExportIcon,
} from "@shopify/polaris-icons";       
import {        
    getZeroResultSummary,
    getZeroResultSearches,         
} from "../services/zeroResultSearch.api.js";                                             
import SearchGapDrawer from "../components/zero-result/SearchGapDrawer.jsx";

const DEFAULT_SHOP =
    import.meta.env.VITE_SHOP || "promobile-hub.myshopify.com";

/**
 * Format relative time (e.g. "2 days ago", "Yesterday", "Just now")
 */
function formatRelativeTime(date) {
    if (!date) return "—";
    try {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return "—";
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();

        // If timestamp is ahead of now (minor clock skew or timezone offset)
        if (diffMs < 0) {
            // Minor clock difference (under 60s ahead) is just now
            if (diffMs > -60000) return "Just now";
            // If date is more than 60s in the future (timezone mismatch), treat as just now or clamp
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
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch (_) {
        return "—";
    }
}

/**
 * Authoritative classification badges:
 * - one_off -> One-off (subdued)
 * - recurring -> Recurring (info)
 * - high_volume -> High Volume (warning)
 * - high_volume_recurring -> High Volume + Recurring (critical)
 */
function getClassificationInfo(classification) {
    switch (classification) {
        case "high_volume_recurring":
            return { label: "High Volume + Recurring", tone: "critical" };
        case "high_volume":
            return { label: "High Volume", tone: "warning" };
        case "recurring":
            return { label: "Recurring", tone: "info" };
        case "one_off":
        default:
            return { label: "One-off", tone: "subdued" };
    }
}

/**
 * Export dataset to CSV
 */
function exportToCsv(items, filename = "zero-result-searches.csv") {
    if (!items || items.length === 0) return;

    const headers = [
        "Query",
        "Searches",
        "Status",
        "Clicks",
        "Purchases",
        "Results",
        "Opportunity",
        "Potential Products",
        "Last Seen",
        "Unique Customers",
        "Active Days",
        "Opportunity Score",
    ];

    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    const rows = items.map((item) => {
        const classificationInfo = getClassificationInfo(item.classification);
        const oppBadge = getOpportunityBadge(item);
        const hasResults = Boolean(item.hasResults === true || (item.resultCount && item.resultCount > 0));
        return [
            escapeCsv(item.query),
            escapeCsv(item.searches),
            escapeCsv(classificationInfo.label),
            escapeCsv(item.clicks || 0),
            escapeCsv(item.purchases || 0),
            escapeCsv(hasResults ? "Yes" : "No"),
            escapeCsv(oppBadge.label),
            escapeCsv(item.potentialProducts !== undefined ? item.potentialProducts : 0),
            escapeCsv(formatRelativeTime(item.lastSeen)),
            escapeCsv(item.uniqueCustomers !== undefined ? item.uniqueCustomers : ""),
            escapeCsv(item.activeDays !== undefined ? item.activeDays : ""),
            escapeCsv(item.opportunityScore !== undefined ? item.opportunityScore : ""),
        ];
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Opportunity classification badge mapper:
 * - "Opportunity" / "Potential Opportunity" — matching/relevant products exist
 * - "At Risk" — meaningful search demand but unable to discover products
 * - "Low" — low-volume opportunities
 * - "No Opportunity" — insufficient evidence of commercial value
 */
function getOpportunityBadge(item) {
    const opp = item.opportunity;
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

    const potentialCount = Number(item.potentialProducts || 0);
    const searches = Number(item.searches || 1);

    if (potentialCount > 0) {
        if (searches >= 5 || item.isHighVolume || item.isRecurring) {
            return { label: "Opportunity", tone: "success" };
        }
        if (searches >= 4) {
            return { label: "Potential Opportunity", tone: "attention" };
        }
        return { label: "Low", tone: "subdued" };
    }

    if (searches >= 4 || item.isHighVolume || item.isRecurring) {
        return { label: "At Risk", tone: "warning" };
    }

    return { label: "No Opportunity", tone: "subdued" };
}

/**
 * Zero-Result Searches Table
 * Native Shopify Polaris IndexTable with built-in responsive scrolling,
 * sticky headers, and integrated pagination.
 */
function ZeroResultTable({
    items,
    totalItems,
    currentPage,
    pageSize,
    onPageChange,
    onOpenDetails,
}) {
    if (!items || items.length === 0) return null;

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    const headings = [
        { title: "Query" },
        { title: "Searches", alignment: "end" },
        { title: "Status", alignment: "center" },
        { title: "Clicks", alignment: "end" },
        { title: "Purchases", alignment: "end" },
        { title: "Results", alignment: "center" },
        { title: "Opportunity", alignment: "center" },
        { title: "Potential Products", alignment: "end" },
        { title: "Last Seen", alignment: "end" },
        { title: "Action", alignment: "center" },
    ];

    const rowMarkup = items.map((item, index) => {
        const classificationInfo = getClassificationInfo(item.classification);
        const oppBadge = getOpportunityBadge(item);
        const hasResults = Boolean(item.hasResults === true || (item.resultCount && item.resultCount > 0));

        return (
            <IndexTable.Row
                id={`${item.query}-${index}`}
                key={`${item.query}-${index}`}
                position={index}
                onClick={() => onOpenDetails(item)}
            >
                <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="semibold" truncate>
                        {item.query}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold" alignment="end">
                        {(item.searches || 1).toLocaleString()}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack align="center">
                        <Badge tone={classificationInfo.tone}>
                            {classificationInfo.label}
                        </Badge>
                    </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" alignment="end">
                        {(item.clicks || 0).toLocaleString()}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" alignment="end">
                        {(item.purchases || 0).toLocaleString()}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack align="center">
                        <Badge tone={hasResults ? "success" : "subdued"}>
                            {hasResults ? "Yes" : "No"}
                        </Badge>
                    </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack align="center">
                        <Badge tone={oppBadge.tone}>
                            {oppBadge.label}
                        </Badge>
                    </InlineStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="semibold" alignment="end">
                        {(item.potentialProducts || 0).toLocaleString()}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodySm" tone="subdued" alignment="end">
                        {formatRelativeTime(item.lastSeen)}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack align="center">
                        <Button
                            size="micro"
                            variant="plain"
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenDetails(item);
                            }}
                        >
                            View details
                        </Button>
                    </InlineStack>
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    });

    return (
        <Card padding="0">
            <IndexTable
                resourceName={{
                    singular: "zero-result search",
                    plural: "zero-result searches",
                }}
                itemCount={totalItems}
                headings={headings}
                selectable={false}
                pagination={{
                    hasPrevious: currentPage > 1,
                    onPrevious: () => onPageChange(currentPage - 1),
                    hasNext: currentPage < totalPages,
                    onNext: () => onPageChange(currentPage + 1),
                    label: `Showing ${startItem}–${endItem} of ${totalItems} searches`,
                }}
            >
                {rowMarkup}
            </IndexTable>
        </Card>
    );
}

export default function ZeroResultSearch({ shop: propShop }) {
    // Resolve active shop domain
    const resolvedShop = useMemo(() => {
        if (propShop) return propShop;
        if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search);
            const urlShop = urlParams.get("shop");
            if (urlShop) return urlShop;
        }
        return DEFAULT_SHOP;
    }, [propShop]);

    // Data state
    const [summary, setSummary] = useState(null);
    const [searches, setSearches] = useState([]);

    // Loading & error state
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [dateValidationError, setDateValidationError] = useState("");

    // Filter controls state
    const [searchText, setSearchText] = useState(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            return params.get("query") || "";
        }
        return "";
    });
    const [statusFilter, setStatusFilter] = useState("all");
    const [volumeFilter, setVolumeFilter] = useState("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [appliedDates, setAppliedDates] = useState({ from: "", to: "" });
    const [sort, setSort] = useState("recent");

    // Pagination state - Default 20 rows (10 per column) matching Search Intelligence
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Drawer state
    const [selectedSearch, setSelectedSearch] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Deep-link auto-select when ?query= is provided in URL
    useEffect(() => {
        if (typeof window !== "undefined" && searches.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const queryParam = params.get("query");
            if (queryParam) {
                const match = searches.find(
                    (s) => (s.query || "").toLowerCase() === queryParam.toLowerCase()
                );
                if (match) {
                    setSelectedSearch(match);
                    setDrawerOpen(true);
                }
            }
        }
    }, [searches]);

    /**
     * Load dashboard data with background auto-refresh support.
     */
    const loadDashboard = useCallback(
        async (isFullReload = false, isBackground = false) => {
            if (!resolvedShop) return;

            try {
                if (!isBackground) {
                    if (isFullReload) setLoading(true);
                    else setRefreshing(true);
                }
                setError(null);

                const searchParams = {
                    shop: resolvedShop,
                    sort,
                    limit: 100,
                    ...(appliedDates.from ? { from: appliedDates.from } : {}),
                    ...(appliedDates.to ? { to: appliedDates.to } : {}),
                };

                const summaryParams = {
                    shop: resolvedShop,
                    ...(appliedDates.from ? { from: appliedDates.from } : {}),
                    ...(appliedDates.to ? { to: appliedDates.to } : {}),
                };

                const [summaryRes, searchesRes] = await Promise.all([
                    getZeroResultSummary(summaryParams),
                    getZeroResultSearches(searchParams),
                ]);

                setSummary(summaryRes?.data || null);
                setSearches(Array.isArray(searchesRes?.data) ? searchesRes.data : []);
            } catch (err) {
                if (!isBackground) {
                    console.error("ZeroResultSearch dashboard load error:", err);
                    setError(err.message || "Unable to connect to the analytics API.");
                }
            } finally {
                if (!isBackground) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [resolvedShop, sort, appliedDates]
    );

    // Load whenever the shop, date range, or sort order changes.
    useEffect(() => {
        loadDashboard(true, false);
    }, [loadDashboard]);

    useEffect(() => {
        setCurrentPage(1);
    }, [sort]);

    // Background auto-refresh poll every 2.5 seconds without requiring manual refresh button click
    useEffect(() => {
        const triggerSilentRefresh = () => {
            if (typeof document !== "undefined" && document.visibilityState === "visible") {
                loadDashboard(false, true);
            }
        };

        const interval = setInterval(triggerSilentRefresh, 2500);

        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", triggerSilentRefresh);
            window.addEventListener("focus", triggerSilentRefresh);
        }

        return () => {
            clearInterval(interval);
            if (typeof document !== "undefined") {
                document.removeEventListener("visibilitychange", triggerSilentRefresh);
                window.removeEventListener("focus", triggerSilentRefresh);
            }
        };
    }, [loadDashboard]);

    const handleRefresh = () => {
        loadDashboard(true, false);
    };

    const handleApplyDateFilters = () => {
        setDateValidationError("");
        if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
            setDateValidationError("From date cannot be after To date.");
            return;
        }
        setAppliedDates({ from: fromDate, to: toDate });
        setCurrentPage(1);
    };

    const handleClearFilters = () => {
        setDateValidationError("");
        setSearchText("");
        setStatusFilter("all");
        setVolumeFilter("all");
        setFromDate("");
        setToDate("");
        setAppliedDates({ from: "", to: "" });
        setSort("recent");
        setCurrentPage(1);
    };

    // Filter loaded list locally by query string, status, volume
    const filteredSearches = useMemo(() => {
        let list = searches;

        if (searchText.trim()) {
            const queryTerm = searchText.toLowerCase().trim();
            list = list.filter((item) =>
                (item.query || "").toLowerCase().includes(queryTerm)
            );
        }

        if (statusFilter !== "all") {
            list = list.filter((item) => item.classification === statusFilter);
        }

        if (volumeFilter !== "all") {
            list = list.filter((item) => {
                const count = Number(item.searches) || 0;
                if (volumeFilter === "1-5") return count >= 1 && count <= 5;
                if (volumeFilter === "6-20") return count >= 6 && count <= 20;
                if (volumeFilter === "21-100") return count >= 21 && count <= 100;
                if (volumeFilter === "100+") return count > 100;
                return true;
            });
        }

        return list;
    }, [searches, searchText, statusFilter, volumeFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchText, statusFilter, volumeFilter]);

    // Paginated slice
    const paginatedSearches = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredSearches.slice(start, start + pageSize);
    }, [filteredSearches, currentPage, pageSize]);

    const handleOpenDetails = (item) => {
        setSelectedSearch(item);
        setDrawerOpen(true);
    };

    // Summary KPI values
    const totalZeroResultSearches = summary?.zeroResultSearches ?? 0;
    const uniqueZeroQueries = summary?.uniqueFailedQueries ?? 0;
    const potentialProductsCount =
        summary?.potentialProductGaps ??
        summary?.recurringGaps ??
        summary?.potentialProducts ??
        summary?.highVolumeGaps ??
        0;
    const zeroResultRate = summary?.zeroResultRate !== undefined ? `${summary.zeroResultRate}%` : "0.0%";

    return (
        <Page
            title="Zero-Result Search Detector"
            subtitle="Detect searches that return no products and identify recurring, high-volume gaps that may represent missed sales opportunities."
            fullWidth
            breadcrumbs={[
                {
                    content: "Search Intelligence",
                    url: "/app/search-intelligence",
                },
            ]}
            secondaryActions={[
                {
                    content: "Refresh",
                    icon: RefreshIcon,
                    loading: refreshing,
                    disabled: refreshing,
                    onAction: handleRefresh,
                },
            ]}
        >
            <Box
                paddingInline={{ xs: "400", sm: "600", md: "700" }}
                paddingBlockStart="100"
                paddingBlockEnd={{ xs: "300", sm: "400" }}
            >
                <BlockStack gap={{ xs: "300", sm: "400" }}>
                {/* Error Banner */}
                {error && (
                    <Banner tone="critical" onDismiss={() => setError(null)}>
                        <InlineStack align="space-between" blockAlign="center">
                            <p>{error}</p>
                            <Button onClick={() => loadDashboard(true)} size="slim">
                                Retry
                            </Button>
                        </InlineStack>
                    </Banner>
                )}

                {dateValidationError && (
                    <Banner tone="critical" onDismiss={() => setDateValidationError("")}>
                        <p>{dateValidationError}</p>
                    </Banner>
                )}

                {/* 4 KPI Summary Cards across top (2x2 grid on mobile, 4 columns on desktop) */}
                <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap={{ xs: "300", sm: "400" }}>
                    <Card padding={{ xs: "300", sm: "400" }}>
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued" truncate>
                                Total Zero-Result Searches
                            </Text>
                            <Text variant="headingLg" as="h3">
                                {loading && !summary ? "—" : totalZeroResultSearches.toLocaleString()}
                            </Text>
                            <Text variant="bodyXs" tone="subdued" truncate>
                                {zeroResultRate} of all storewide searches
                            </Text>
                        </BlockStack>
                    </Card>

                    <Card padding={{ xs: "300", sm: "400" }}>
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued" truncate>
                                Unique Zero-Result Queries
                            </Text>
                            <Text variant="headingLg" as="h3">
                                {loading && !summary ? "—" : uniqueZeroQueries.toLocaleString()}
                            </Text>
                            <Text variant="bodyXs" tone="subdued" truncate>
                                Distinct keywords with 0 items
                            </Text>
                        </BlockStack>
                    </Card>

                    <Card padding={{ xs: "300", sm: "400" }}>
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued" truncate>
                                Potential Products (Gaps)
                            </Text>
                            <Text variant="headingLg" as="h3">
                                {loading && !summary ? "—" : potentialProductsCount.toLocaleString()}
                            </Text>
                            <Text variant="bodyXs" tone="subdued" truncate>
                                Recurring gaps requiring action
                            </Text>
                        </BlockStack>
                    </Card>

                    <Card padding={{ xs: "300", sm: "400" }}>
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued" truncate>
                                Zero-Result Rate
                            </Text>
                            <Text variant="headingLg" as="h3">
                                {loading && !summary ? "—" : zeroResultRate}
                            </Text>
                            <Text variant="bodyXs" tone="subdued" truncate>
                                Rate of failed storefront searches
                            </Text>
                        </BlockStack>
                    </Card>
                </InlineGrid>

                {/* Top Search Gap Spotlight (if present) */}
                {summary?.topFailedSearch && (
                    <Card padding="400">
                        <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                                <BlockStack gap="050">
                                    <Text variant="bodyXs" tone="subdued" fontWeight="semibold">
                                        TOP SEARCH GAP SPOTLIGHT
                                    </Text>
                                    <Text variant="headingMd" as="h3" fontWeight="bold">
                                        &quot;{summary.topFailedSearch.query}&quot;
                                    </Text>
                                </BlockStack>
                                <Badge tone={getClassificationInfo(summary.topFailedSearch.classification).tone}>
                                    {getClassificationInfo(summary.topFailedSearch.classification).label}
                                </Badge>
                            </InlineStack>

                            <Text variant="bodySm" tone="subdued">
                                Returned zero products{" "}
                                <Text as="span" fontWeight="semibold" tone="base">
                                    {summary.topFailedSearch.searches} times
                                </Text>{" "}
                                across{" "}
                                <Text as="span" fontWeight="semibold" tone="base">
                                    {summary.topFailedSearch.activeDays || 1}{" "}
                                    {summary.topFailedSearch.activeDays === 1 ? "day" : "days"}
                                </Text>
                                .
                            </Text>

                            <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                                <InlineStack gap="150" blockAlign="baseline">
                                    <Text variant="bodySm" tone="subdued">
                                        Opportunity Score:
                                    </Text>
                                    <Text variant="headingLg" as="span" tone="warning" fontWeight="bold">
                                        {summary.topFailedSearch.opportunityScore ?? 0}
                                    </Text>
                                </InlineStack>
                                <Button onClick={() => handleOpenDetails(summary.topFailedSearch)}>
                                    View Details
                                </Button>
                            </InlineStack>
                        </BlockStack>
                    </Card>
                )}

                {/* Controls Bar */}
                <Card padding={{ xs: "300", sm: "400" }}>
                    <BlockStack gap="300">
                        {/* Search Input */}
                        <TextField
                            prefix={<Icon source={SearchIcon} />}
                            placeholder="Search failed queries..."
                            value={searchText}
                            onChange={setSearchText}
                            clearButton
                            onClearButtonClick={() => setSearchText("")}
                            autoComplete="off"
                        />

                        {/* Status, Volume, and Sort Filters in balanced responsive grid */}
                        <InlineGrid columns={{ xs: 2, sm: 3, md: 3 }} gap={{ xs: "300", sm: "300" }}>
                            <Select
                                label="Status"
                                labelInline
                                options={[
                                    { label: "All Statuses", value: "all" },
                                    { label: "One-off", value: "one_off" },
                                    { label: "Recurring", value: "recurring" },
                                    { label: "High Volume", value: "high_volume" },
                                    { label: "High Volume + Recurring", value: "high_volume_recurring" },
                                ]}
                                value={statusFilter}
                                onChange={setStatusFilter}
                            />
                            <Select
                                label="Volume"
                                labelInline
                                options={[
                                    { label: "All Volumes", value: "all" },
                                    { label: "1–5", value: "1-5" },
                                    { label: "6–20", value: "6-20" },
                                    { label: "21–100", value: "21-100" },
                                    { label: "100+", value: "100+" },
                                ]}
                                value={volumeFilter}
                                onChange={setVolumeFilter}
                            />
                            <Select
                                label="Sort by"
                                labelInline
                                options={[
                                    { label: "Most Recent", value: "recent" },
                                    { label: "Search Volume", value: "volume" },
                                    { label: "Opportunity", value: "opportunity" },
                                    { label: "Active Days", value: "days" },
                                ]}
                                value={sort}
                                onChange={setSort}
                                disabled={refreshing}
                            />
                        </InlineGrid>

                        {/* Date Range: From & To with guaranteed spacing */}
                        <InlineGrid columns={{ xs: 2, sm: 2, md: 2 }} gap={{ xs: "300", sm: "400" }}>
                            <Box minWidth="0" paddingInlineEnd="150">
                                <TextField
                                    type="date"
                                    label="From"
                                    size="slim"
                                    value={fromDate}
                                    onChange={setFromDate}
                                    autoComplete="off"
                                />
                            </Box>
                            <Box minWidth="0" paddingInlineStart="150">
                                <TextField
                                    type="date"
                                    label="To"
                                    size="slim"
                                    value={toDate}
                                    onChange={setToDate}
                                    autoComplete="off"
                                />
                            </Box>
                        </InlineGrid>

                        {/* Actions Row */}
                        <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                            <InlineStack gap="200" blockAlign="center">
                                <Button onClick={handleApplyDateFilters} loading={refreshing}>
                                    Apply
                                </Button>
                                {(fromDate || toDate || searchText || statusFilter !== "all" || volumeFilter !== "all" || sort !== "recent") && (
                                    <Button variant="plain" onClick={handleClearFilters}>
                                        Clear
                                    </Button>
                                )}
                            </InlineStack>
                            <Button
                                icon={ExportIcon}
                                onClick={() => exportToCsv(filteredSearches)}
                                disabled={filteredSearches.length === 0}
                            >
                                Export
                            </Button>
                        </InlineStack>
                    </BlockStack>
                </Card>

                {/* Main 2-Column Split Tables (Matching Search Intelligence page layout) */}
                {loading && searches.length === 0 ? (
                    <Card padding="800">
                        <BlockStack align="center" inlineAlign="center" gap="300">
                            <Spinner size="large" />
                            <Text tone="subdued">Loading zero-result searches...</Text>
                        </BlockStack>
                    </Card>
                ) : filteredSearches.length === 0 ? (
                    <Card padding="600">
                        <EmptySearchResult
                            title={searchText ? `No queries matching "${searchText}"` : "No zero-result searches found"}
                            description={searchText ? "Try adjusting your search terms or filters." : "When customers search for products that return zero products, they will appear here."}
                            withIllustration
                        >
                            <Button onClick={handleClearFilters}>Clear Filters</Button>
                        </EmptySearchResult>
                    </Card>
                ) : (
                    <ZeroResultTable
                        items={paginatedSearches}
                        totalItems={filteredSearches.length}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onOpenDetails={handleOpenDetails}
                    />
                )}
            </BlockStack>
        </Box>

            {/* Detail Drawer */}
            {drawerOpen && selectedSearch ? (
                <SearchGapDrawer
                    isOpen={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    item={selectedSearch}
                    shop={resolvedShop}
                />
            ) : null}
        </Page>
    );
}
