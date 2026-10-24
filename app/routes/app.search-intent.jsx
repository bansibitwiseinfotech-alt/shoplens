import { useState, useEffect, useCallback, useMemo } from "react";
import { useLoaderData } from "react-router";
import {
    Page,
    Card,
    InlineGrid,
    BlockStack,
    InlineStack,
    Text,
    TextField,
    Select,
    Button,
    Banner,
    Icon,
    Box,
} from "@shopify/polaris";
import {
    SearchIcon,
    RefreshIcon,         
    ExportIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import {
    getSearchIntentOverview,
    getSearchIntents,        
    getSearchIntentDetails,
} from "../../src/services/searchIntentApi.js";
import PlanUpgradeGate from "../components/billing/PlanUpgradeGate.jsx";
import SearchIntentTable from "../../src/components/search-intent/SearchIntentTable.jsx";
import SearchIntentDrawer from "../../src/components/search-intent/SearchIntentDrawer.jsx";
import {
    buildShopperNeed,
    calculateUnderstandingQuality,
    formatAttributeValue,
} from "../../src/utils/shopperNeed.js";

export const loader = async ({ request }) => {
    try {
        const { session } = await authenticate.admin(request);
        return {
            shop: session?.shop || "",
        };
    } catch (_) {
        return {
            shop: "",
        };
    }
};

/**
 * Export dataset to CSV
 */
function exportIntentsToCsv(items, filename = "search-intents.csv") {
    if (!items || items.length === 0) return;

    const headers = [
        "Customer Search",
        "Product Type",
        "Brand",
        "Color",
        "Size",
        "Price",
        "Category",
        "Understanding Quality",
        "Searches",
        "Shopper Need",
    ];

    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    const rows = items.map((item) => {
        const quality = calculateUnderstandingQuality(item);
        const shopperNeed = buildShopperNeed(item);

        return [
            escapeCsv(item.searchQuery),
            escapeCsv(item.productType ? formatAttributeValue(item.productType) : "—"),
            escapeCsv(item.brand ? formatAttributeValue(item.brand) : "—"),
            escapeCsv(item.color ? formatAttributeValue(item.color) : "—"),
            escapeCsv(item.size || "—"),
            escapeCsv(item.price || "—"),
            escapeCsv(item.category ? formatAttributeValue(item.category) : "—"),
            escapeCsv(quality.formatted || "—"),
            escapeCsv(item.searchCount ?? 1),
            escapeCsv(shopperNeed),
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

export default function SearchIntentRoute() {
    const data = useLoaderData();
    const shop = data?.shop || "";

    const [overview, setOverview] = useState(null);
    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

    // Filter controls
    const [searchText, setSearchText] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [dateRange, setDateRange] = useState("all");
    const [productTypeFilter, setProductTypeFilter] = useState("all");
    const [brandFilter, setBrandFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [confidenceFilter, setConfidenceFilter] = useState("all");
    const [sort, setSort] = useState("recent");
    const [page, setPage] = useState(1);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [upgradeRequired, setUpgradeRequired] = useState(null);

    // Right-side View Details Drawer state
    const [selectedItem, setSelectedItem] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchText);
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    // Map dateRange string to days
    const getDaysParam = (range) => {
        if (range === "7") return 7;
        if (range === "30") return 30;
        if (range === "90") return 90;
        return null;
    };

    // Load data from backend (supports silent background auto-refresh)
    const fetchData = useCallback(
        async (isRefresh = false, isSilent = false) => {
            if (!isSilent) {
                if (isRefresh) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }
                setError(null);
            }

            try {
                const days = getDaysParam(dateRange);

                const [overviewRes, intentsRes] = await Promise.all([
                    getSearchIntentOverview({ shop }),
                    getSearchIntents({
                        shop,
                        page,
                        limit: 20,
                        sort,
                        days,
                        search: debouncedSearch,
                        productType: productTypeFilter,
                        brand: brandFilter,
                        category: categoryFilter,
                        confidence: confidenceFilter,
                    }),
                ]);

                if (overviewRes?.success && overviewRes?.data) {
                    setOverview(overviewRes.data);
                }

                if (intentsRes?.success && Array.isArray(intentsRes?.data)) {
                    setItems(intentsRes.data);
                    if (intentsRes.pagination) {
                        setPagination(intentsRes.pagination);
                    }
                } else if (!isSilent) {
                    setItems([]);
                }
            } catch (err) {
                console.error("[SearchIntent] Failed to load data:", err);
                if (
                    err.status === 403 ||
                    err.code === "UPGRADE_REQUIRED" ||
                    err.message?.includes("not included in the") ||
                    err.message?.includes("Upgrade to")
                ) {
                    setUpgradeRequired(err.requiredPlan || "pro");
                } else if (!isSilent) {
                    setError(err.message || "Unable to load search intent data. Try again.");
                }
            } finally {
                if (!isSilent) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [
            shop,
            page,
            sort,
            dateRange,
            debouncedSearch,
            productTypeFilter,
            brandFilter,
            categoryFilter,
            confidenceFilter,
        ]
    );

    // Initial fetch and on filter/page changes
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Live auto-refresh: Polls every 2s in background without requiring refresh button click
    useEffect(() => {
        const triggerSilentRefresh = () => {
            if (typeof document !== "undefined" && document.visibilityState === "visible") {
                fetchData(false, true);
            }
        };

        const interval = setInterval(triggerSilentRefresh, 2000);

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
    }, [fetchData]);

    const handleViewDetails = async (item) => {
        setSelectedItem(item);
        setIsDrawerOpen(true);

        if (item?._id) {
            try {
                const res = await getSearchIntentDetails({ shop, id: item._id });
                if (res?.success && res?.data) {
                    setSelectedItem(res.data);
                }
            } catch (err) {
                console.warn("[SearchIntent] Refresh detail warning:", err);
            }
        }
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
        setSelectedItem(null);
    };

    // Real dynamic options for filters extracted directly from backend overview
    const productTypeOptions = useMemo(() => {
        const base = [{ label: "All Types", value: "all" }];
        if (overview?.filterOptions?.productTypes) {
            overview.filterOptions.productTypes.forEach((pt) => {
                const formatted = pt.charAt(0).toUpperCase() + pt.slice(1);
                base.push({ label: formatted, value: pt });
            });
        }
        return base;
    }, [overview]);

    const brandOptions = useMemo(() => {
        const base = [{ label: "All Brands", value: "all" }];
        if (overview?.filterOptions?.brands) {
            overview.filterOptions.brands.forEach((b) => {
                base.push({ label: b, value: b });
            });
        }
        return base;
    }, [overview]);

    const categoryOptions = useMemo(() => {
        const base = [{ label: "All Categories", value: "all" }];
        if (overview?.filterOptions?.categories) {
            overview.filterOptions.categories.forEach((cat) => {
                const formatted = cat.charAt(0).toUpperCase() + cat.slice(1);
                base.push({ label: formatted, value: cat });
            });
        }
        return base;
    }, [overview]);

    const dateRangeOptions = [
        { label: "All Time", value: "all" },
        { label: "Last 7 Days", value: "7" },
        { label: "Last 30 Days", value: "30" },
        { label: "Last 90 Days", value: "90" },
    ];

    const qualityOptions = [
        { label: "All Qualities", value: "all" },
        { label: "High (90–100%)", value: "high" },
        { label: "Medium (70–89%)", value: "medium" },
        { label: "Low (<70%)", value: "low" },
    ];

    const sortOptions = [
        { label: "Most recent", value: "recent" },
        { label: "Most searches", value: "frequency" },
        { label: "Top quality", value: "confidence" },
    ];

    // Real calculated summary metrics
    const totalSearches = overview?.totalSearches ?? 0;
    const totalUniqueQueries = overview?.totalUniqueQueries ?? 0;
    const productTypesDetected = overview?.productTypesDetected ?? 0;
    const brandsDetected = overview?.brandsDetected ?? 0;

    if (upgradeRequired) {
        return (
            <Page
                title="Search Intent Analyzer"
                subtitle="Understand what shoppers mean when they search your store and turn their queries into structured product requirements."
                fullWidth
            >
                <PlanUpgradeGate
                    plan={upgradeRequired}
                    title="Pro Feature"
                    description="Upgrade to Pro to unlock this feature."
                />
            </Page>
        );
    }

    return (
        <Page
            title="Search Intent Analyzer"
            subtitle="Understand what shoppers mean when they search your store and turn their queries into structured product requirements."
            fullWidth
            secondaryActions={[
                {
                    content: "Refresh",
                    icon: RefreshIcon,
                    loading: refreshing,
                    disabled: refreshing || loading,
                    onAction: () => fetchData(true),
                },
                {
                    content: "Export CSV",
                    icon: ExportIcon,
                    disabled: items.length === 0,
                    onAction: () => exportIntentsToCsv(items),
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
                        <Banner
                            title="Unable to load search intent data"
                            tone="critical"
                            onDismiss={() => setError(null)}
                        >
                            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                                <Text as="p">{error}</Text>
                                <Button onClick={() => fetchData(true)} size="slim">
                                    Try again
                                </Button>
                            </InlineStack>
                        </Banner>
                    )}

                    {/* 4 Real KPI Summary Cards (2x2 grid on mobile, 4 columns on desktop) */}
                    <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap={{ xs: "300", sm: "400" }}>
                        <Card padding={{ xs: "300", sm: "400" }}>
                            <BlockStack gap="100">
                                <Text variant="bodySm" tone="subdued" truncate>
                                    Total Search Queries
                                </Text>
                                <Text variant="headingLg" as="h3">
                                    {loading && !overview ? "—" : totalSearches.toLocaleString()}
                                </Text>
                                <Text variant="bodyXs" tone="subdued" truncate>
                                    Storefront searches analyzed
                                </Text>
                            </BlockStack>
                        </Card>

                        <Card padding={{ xs: "300", sm: "400" }}>
                            <BlockStack gap="100">
                                <Text variant="bodySm" tone="subdued" truncate>
                                    Unique Search Queries
                                </Text>
                                <Text variant="headingLg" as="h3">
                                    {loading && !overview ? "—" : totalUniqueQueries.toLocaleString()}
                                </Text>
                                <Text variant="bodyXs" tone="subdued" truncate>
                                    Distinct customer keywords
                                </Text>
                            </BlockStack>
                        </Card>

                        <Card padding={{ xs: "300", sm: "400" }}>
                            <BlockStack gap="100">
                                <Text variant="bodySm" tone="subdued" truncate>
                                    Product Types Detected
                                </Text>
                                <Text variant="headingLg" as="h3">
                                    {loading && !overview ? "—" : productTypesDetected.toLocaleString()}
                                </Text>
                                <Text variant="bodyXs" tone="subdued" truncate>
                                    Queries with identified products
                                </Text>
                            </BlockStack>
                        </Card>

                        <Card padding={{ xs: "300", sm: "400" }}>
                            <BlockStack gap="100">
                                <Text variant="bodySm" tone="subdued" truncate>
                                    Brands Detected
                                </Text>
                                <Text variant="headingLg" as="h3">
                                    {loading && !overview ? "—" : brandsDetected.toLocaleString()}
                                </Text>
                                <Text variant="bodyXs" tone="subdued" truncate>
                                    Queries with identified brands
                                </Text>
                            </BlockStack>
                        </Card>
                    </InlineGrid>

                    {/* Controls Bar */}
                    <Card padding={{ xs: "300", sm: "400" }}>
                        <BlockStack gap="300">
                            {/* Search Input */}
                            <TextField
                                prefix={<Icon source={SearchIcon} />}
                                placeholder="Search customer queries..."
                                value={searchText}
                                onChange={setSearchText}
                                clearButton
                                onClearButtonClick={() => setSearchText("")}
                                autoComplete="off"
                            />

                            {/* Filters Toolbar */}
                            <InlineGrid columns={{ xs: 2, sm: 3, md: 6 }} gap={{ xs: "200", sm: "300" }}>
                                <Select
                                    label="Date"
                                    labelInline
                                    options={dateRangeOptions}
                                    value={dateRange}
                                    onChange={(val) => {
                                        setDateRange(val);
                                        setPage(1);
                                    }}
                                />

                                <Select
                                    label="Type"
                                    labelInline
                                    options={productTypeOptions}
                                    value={productTypeFilter}
                                    onChange={(val) => {
                                        setProductTypeFilter(val);
                                        setPage(1);
                                    }}
                                />

                                <Select
                                    label="Brand"
                                    labelInline
                                    options={brandOptions}
                                    value={brandFilter}
                                    onChange={(val) => {
                                        setBrandFilter(val);
                                        setPage(1);
                                    }}
                                />

                                <Select
                                    label="Category"
                                    labelInline
                                    options={categoryOptions}
                                    value={categoryFilter}
                                    onChange={(val) => {
                                        setCategoryFilter(val);
                                        setPage(1);
                                    }}
                                />

                                <Select
                                    label="Quality"
                                    labelInline
                                    options={qualityOptions}
                                    value={confidenceFilter}
                                    onChange={(val) => {
                                        setConfidenceFilter(val);
                                        setPage(1);
                                    }}
                                />

                                <Select
                                    label="Sort"
                                    labelInline
                                    options={sortOptions}
                                    value={sort}
                                    onChange={(val) => {
                                        setSort(val);
                                        setPage(1);
                                    }}
                                />
                            </InlineGrid>
                        </BlockStack>
                    </Card>

                    {/* Main Table */}
                    <SearchIntentTable
                        items={items}
                        loading={loading}
                        pagination={pagination}
                        onPageChange={(newPage) => setPage(newPage)}
                        onViewDetails={handleViewDetails}
                    />
                </BlockStack>
            </Box>

            {/* View Details Side Drawer */}
            <SearchIntentDrawer
                item={selectedItem}
                shop={shop}
                open={isDrawerOpen}
                onClose={handleCloseDrawer}
            />
        </Page>
    );
}
