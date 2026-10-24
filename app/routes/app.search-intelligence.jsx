import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  Tabs,
  InlineGrid,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  TextField,
  Select,
  Banner,
  Box,
  Button,
  Spinner,
  Icon,
  IndexTable,
  useBreakpoints,
} from "@shopify/polaris";
import {
  SearchIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import {
  getSearchSummary,
  getSearchTrends,
  getProductAnalytics,
  getPopularQueries,
} from "../../src/services/searchIntelligenceApi.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const timezoneResponse = await admin.graphql(`
    query SearchIntelligenceShopTimezone {
      shop {
        ianaTimezone
      }
    }
  `);
  const timezonePayload = await timezoneResponse.json();
  const timezone = timezonePayload.data?.shop?.ianaTimezone;
  if (!timezoneResponse.ok || timezonePayload.errors?.length || !timezone) {
    console.error("Could not load the Shopify store timezone for Search Intelligence.");
    throw new Response("Unable to load the store timezone.", { status: 502 });
  }
  return {
    shop: session.shop,
    timezone,
  };
};

/**
 * Format numerical counts with locale grouping (e.g. 12,486).
 */
const formatNumber = (num) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "0";
  return Number(num).toLocaleString();
};

/**
 * Format percentage rates to one decimal place (e.g. 27.7%)..
 */
const formatPercent = (rate) => {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return "0.0%";
  return `${Number(rate).toFixed(1)}%`;
};

function getDateKeyInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getStartOfDayInTimezone(date, timezone) {
  const [year, month, day] = getDateKeyInTimezone(date, timezone)
    .split("-")
    .map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidate = targetWallTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const representedWallTime = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    const adjustment = targetWallTime - representedWallTime;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(candidate);
}

/**
 * Helper to compute visible numbered pagination pages with ellipsis.
 */
function getPageNumbers(currentPage, totalPages) {
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (currentPage <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    }
  }
  return pages;
}

/**
 * Standardized Numbered Pagination Component matching All Products UI.
 */
// eslint-disable-next-line react/prop-types
function NumberedPagination({ currentPage, totalPages, totalCount, pageSize, onPageChange, label = "items" }) {
  if (totalPages <= 1 && totalCount <= pageSize) return null;
  const pageNumbers = getPageNumbers(currentPage, totalPages);
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  return (
    <Box paddingBlockStart="200">
      <BlockStack gap="150" align="center" inlineAlign="center">
        <InlineStack gap="100" align="center" blockAlign="center" wrap>
          <Button
            size="slim"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          >
            Previous
          </Button>

          {pageNumbers.map((pageNumber, i) => {
            if (pageNumber === "...") {
              return (
                <Box key={`ellipsis-${i}`} paddingInline="050">
                  <Text variant="bodySm" tone="subdued">
                    …
                  </Text>
                </Box>
              );
            }
            const isActive = pageNumber === currentPage;
            return (
              <Button
                key={`page-${pageNumber}`}
                size="slim"
                variant={isActive ? "primary" : "secondary"}
                onClick={() => onPageChange(pageNumber)}
              >
                {String(pageNumber)}
              </Button>
            );
          })}

          <Button
            size="slim"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          >
            Next
          </Button>
        </InlineStack>

        <Text variant="bodyXs" tone="subdued">
          Showing {formatNumber(startItem)}–{formatNumber(endItem)} of {formatNumber(totalCount)} {label}
        </Text>
      </BlockStack>
    </Box>
  );
}

/**
 * Responsive product rows keep names readable while metrics reflow at narrow widths.
 */

// eslint-disable-next-line react/prop-types
function ProductTableCard({ products = [] }) {
  const { mdDown } = useBreakpoints();
  if (!products || products.length === 0) return null;

  const getProductTitle = (row) =>
    row.product ||
    `Product #${String(row.productId || "").replace("gid://shopify/Product/", "")}`;

  const getProductMetrics = (row) => [
    { label: "Searches", value: formatNumber(row.searches) },
    { label: "Clicks", value: formatNumber(row.productClicks) },
    { label: "Cart", value: formatNumber(row.addToCart || 0) },
    { label: "Orders", value: formatNumber(row.purchases) },
    {
      label: "Conv. Rate",
      value: formatPercent(row.clickToPurchaseRate || row.conversionRate),
      tone: "success",
    },
  ];

  return (
    <Card padding="0">
      <BlockStack>
        {!mdDown && (
          <Box
            padding="200"
            borderBlockEndWidth="025"
            borderColor="border"
            background="bg-surface-secondary"
          >
            <InlineGrid
              columns="minmax(0, 2.5fr) repeat(5, minmax(2.5rem, 0.55fr))"
              gap="100"
              alignItems="center"
            >
              <Text variant="bodyXs" fontWeight="semibold">
                Product
              </Text>
              {getProductMetrics(products[0]).map(({ label }) => (
                <Text
                  key={label}
                  variant="bodyXs"
                  fontWeight="semibold"
                  alignment="end"
                  truncate
                >
                  {label}
                </Text>
              ))}
            </InlineGrid>
          </Box>
        )}
        {products.map((row, idx) => (
          <Box
            key={row.productId || idx}
            padding={mdDown ? "300" : "200"}
            borderBlockEndWidth={idx < products.length - 1 ? "025" : undefined}
            borderColor="border"
          >
            {mdDown ? (
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold" breakWord>
                  {getProductTitle(row)}
                </Text>
                <InlineGrid
                  columns={{ xs: 2, sm: 3 }}
                  gap="200"
                  role="group"
                  aria-label={`Metrics for ${getProductTitle(row)}`}
                >
                  {getProductMetrics(row).map(({ label, value, tone }) => (
                    <BlockStack key={label} gap="050">
                      <Text variant="bodyXs" tone="subdued">
                        {label}
                      </Text>
                      <Text
                        variant="bodySm"
                        tone={tone}
                        fontWeight={tone ? "semibold" : undefined}
                      >
                        {value}
                      </Text>
                    </BlockStack>
                  ))}
                </InlineGrid>
              </BlockStack>
            ) : (
              <InlineGrid
                columns="minmax(0, 2.5fr) repeat(5, minmax(2.5rem, 0.55fr))"
                gap="100"
                alignItems="center"
                role="group"
                aria-label={`Metrics for ${getProductTitle(row)}`}
              >
                <Text variant="bodySm" fontWeight="semibold" truncate>
                  {getProductTitle(row)}
                </Text>
                {getProductMetrics(row).map(({ label, value, tone }) => (
                  <Text
                    key={label}
                    variant="bodyXs"
                    alignment="end"
                    tone={tone}
                    fontWeight={tone ? "semibold" : undefined}
                    truncate
                  >
                    {value}
                  </Text>
                ))}
              </InlineGrid>
            )}
          </Box>
        ))}
      </BlockStack>
    </Card>
  );
}

/**
 * Responsive Trend Table Card using Shopify Polaris IndexTable.
 */
// eslint-disable-next-line react/prop-types
function TrendTableCard({ trends = [] }) {
  if (!trends || trends.length === 0) return null;

  const headings = [
    { title: "Date" },
    { title: "Searches", alignment: "end" },
    { title: "Clicks", alignment: "end" },
    { title: "Cart", alignment: "end" },
    { title: "Orders", alignment: "end" },
    { title: "Conv. Rate", alignment: "end" },
  ];

  const rowMarkup = trends.map((row, idx) => (
    <IndexTable.Row
      id={String(row.date || `trend-${idx}`)}
      key={row.date || idx}
      position={idx}
    >
      <IndexTable.Cell>
        <Box minWidth="90px">
          <Text variant="bodyMd" fontWeight="semibold">
            {row.label}
          </Text>
        </Box>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Box minWidth="70px">
          <Text variant="bodyMd" fontWeight="semibold" alignment="end">
            {formatNumber(row.searches)}
          </Text>
        </Box>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Box minWidth="60px">
          <Text variant="bodyMd" alignment="end">
            {formatNumber(row.clicks)}
          </Text>
        </Box>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Box minWidth="55px">
          <Text variant="bodyMd" alignment="end">
            {formatNumber(row.cart)}
          </Text>
        </Box>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Box minWidth="60px">
          <Text variant="bodyMd" alignment="end">
            {formatNumber(row.purchases)}
          </Text>
        </Box>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Box minWidth="80px">
          <Text variant="bodyMd" tone="success" fontWeight="semibold" alignment="end">
            {formatPercent(row.rate)}
          </Text>
        </Box>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card padding="0">
      <IndexTable
        resourceName={{ singular: "trend", plural: "trends" }}
        itemCount={trends.length}
        headings={headings}
        selectable={false}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}

export default function SearchIntelligenceAdmin() {
  const { shop, timezone } = useLoaderData();

  // Tab index: 1: All Products, 2: Search Trends
  const [selectedTabIndex, setSelectedTabIndex] = useState(1);

  // Global Date preset: "today" | "last7" | "last30" | "last90"
  const [datePreset, setDatePreset] = useState("last30");

  // Search Trends section controls
  const [trendTimeframe, setTrendTimeframe] = useState("30d");

  // All Products section controls
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [productSortBy, setProductSortBy] = useState("searches_desc");
  const [allProductsPage, setAllProductsPage] = useState(1);
  const allProductsPerPage = 20;

  // Overview top products pagination
  const [overviewPage, setOverviewPage] = useState(1);
  const overviewPerPage = 20;

  // Search Performance table pagination
  const [trendPage, setTrendPage] = useState(1);
  const trendPerPage = 14;

  // Data states
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [products, setProducts] = useState([]);
  const [popularQueries, setPopularQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Billing plan & limit states (Free: 5 products/trends, Pro: 25, Premium: unlimited)
  const [currentPlan, setCurrentPlan] = useState("free");
  const [trendsPlanLimit, setTrendsPlanLimit] = useState(5);
  const [productsPlanLimit, setProductsPlanLimit] = useState(5);
  const activeLoadRef = useRef(null);
  const lastDataContextRef = useRef(null);
  const summaryRef = useRef(null);

  /**
   * Fetch all analytics data concurrently from the backend service.
   */
  const loadData = useCallback(async () => {
    if (!shop) {
      setLoading(false);
      setError("Shopify store context is missing. Reopen the app from Shopify Admin.");
      return;
    }
    activeLoadRef.current?.abort();
    const controller = new AbortController();
    activeLoadRef.current = controller;
    const dataContext = `${shop}:${datePreset}`;
    if (lastDataContextRef.current && lastDataContextRef.current !== dataContext) {
      summaryRef.current = null;
      setSummary(null);
      setTrends([]);
      setProducts([]);
      setPopularQueries([]);
    }
    lastDataContextRef.current = dataContext;

    setLoading(true);
    setError(null);

    const now = new Date();
    let from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = now;

    if (datePreset === "today") {
      from = getStartOfDayInTimezone(now, timezone);
    } else if (datePreset === "last7") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (datePreset === "last30") {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (datePreset === "last90") {
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const currentFrom = from.toISOString();
    const currentTo = to.toISOString();

    const request = Promise.all([
      getSearchSummary({ shop, from: currentFrom, to: currentTo, timezone, signal: controller.signal }),
      getProductAnalytics({ shop, from: currentFrom, to: currentTo, limit: 100, timezone, signal: controller.signal }),
      getSearchTrends({ shop, from: currentFrom, to: currentTo, timezone, signal: controller.signal }),
      getPopularQueries({ shop, from: currentFrom, to: currentTo, limit: 50, timezone, signal: controller.signal }),
    ]);

    try {
      const [sumRes, pRes, tRes, qRes] = await request;

      if (
        !sumRes.data?.summary ||
        !Array.isArray(pRes.data) ||
        !Array.isArray(tRes.data) ||
        !Array.isArray(qRes.data)
      ) {
        throw new Error("Search Intelligence returned an incomplete analytics response.");
      }

      const summaryData = sumRes.data.summary;
      const requiredMetrics = [
        "totalSearches",
        "uniqueSearchTerms",
        "productClicks",
        "totalAddToCart",
        "totalPurchases",
        "conversionRate",
      ];
      if (
        requiredMetrics.some(
          (key) => !Number.isFinite(Number(summaryData[key]))
        )
      ) {
        throw new Error("Search Intelligence returned incomplete metric values.");
      }
      const productList = pRes.data;
      const trendsList = tRes.data;
      const queryList = qRes.data;

      // Enforce billing plan limits: Free (up to 5), Pro (up to 25), Premium (unlimited)
      const plan = tRes.plan || pRes.plan || sumRes.plan || "free";
      setCurrentPlan(plan);

      const tMeta = tRes.meta || {};
      const tLimit = tMeta.planLimit !== undefined
        ? tMeta.planLimit
        : (plan === "free" ? 5 : plan === "pro" ? 25 : null);
      setTrendsPlanLimit(tLimit);

      const pMeta = pRes.meta || {};
      const pLimit = pMeta.planLimit !== undefined
        ? pMeta.planLimit
        : (plan === "free" ? 5 : plan === "pro" ? 25 : null);
      setProductsPlanLimit(pLimit);

      summaryRef.current = summaryData;
      setSummary(summaryData);
      setProducts(productList);
      setTrends(trendsList);
      setPopularQueries(queryList);
      setLastUpdated(new Date());
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Search Intelligence load error:", err);
      const message = err.message || "Unable to load search intelligence data.";
      setError(
        summaryRef.current
          ? `${message} Showing the last successfully loaded metrics.`
          : message
      );
    } finally {
      if (activeLoadRef.current === controller) {
        activeLoadRef.current = null;
        setLoading(false);
      }
    }
  }, [shop, timezone, datePreset]);

  useEffect(() => {
    loadData();
    const refreshInterval = window.setInterval(loadData, 30_000);
    return () => {
      window.clearInterval(refreshInterval);
      activeLoadRef.current?.abort();
    };
  }, [loadData]);

  // Real aggregated metric values from backend summary
  const totalSearches = summary?.totalSearches ?? 0;
  const uniqueSearchTerms = summary?.uniqueSearchTerms ?? summary?.uniqueQueries ?? 0;
  const productClicks = summary?.productClicks ?? summary?.totalClicks ?? 0;
  const totalAddToCart = summary?.totalAddToCart ?? 0;
  const totalOrders = summary?.totalPurchases ?? 0;
  const purchasesFromSearch = summary?.purchasesFromSearch ?? summary?.searchAttributedPurchases ?? 0;
  const searchConversionRate = summary?.conversionRate ?? 0;

  // Filtered & sorted products for "All Products" table
  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (productSearchQuery.trim()) {
      const q = productSearchQuery.toLowerCase().trim();
      list = list.filter((p) =>
        (p.product || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const aSearches = Number(a.searches) || 0;
      const bSearches = Number(b.searches) || 0;
      if (productSortBy === "searches_desc") {
        if (bSearches !== aSearches) return bSearches - aSearches;
        return (Number(b.productClicks) || 0) - (Number(a.productClicks) || 0);
      }
      if (productSortBy === "searches_asc") return aSearches - bSearches;
      if (productSortBy === "clicks_desc") return (Number(b.productClicks) || 0) - (Number(a.productClicks) || 0);
      if (productSortBy === "purchases_desc") return (Number(b.purchases) || 0) - (Number(a.purchases) || 0);
      if (productSortBy === "rate_desc") return (Number(b.clickToPurchaseRate) || 0) - (Number(a.clickToPurchaseRate) || 0);
      if (productSortBy === "title_asc") return (a.product || "").localeCompare(b.product || "");
      return 0;
    });

    return list;
  }, [products, productSearchQuery, productSortBy]);

  // Paginated "All Products" (20 items per page)
  const totalAllProducts = filteredProducts.length;
  const totalAllPages = Math.max(1, Math.ceil(totalAllProducts / allProductsPerPage));
  const currentAllProducts = useMemo(() => {
    const start = (allProductsPage - 1) * allProductsPerPage;
    return filteredProducts.slice(start, start + allProductsPerPage);
  }, [filteredProducts, allProductsPage]);

  const leftColumnProducts = useMemo(
    () => currentAllProducts.slice(0, 10),
    [currentAllProducts],
  );
  const rightColumnProducts = useMemo(
    () => currentAllProducts.slice(10, 20),
    [currentAllProducts],
  );

  // Overview top search products (sorted by searches desc)
  const topSearchProducts = useMemo(() => {
    return [...products]
      .filter((p) => (Number(p.searches) || 0) > 0)
      .sort((a, b) => (Number(b.searches) || 0) - (Number(a.searches) || 0));
  }, [products]);

  const overviewTotalPages = Math.max(1, Math.ceil(topSearchProducts.length / overviewPerPage));
  const currentOverviewProducts = useMemo(() => {
    const start = (overviewPage - 1) * overviewPerPage;
    return topSearchProducts.slice(start, start + overviewPerPage);
  }, [topSearchProducts, overviewPage]);

  const leftOverviewProducts = useMemo(
    () => currentOverviewProducts.slice(0, 10),
    [currentOverviewProducts],
  );
  const rightOverviewProducts = useMemo(
    () => currentOverviewProducts.slice(10, 20),
    [currentOverviewProducts],
  );

  // Daily trend dataset - strictly enforces billing plan limits (Free: up to 5 trends, Pro: up to 25 trends, Premium: unlimited)
  const chartPoints = useMemo(() => {
    let count = trendTimeframe === "7d" ? 7 : trendTimeframe === "90d" ? 90 : 30;

    // Cap trend days according to billing plan limits
    if (trendsPlanLimit !== null && typeof trendsPlanLimit === "number") {
      count = Math.min(count, trendsPlanLimit);
    }

    const today = getDateKeyInTimezone(new Date(), timezone);
    const [year, month, day] = today.split("-").map(Number);
    const todayAsUtc = Date.UTC(year, month - 1, day);
    const points = [];

    const realMap = new Map();
    (trends || []).forEach((t) => {
      if (t.date) realMap.set(t.date, t);
    });

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(todayAsUtc - i * 24 * 60 * 60 * 1000);
      const isoDate = d.toISOString().split("T")[0];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const label = `${monthNames[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;

      const realItem = realMap.get(isoDate);

      const searchesVal = realItem ? realItem.searches || 0 : 0;
      const clicksVal = realItem ? realItem.clicks || 0 : 0;
      const cartVal = realItem ? realItem.addToCart || 0 : 0;
      const purchasesVal = realItem
        ? Math.max(Number(realItem.purchases) || 0, Number(realItem.attributedPurchases) || 0)
        : 0;
      const rateVal = realItem
        ? (searchesVal > 0 && purchasesVal > 0
            ? Number(((purchasesVal / searchesVal) * 100).toFixed(1))
            : Number(realItem.conversionRate) || 0)
        : 0;

      points.push({
        date: isoDate,
        label,
        searches: searchesVal,
        clicks: clicksVal,
        cart: cartVal,
        purchases: purchasesVal,
        rate: rateVal,
      });
    }

    return points;
  }, [trends, trendTimeframe, trendsPlanLimit, timezone]);

  // Paginated trend performance table
  const totalTrendPages = Math.max(1, Math.ceil(chartPoints.length / trendPerPage));
  const currentTrendRows = useMemo(() => {
    const ordered = [...chartPoints].sort((a, b) => {
      const aHasActivity =
        a.searches > 0 || a.clicks > 0 || a.cart > 0 || a.purchases > 0;
      const bHasActivity =
        b.searches > 0 || b.clicks > 0 || b.cart > 0 || b.purchases > 0;
      if (aHasActivity !== bHasActivity) return aHasActivity ? -1 : 1;
      return b.date.localeCompare(a.date);
    });
    const start = (trendPage - 1) * trendPerPage;
    return ordered.slice(start, start + trendPerPage);
  }, [chartPoints, trendPage]);

  const leftTrendRows = useMemo(() => {
    const half = Math.ceil(currentTrendRows.length / 2);
    return currentTrendRows.slice(0, half);
  }, [currentTrendRows]);

  const rightTrendRows = useMemo(() => {
    const half = Math.ceil(currentTrendRows.length / 2);
    return currentTrendRows.slice(half);
  }, [currentTrendRows]);

  // Page-specific calculated metrics
  const discoveredProductsCount = useMemo(() => {
    return products.filter((p) => (Number(p.searches) || 0) > 0).length;
  }, [products]);

  const allProductsAddToCart = summary?.totalAddToCart ?? 0;

  const productConversionRate = useMemo(() => {
    if (productClicks > 0) {
      return `${((purchasesFromSearch / productClicks) * 100).toFixed(1)}%`;
    }
    return "0.0%";
  }, [productClicks, purchasesFromSearch]);

  const peakTrendDay = useMemo(() => {
    if (!chartPoints || chartPoints.length === 0) return null;
    return chartPoints.reduce((max, pt) => ((pt.searches || 0) > (max?.searches || 0) ? pt : max), chartPoints[0]);
  }, [chartPoints]);

  const dailyAverageSearches = useMemo(() => {
    if (!chartPoints || chartPoints.length === 0) return "0.0";
    const total = chartPoints.reduce((sum, pt) => sum + (pt.searches || 0), 0);
    return (total / chartPoints.length).toFixed(1);
  }, [chartPoints]);

  const activeSearchDaysCount = useMemo(() => {
    if (!chartPoints || chartPoints.length === 0) return 0;
    return chartPoints.filter((pt) => (pt.searches || 0) > 0).length;
  }, [chartPoints]);

  const topTrendingQuery = useMemo(() => {
    if (!popularQueries || popularQueries.length === 0) return "None";
    const sorted = [...popularQueries].sort((a, b) => (Number(b.searches) || 0) - (Number(a.searches) || 0));
    return sorted[0] ? (sorted[0].displayQuery || sorted[0].query || "None") : "None";
  }, [popularQueries]);

  // Tabs configuration for Polaris Tabs
  const tabs = [
    {
      id: "all_products",
      content: "All Products",
      accessibilityLabel: "All Products",
      panelID: "all-products-content",
    },
    {
      id: "search_trends",
      content: "Search Trends",
      accessibilityLabel: "Search Trends",
      panelID: "search-trends-content",
    },
  ];

  return (
    <Page
      title="Search Intelligence"
      subtitle="Understand what customers are searching for and which searches lead to product engagement and purchases."
      fullWidth
      secondaryActions={[
        {
          content: "Refresh",
          icon: RefreshIcon,
          loading,
          onAction: loadData,
        },
      ]}
    >
      <Box
        paddingInline={{ xs: "400", sm: "600", md: "700" }}
        paddingBlockStart="100"
        paddingBlockEnd={{ xs: "300", sm: "400" }}
      >
        <BlockStack gap={{ xs: "300", sm: "400" }}>
        {/* Controls bar: Date Range & Live Status */}
        <Card padding={{ xs: "300", sm: "400" }}>
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <InlineStack gap="300" blockAlign="center" wrap>
              <Box minWidth="180px">
                <Select
                  label="Date range"
                  labelInline
                  options={[
                    { label: "Today", value: "today" },
                    { label: "Last 7 days", value: "last7" },
                    { label: "Last 30 days", value: "last30" },
                    { label: "Last 90 days", value: "last90" },
                  ]}
                  value={datePreset}
                  onChange={(val) => {
                    setTrendPage(1);
                    setDatePreset(val);
                  }}
                  disabled={loading}
                />
              </Box>
            </InlineStack>

            <InlineStack gap="200" blockAlign="center">
              <Badge
                tone={error ? "critical" : loading ? "attention" : "success"}
                progress={loading ? "incomplete" : "complete"}
              >
                {error ? "Analytics unavailable" : loading ? "Loading analytics" : "Analytics loaded"}
              </Badge>
              {lastUpdated && (
                <Text variant="bodyXs" tone="subdued">
                  Updated{" "}
                  {lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </Text>
              )}
            </InlineStack>
          </InlineStack>
        </Card>

        {/* Polaris Tabs Navigation */}
        <Card padding="0">
          <Tabs
            tabs={tabs}
            selected={selectedTabIndex - 1}
            onSelect={(selected) => setSelectedTabIndex(selected + 1)}
          />
        </Card>

        {/* Error notification banner if any */}
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <InlineStack align="space-between" blockAlign="center">
              <p>{error}</p>
              <Button onClick={loadData} size="slim" disabled={loading}>
                Retry
              </Button>
            </InlineStack>
          </Banner>
        )}

        {/* Loading overlay for initial load */}
        {loading && !summary && (
          <Card padding="800">
            <BlockStack align="center" inlineAlign="center" gap="400">
              <Spinner size="large" />
              <Text variant="bodyMd" tone="subdued">
                Loading search intelligence data...
              </Text>
            </BlockStack>
          </Card>
        )}

        {/* ==================================================
            TAB 0: OVERVIEW
            ================================================== */}
        {selectedTabIndex === 0 && summary && (
          <BlockStack gap="400">
            <InlineGrid columns={{ xs: 2, sm: 2, md: 3, xl: 6 }} gap={{ xs: "300", sm: "400" }}>
              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Total Searches
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(totalSearches)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Storewide search volume
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Unique Search Terms
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(uniqueSearchTerms)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Distinct shopper keywords
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Product Clicks
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(productClicks)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Interactions from search
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Adds to Cart
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(totalAddToCart)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Storewide search intent
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Orders
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(totalOrders)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Paid, non-cancelled orders
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Search Conversion
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatPercent(searchConversionRate)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Searched sessions with an order
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Section Header */}
            <Card padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h3">
                    Top Searched Products
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Products that customers discovered and clicked after searching.
                  </Text>
                </BlockStack>
                <Button variant="plain" onClick={() => setSelectedTabIndex(1)}>
                  View all in catalog
                </Button>
              </InlineStack>
            </Card>

            {/* Two-column product tables */}
            {topSearchProducts.length === 0 ? (
              <Card padding="800">
                <BlockStack align="center" inlineAlign="center" gap="200">
                  <Text variant="headingSm" as="h4">
                    No product search activity recorded yet
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Search events will appear here once visitors search on your storefront.
                  </Text>
                </BlockStack>
              </Card>
            ) : (
              <BlockStack gap={{ xs: "200", sm: "400" }}>
                <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
                  <ProductTableCard products={leftOverviewProducts} />
                  {rightOverviewProducts.length > 0 && (
                    <ProductTableCard products={rightOverviewProducts} />
                  )}
                </InlineGrid>

                {/* Numbered Pagination matching All Products */}
                <NumberedPagination
                  currentPage={overviewPage}
                  totalPages={overviewTotalPages}
                  totalCount={topSearchProducts.length}
                  pageSize={overviewPerPage}
                  onPageChange={setOverviewPage}
                  label="products"
                />
              </BlockStack>
            )}
          </BlockStack>
        )}

        {/* ==================================================
            TAB 1: ALL PRODUCTS
            ================================================== */}
        {selectedTabIndex === 1 && summary && (
          <BlockStack gap="400">
            {productsPlanLimit !== null && (
              <Banner
                title={`${currentPlan === "free" ? "Free" : "Pro"} Plan Limit: Up to ${productsPlanLimit} Products`}
                tone="info"
                action={{
                  content: "Upgrade Plan",
                  url: "/app/billing",
                }}
              >
                <p>
                  Your {currentPlan === "free" ? "Free" : "Pro"} plan includes analytics for up to {productsPlanLimit} products. Upgrade to {currentPlan === "free" ? "Pro (up to 25 products) or Premium (unlimited products)" : "Premium for unlimited catalog analytics"}.
                </p>
              </Banner>
            )}
            {/* 4 Page-Related Metric Cards */}
            <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap={{ xs: "300", sm: "400" }}>
              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Searched Products  
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(discoveredProductsCount)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Catalog items found via search
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Product Clicks
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(productClicks)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Clicks on discovered products
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Add to Cart from Search
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {formatNumber(allProductsAddToCart)}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    High-intent product adds
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Click-to-Purchase Rate
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {productConversionRate}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    {formatNumber(purchasesFromSearch)} purchases converted
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Filter & Sort Bar */}
            <Card padding="300">
              <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                <Box minWidth={{ xs: "100%", sm: "280px" }} maxWidth={{ md: "450px" }}>
                  <TextField
                    placeholder="Search products in catalog..."
                    value={productSearchQuery}
                    onChange={(val) => {
                      setProductSearchQuery(val);
                      setAllProductsPage(1);
                    }}
                    prefix={<Icon source={SearchIcon} />}
                    clearButton
                    onClearButtonClick={() => {
                      setProductSearchQuery("");
                      setAllProductsPage(1);
                    }}
                    autoComplete="off"
                  />
                </Box>

                <InlineStack gap="300" blockAlign="center" wrap>
                  <Box minWidth={{ xs: "100%", sm: "220px" }}>
                    <Select
                      label="Sort by"
                      labelInline
                      options={[
                        { label: "Searches (High to Low)", value: "searches_desc" },
                        { label: "Product Clicks (High to Low)", value: "clicks_desc" },
                        { label: "Purchases (High to Low)", value: "purchases_desc" },
                        { label: "Click-to-Purchase Rate", value: "rate_desc" },
                        { label: "Product Name (A–Z)", value: "title_asc" },
                      ]}
                      value={productSortBy}
                      onChange={(val) => {
                        setProductSortBy(val);
                        setAllProductsPage(1);
                      }}
                    />
                  </Box>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="info">Live Shopify GraphQL Catalog</Badge>
                  </InlineStack>
                </InlineStack>
              </InlineStack>
            </Card>

            {/* Two-column product tables */}
            {filteredProducts.length === 0 ? (
              <Card padding="800">
                <BlockStack align="center" inlineAlign="center" gap="200">
                  <Text variant="headingSm" as="h4">
                    No products match your filter
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Try adjusting your search terms or sort order.
                  </Text>
                </BlockStack>
              </Card>
            ) : (
              <BlockStack gap={{ xs: "200", sm: "400" }}>
                <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
                  <ProductTableCard products={leftColumnProducts} />
                  {rightColumnProducts.length > 0 && (
                    <ProductTableCard products={rightColumnProducts} />
                  )}
                </InlineGrid>

                {/* Numbered Pagination matching all tabs */}
                <NumberedPagination
                  currentPage={allProductsPage}
                  totalPages={totalAllPages}
                  totalCount={totalAllProducts}
                  pageSize={allProductsPerPage}
                  onPageChange={setAllProductsPage}
                  label="products"
                />
              </BlockStack>
            )}
          </BlockStack>
        )}

        {/* ==================================================
            TAB 2: SEARCH TRENDS
            ================================================== */}
        {selectedTabIndex === 2 && summary && (
          <BlockStack gap="400">
            {trendsPlanLimit !== null && (
              <Banner
                title={`${currentPlan === "free" ? "Free" : "Pro"} Plan Limit: Up to ${trendsPlanLimit} Trends`}
                tone="info"
                action={{
                  content: "Upgrade Plan",
                  url: "/app/billing",
                }}
              >
                <p>
                  Your {currentPlan === "free" ? "Free" : "Pro"} plan includes up to {trendsPlanLimit} trends ({trendsPlanLimit} days of historical search performance). Upgrade to {currentPlan === "free" ? "Pro (up to 25 trends) or Premium (unlimited trends)" : "Premium for unlimited search trends and complete historical data"}.
                </p>
              </Banner>
            )}

            {/* 4 Page-Related Metric Cards */}
            <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap={{ xs: "300", sm: "400" }}>
              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Peak Search Day
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {peakTrendDay && peakTrendDay.searches > 0 ? peakTrendDay.label : "Today"}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    {peakTrendDay && peakTrendDay.searches > 0
                      ? `${formatNumber(peakTrendDay.searches)} peak searches`
                      : "0 searches"}
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Daily Average Searches
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {dailyAverageSearches}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Avg. searches per day
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Active Search Days
                  </Text>
                  <Text variant="headingLg" as="h3">
                    {activeSearchDaysCount}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Out of {chartPoints.length} days
                  </Text>
                </BlockStack>
              </Card>

              <Card padding={{ xs: "300", sm: "400" }}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" truncate>
                    Top Trending Query
                  </Text>
                  <Text variant="headingLg" as="h3" truncate>
                    {topTrendingQuery}
                  </Text>
                  <Text variant="bodyXs" tone="subdued">
                    Most frequent search
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Filter & Timeframe Controls */}
            <Card padding="300">
              <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                <BlockStack gap="050">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="headingMd" as="h3">
                      Search Performance
                    </Text>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued">
                    Exact day-by-day search volume, product clicks, cart adds, and purchases. Active days appear first.
                  </Text>
                </BlockStack>
                <Box minWidth={{ xs: "100%", sm: "180px" }}>
                  <Select
                    label="Timeframe"
                    labelInline
                    options={
                      currentPlan === "free"
                        ? [
                            { label: "Last 5 Days (Free Limit)", value: "30d" },
                          ]
                        : currentPlan === "pro"
                        ? [
                            { label: "Last 7 Days", value: "7d" },
                            { label: "Last 25 Days (Pro Limit)", value: "30d" },
                          ]
                        : [
                            { label: "Last 7 Days", value: "7d" },
                            { label: "Last 30 Days", value: "30d" },
                            { label: "Last 90 Days", value: "90d" },
                          ]
                    }
                    value={trendTimeframe}
                    onChange={(val) => {
                      setTrendTimeframe(val);
                      setTrendPage(1);
                    }}
                  />
                </Box>
              </InlineStack>
            </Card>

            {/* Two-Column Search Trends Performance Layout */}
            {chartPoints.length === 0 ? (
              <Card padding="800">
                <BlockStack align="center" inlineAlign="center" gap="200">
                  <Text variant="headingSm" as="h4">
                    No search trend data recorded yet
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Search volume history will populate once visitors start searching your storefront.
                  </Text>
                </BlockStack>
              </Card>
            ) : (
              <BlockStack gap={{ xs: "200", sm: "400" }}>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                  <TrendTableCard trends={leftTrendRows} />
                  {rightTrendRows.length > 0 ? (
                    <TrendTableCard trends={rightTrendRows} />
                  ) : null}
                </InlineGrid>

                {/* Numbered Pagination matching All Products */}
                <NumberedPagination
                  currentPage={trendPage}
                  totalPages={totalTrendPages}
                  totalCount={chartPoints.length}
                  pageSize={trendPerPage}
                  onPageChange={setTrendPage}
                  label={currentPlan === "free" ? "days (Free: 5 trends limit)" : currentPlan === "pro" ? "days (Pro: 25 trends limit)" : "days"}
                />
              </BlockStack>
            )}
          </BlockStack>
        )}
        </BlockStack>
      </Box>
    </Page>
  );
}
