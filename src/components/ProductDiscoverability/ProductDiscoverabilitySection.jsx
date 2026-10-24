/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback } from "react";
import {
  Card,
  InlineGrid,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  Box,
  Button,
  Modal,
  ProgressBar,
  SkeletonDisplayText,
  SkeletonBodyText,
  useBreakpoints,
} from "@shopify/polaris";
import {
  fetchDiscoverabilitySummary,
  fetchProductDiscoverability,
} from "../../services/productDiscoverabilityApi.js";
import ProductDiscoverabilityTable, {
  getDiscoverabilityStatusBadge,
} from "./ProductDiscoverabilityTable.jsx";

/**
 * Format numerical counts with locale grouping (e.g. 12,486).
 */
const formatNumber = (num) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "0";
  return Number(num).toLocaleString();
};

export default function ProductDiscoverabilitySection({
  shop,
  refreshTrigger,
  from,
  to,
}) {
  const { smDown, mdDown } = useBreakpoints();
  const [isClientMobile, setIsClientMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsClientMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isMobile = smDown || mdDown || isClientMobile;
  // Data states
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState(null);

  // Sorting & Filtering controls
  const [sortBy, setSortBy] = useState("lowest");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productStatusFilter, setProductStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Selected product for the View Details modal (Signal breakdown & Collection Placement)
  const [selectedProduct, setSelectedProduct] = useState(null);

  /**
   * Fetch discoverability summary from real backend API:
   * GET /api/product-discoverability/summary?from=...&to=...
   */
  const loadSummary = useCallback(async () => {
    if (!shop) return;
    setLoadingSummary(true);
    try {
      const summaryData = await fetchDiscoverabilitySummary({ shop, from, to });
      setSummary(summaryData);
    } catch (err) {
      console.error("Discoverability summary error:", err);
      setError(err.message || "Failed to load discoverability summary");
    } finally {
      setLoadingSummary(false);
    }
  }, [shop, from, to]);

  /**
   * Fetch discoverability products from real backend API:
   * GET /api/product-discoverability?sort={sort}&limit=50&from=...&to=...
   */
  const loadProducts = useCallback(
    async (sortOrder = sortBy) => {
      if (!shop) return;
      setLoadingProducts(true);
      try {
        const productList = await fetchProductDiscoverability({
          shop,
          sort: sortOrder,
          limit: 250,
          from,
          to,
        });
        setProducts(productList);
      } catch (err) {
        console.error("Discoverability products error:", err);
        setError(err.message || "Failed to load discoverability products");
      } finally {
        setLoadingProducts(false);
      }
    },
    [shop, sortBy, from, to]
  );

  /**
   * Combined refresh function
   */
  const loadAll = useCallback(() => {
    setError(null);
    loadSummary();
    loadProducts(sortBy);
  }, [loadSummary, loadProducts, sortBy]);


  // Initial load
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Parent refresh trigger (e.g. when top-level Refresh button clicked)
  useEffect(() => {
    if (refreshTrigger) {
      loadAll();
    }
  }, [refreshTrigger, loadAll]);

  /**
   * Handle sort change:
   * "lowest" -> sort=lowest
   * "highest" -> sort=highest
   */
  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    setCurrentPage(1);
    loadProducts(newSort);
  };

  const selectedBadge = selectedProduct
    ? getDiscoverabilityStatusBadge(
        selectedProduct.discoverabilityStatus,
        selectedProduct.discoverabilityScore
      )
    : null;

  return (
    <BlockStack gap="400">
      {/* Error Banner with Try Again Action */}
      {error && (
        <Banner tone="critical" title="Unable to load Product Discoverability">
          <InlineStack align="space-between" blockAlign="center" wrap gap="300">
            <Text as="p">
              We couldn&apos;t load product discoverability data right now. Please try again.
            </Text>
            <Button onClick={loadAll} variant="primary" size="slim">
              Try Again
            </Button>
          </InlineStack>
        </Banner>
      )}

      {/* ==================================================
          5 KPI SUMMARY CARDS — flat 2-col mobile / 5-col desktop
          ================================================== */}
      <InlineGrid columns={{ xs: 2, sm: 2, md: 5 }} gap={{ xs: "200", sm: "300", md: "400" }}>
        {/* 1. Total Products */}
        <Box
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatusFilter("all");
            setCurrentPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setStatusFilter("all");
              setCurrentPage(1);
            }
          }}
        >
          <Card padding={{ xs: "200", sm: "300", md: "400" }}>
            <BlockStack gap="100">
              <Text variant="bodyXs" tone="subdued">
                Total Products
              </Text>
              {loadingSummary && !summary ? (
                <>
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={1} />
                </>
              ) : (
                <>
                  <InlineStack gap="100" blockAlign="center" wrap>
                    <Text variant={isMobile ? "headingMd" : "headingLg"} as="h3">
                      {formatNumber(summary?.totalProducts)}
                    </Text>
                    <Badge tone="info">All</Badge>
                  </InlineStack>
                  <Text variant="bodyXs" tone="subdued">
                    Analyzed store catalog
                  </Text>
                </>
              )}
            </BlockStack>
          </Card>
        </Box>

        {/* 2. Easy to Find */}
        <Box
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatusFilter((prev) => (prev === "easy" ? "all" : "easy"));
            setCurrentPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setStatusFilter((prev) => (prev === "easy" ? "all" : "easy"));
              setCurrentPage(1);
            }
          }}
        >
          <Card padding={{ xs: "200", sm: "300", md: "400" }}>
            <BlockStack gap="100">
              <Text variant="bodyXs" tone="subdued">
                Easy to Find
              </Text>
              {loadingSummary && !summary ? (
                <>
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={1} />
                </>
              ) : (
                <>
                  <InlineStack gap="100" blockAlign="center" wrap>
                    <Text variant={isMobile ? "headingMd" : "headingLg"} as="h3">
                      {formatNumber(summary?.easyToFind)}
                    </Text>
                    <Badge tone="success">80–100</Badge>
                  </InlineStack>
                  <Text variant="bodyXs" tone="subdued">
                    High discoverability
                  </Text>
                </>
              )}
            </BlockStack>
          </Card>
        </Box>

        {/* 3. Needs Improvement */}
        <Box
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatusFilter((prev) =>
              prev === "needs_improvement" ? "all" : "needs_improvement"
            );
            setCurrentPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setStatusFilter((prev) =>
                prev === "needs_improvement" ? "all" : "needs_improvement"
              );
              setCurrentPage(1);
            }
          }}
        >
          <Card padding={{ xs: "200", sm: "300", md: "400" }}>
            <BlockStack gap="100">
              <Text variant="bodyXs" tone="subdued">
                Needs Improvement
              </Text>
              {loadingSummary && !summary ? (
                <>
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={1} />
                </>
              ) : (
                <>
                  <InlineStack gap="100" blockAlign="center" wrap>
                    <Text variant={isMobile ? "headingMd" : "headingLg"} as="h3">
                      {formatNumber(summary?.needsImprovement)}
                    </Text>
                    <Badge tone="warning">60–79</Badge>
                  </InlineStack>
                  <Text variant="bodyXs" tone="subdued">
                    Moderate discoverability
                  </Text>
                </>
              )}
            </BlockStack>
          </Card>
        </Box>

        {/* 4. Hard to Find */}
        <Box
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatusFilter((prev) =>
              prev === "hard_to_find" ? "all" : "hard_to_find"
            );
            setCurrentPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setStatusFilter((prev) =>
                prev === "hard_to_find" ? "all" : "hard_to_find"
              );
              setCurrentPage(1);
            }
          }}
        >
          <Card padding={{ xs: "200", sm: "300", md: "400" }}>
            <BlockStack gap="100">
              <Text variant="bodyXs" tone="subdued">
                Hard to Find
              </Text>
              {loadingSummary && !summary ? (
                <>
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={1} />
                </>
              ) : (
                <>
                  <InlineStack gap="100" blockAlign="center" wrap>
                    <Text variant={isMobile ? "headingMd" : "headingLg"} as="h3">
                      {formatNumber(summary?.hardToFind)}
                    </Text>
                    <Badge tone="critical">0–59</Badge>
                  </InlineStack>
                  <Text variant="bodyXs" tone="subdued">
                    Low discoverability
                  </Text>
                </>
              )}
            </BlockStack>
          </Card>
        </Box>

        {/* 5. Average Discoverability */}
        <Card padding={{ xs: "200", sm: "300", md: "400" }}>
          <BlockStack gap="100">
            <Text variant="bodyXs" tone="subdued">
              Avg. Discoverability
            </Text>
            {loadingSummary && !summary ? (
              <>
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={1} />
              </>
            ) : (
              <>
                <InlineStack gap="100" blockAlign="center" wrap>
                  <Text variant={isMobile ? "headingMd" : "headingLg"} as="h3">
                    {summary?.averageScore !== undefined && summary?.averageScore !== null
                      ? `${summary.averageScore} / 100`
                      : "0 / 100"}
                  </Text>
                  <Badge
                    tone={
                      (summary?.averageScore ?? 0) >= 80
                        ? "success"
                        : (summary?.averageScore ?? 0) >= 60
                        ? "warning"
                        : "critical"
                    }
                  >
                    {(summary?.averageScore ?? 0) >= 80
                      ? "80–100"
                      : (summary?.averageScore ?? 0) >= 60
                      ? "60–79"
                      : "0–59"}
                  </Badge>
                </InlineStack>
                <Text variant="bodyXs" tone="subdued">
                  Storewide average score
                </Text>
              </>
            )}
          </BlockStack>
        </Card>
      </InlineGrid>

      {/* ==================================================
          MAIN PRODUCT DISCOVERABILITY TABLE

          ================================================== */}
      <ProductDiscoverabilityTable
        products={products}
        loading={loadingProducts && products.length === 0}
        sortBy={sortBy}
        onSortChange={handleSortChange}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        productStatusFilter={productStatusFilter}
        onProductStatusFilterChange={setProductStatusFilter}
        summary={summary}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onViewDetails={(product) => setSelectedProduct(product)}
        onRefresh={loadAll}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        pageSize={20}
      />

      {/* ==================================================
          POLARIS MODAL FOR PRODUCT DETAILS
          ================================================== */}
      {selectedProduct && (
        <Modal
          open={Boolean(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          title={selectedProduct.productTitle || "Product Discoverability"}
          size="large"
          primaryAction={{
            content: "Close",
            onAction: () => setSelectedProduct(null),
          }}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {/* Product Header & Score Card */}
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                padding="400"
              >
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h4">
                        {selectedProduct.productTitle}
                      </Text>
                      <Text variant="bodyXs" tone="subdued">
                        {selectedProduct.productId}
                      </Text>
                    </BlockStack>
                    {selectedBadge && (
                      <Badge tone={selectedBadge.tone}>{selectedBadge.label}</Badge>
                    )}
                  </InlineStack>

                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="baseline">
                      <Text variant="bodySm" tone="subdued">
                        Overall Discoverability Score
                      </Text>
                      <Text variant="headingXl" as="span" fontWeight="bold">
                        {selectedProduct.discoverabilityScore} / 100
                      </Text>
                    </InlineStack>
                    <ProgressBar
                      progress={Math.max(selectedProduct.discoverabilityScore || 0, 3)}
                      tone={
                        selectedProduct.discoverabilityScore >= 80
                          ? "success"
                          : selectedProduct.discoverabilityScore >= 60
                          ? "highlight"
                          : "critical"
                      }
                      size="small"
                    />
                  </BlockStack>
                </BlockStack>
              </Box>

              {/* 6 Discoverability Signals Section */}
              <BlockStack gap="200">
                <Text variant="headingSm" as="h5">
                  Discovery Signals Breakdown
                </Text>
                <Text variant="bodyXs" tone="subdued">
                  Normalized relative to store catalog performance
                </Text>
              </BlockStack>

              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                {/* 1. Collection Placement */}
                <Card padding="300">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">
                      Collection Placement (15%)
                    </Text>
                    <Text variant="headingMd" as="p" fontWeight="bold">
                      {selectedProduct.collectionCount ?? 0}{" "}
                      {selectedProduct.collectionCount === 1 ? "collection" : "collections"}
                    </Text>
                    <Text variant="bodyXs" tone="subdued">
                      Signal Score: {selectedProduct.collectionPlacementScore ?? 0} / 100
                    </Text>
                  </BlockStack>
                </Card>

                {/* 2. Search Visibility */}
                <Card padding="300">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">
                      Search Visibility (25%)
                    </Text>
                    <Text variant="headingMd" as="p">
                      {formatNumber(selectedProduct.searchVisibility)} searches
                    </Text>
                    <Text variant="bodyXs" tone="subdued">
                      Signal Score: {selectedProduct.searchVisibilityScore ?? 0} / 100
                    </Text>
                  </BlockStack>
                </Card>

                {/* 3. Product Views */}
                <Card padding="300">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">
                      Product Views (20%)
                    </Text>
                    <Text variant="headingMd" as="p">
                      {formatNumber(selectedProduct.views)} views
                    </Text>
                    <Text variant="bodyXs" tone="subdued">
                      Signal Score: {selectedProduct.viewsScore ?? 0} / 100
                    </Text>
                  </BlockStack>
                </Card>

                {/* 4. Product Clicks */}
                <Card padding="300">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">
                      Product Clicks (15%)
                    </Text>
                    <Text variant="headingMd" as="p">
                      {formatNumber(selectedProduct.clicks)} clicks
                    </Text>
                    <Text variant="bodyXs" tone="subdued">
                      Signal Score: {selectedProduct.clicksScore ?? 0} / 100
                    </Text>
                  </BlockStack>
                </Card>

                {/* 5. Add to Cart */}
                <Card padding="300">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">
                      Add to Cart (15%)
                    </Text>
                    <Text variant="headingMd" as="p">
                      {formatNumber(selectedProduct.addToCart)} adds
                    </Text>
                    <Text variant="bodyXs" tone="subdued">
                      Signal Score: {selectedProduct.addToCartScore ?? 0} / 100
                    </Text>
                  </BlockStack>
                </Card>

                {/* 6. Purchases */}
                <Card padding="300">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">
                      Purchases (10%)
                    </Text>
                    <Text variant="headingMd" as="p">
                      {formatNumber(selectedProduct.purchases)} orders
                    </Text>
                    <Text variant="bodyXs" tone="subdued">
                      Signal Score: {selectedProduct.purchasesScore ?? 0} / 100
                    </Text>
                  </BlockStack>
                </Card>
              </InlineGrid>

              {/* Actionable Merchandising Recommendations */}
              <Card padding="400">
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h5">
                    Merchandising Recommendation
                  </Text>
                  {selectedProduct.discoverabilityScore >= 80 ? (
                    <Text variant="bodySm" tone="subdued">
                      🌟 Excellent customer findability. This product is well-indexed across search, collections, and catalog navigation with active purchase conversions. Maintain current placement and stock levels.
                    </Text>
                  ) : selectedProduct.discoverabilityScore >= 60 ? (
                    <Text variant="bodySm" tone="subdued">
                      📈 Moderate discoverability. Customers discover this product occasionally. Consider featuring it on your homepage or top collections, and optimizing search keywords to elevate it into Easy to Find.
                    </Text>
                  ) : (
                    <Text variant="bodySm" tone="subdued">
                      ⚠️ Hard to find for shoppers. Customers rarely encounter this product. Add this product to 1–3 relevant collections, include popular search keywords in its title/tags, and verify it is visible on active sales channels.
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* Explanatory Context */}
              <Box
                padding="300"
                background="bg-surface-secondary"
                borderRadius="200"
              >
                <Text variant="bodyXs" tone="subdued">
                  Discoverability Score combines: Search visibility (25%), Catalog views (20%), Search clicks (15%), Collection placement (15%), Cart activity (15%), and Purchases (10%).
                </Text>
              </Box>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </BlockStack>
  );
}
