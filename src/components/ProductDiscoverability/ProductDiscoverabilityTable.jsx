/* eslint-disable react/prop-types */
import { useMemo } from "react";
import {
  Box,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Thumbnail,
  TextField,
  Select,
  Button,
  Icon,
  Spinner,
  IndexTable,
  InlineGrid,
} from "@shopify/polaris";
import { ImageIcon, SearchIcon, RefreshIcon } from "@shopify/polaris-icons";

/**
 * Format numerical counts with locale grouping (e.g. 12,486).
 */
const formatNumber = (num) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "0";
  return Number(num).toLocaleString();
};

/**
 * Merchant-friendly status badge mapping:
 * 80-100: Easy to Find (tone: success)
 * 60-79:  Needs Improvement (tone: warning)
 * 0-59:   Hard to Find (tone: critical)
 */
export const getDiscoverabilityStatusBadge = (status, score) => {
  const s = String(status || "").toLowerCase().replace(/[\s-]/g, "_");
  const numScore = Number(score) || 0;

  if (s === "easy" || s === "easy_to_find" || (!s && numScore >= 80)) {
    return {
      label: "Easy to Find",
      tone: "success",
    };
  }
  if (s === "needs_improvement" || (!s && numScore >= 60)) {
    return {
      label: "Needs Improvement",
      tone: "warning",
    };
  }
  return {
    label: "Hard to Find",
    tone: "critical",
  };
};

export default function ProductDiscoverabilityTable({
  products = [],
  loading = false,
  sortBy = "lowest",
  onSortChange,
  statusFilter = "all",
  onStatusFilterChange,
  productStatusFilter = "all",
  onProductStatusFilterChange,
  summary = null,
  searchQuery = "",
  onSearchChange,
  onViewDetails,
  onRefresh,
  currentPage = 1,
  onPageChange,
  pageSize = 20,
}) {
  // Client-side filter by status and product title while preserving backend-sorted order
  const filteredProducts = useMemo(() => {
    let list = products;
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "easy") {
        list = list.filter((p) => Number(p.discoverabilityScore) >= 80);
      } else if (statusFilter === "needs_improvement") {
        list = list.filter(
          (p) =>
            Number(p.discoverabilityScore) >= 60 &&
            Number(p.discoverabilityScore) < 80
        );
      } else if (statusFilter === "hard_to_find") {
        list = list.filter((p) => Number(p.discoverabilityScore) < 60);
      }
    }
    if (productStatusFilter !== "all") {
      list = list.filter(
        (product) =>
          String(product.productStatus || "").toLowerCase() ===
          productStatusFilter.toLowerCase()
      );
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((p) =>
      (p.productTitle || p.title || "").toLowerCase().includes(q)
    );
  }, [products, statusFilter, productStatusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const startItem = filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, filteredProducts.length);

  const headings = [
    { title: "Product" },
    { title: "Searches", alignment: "end" },
    { title: "Views", alignment: "end" },
    { title: "Clicks", alignment: "end" },
    { title: "Cart", alignment: "end" },
    { title: "Orders", alignment: "end" },
    { title: "Score", alignment: "end" },
    { title: "Status", alignment: "center" },
  ];

  const rowMarkup = paginatedProducts.map((row, idx) => {
    const badge = getDiscoverabilityStatusBadge(
      row.discoverabilityStatus,
      row.discoverabilityScore
    );
    const title = row.productTitle || "Untitled product";

    return (
      <IndexTable.Row
        id={row.productId || String(idx)}
        key={row.productId || idx}
        position={idx}
        onClick={() => onViewDetails && onViewDetails(row)}
      >
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <Thumbnail
              source={row.featuredImage?.url || ImageIcon}
              alt={row.featuredImage?.altText || title}
              size="small"
            />
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="semibold" truncate as="span">
                {title}
              </Text>
              {row.vendor ? (
                <Text variant="bodySm" tone="subdued" truncate as="span">
                  {row.vendor}
                </Text>
              ) : null}
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="70px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatNumber(row.searchVisibility)}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="60px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatNumber(row.views)}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="60px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatNumber(row.clicks)}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="55px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatNumber(row.addToCart)}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="60px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatNumber(row.purchases)}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="75px">
            <Text variant="bodyMd" fontWeight="bold" alignment="end" as="span">
              {row.discoverabilityScore} / 100
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="110px">
            <InlineStack align="center" blockAlign="center">
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </InlineStack>
          </Box>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <BlockStack gap="400">
      {/* Title & Description Card */}
      <Card padding="400">
        <BlockStack gap="100">
          <Text variant="headingMd" as="h3">
            Product Discoverability
          </Text>
          <Text variant="bodySm" tone="subdued">
            See which products are easiest or hardest for customers to discover across search, product views, clicks, collections, cart activity, and purchases.
          </Text>
        </BlockStack>
      </Card>

      {/* Filter & Sorting Controls */}
      <Card padding={{ xs: "300", sm: "400" }}>
        <BlockStack gap="300">
          <TextField
            placeholder="Filter by product name..."
            value={searchQuery}
            onChange={(val) => {
              onSearchChange(val);
              if (onPageChange) onPageChange(1);
            }}
            prefix={<Icon source={SearchIcon} />}
            clearButton
            onClearButtonClick={() => {
              onSearchChange("");
              if (onPageChange) onPageChange(1);
            }}
            autoComplete="off"
          />

          <InlineGrid columns={{ xs: 1, sm: 3 }} gap={{ xs: "200", sm: "300" }}>
            <Select
              label="Discoverability"
              labelInline
              options={[
                {
                  label: `All (${products.length})`,
                  value: "all",
                },
                {
                  label: `Easy (${summary?.easyToFind ?? 0})`,
                  value: "easy",
                },
                {
                  label: `Needs Work (${summary?.needsImprovement ?? 0})`,
                  value: "needs_improvement",
                },
                {
                  label: `Hard (${summary?.hardToFind ?? 0})`,
                  value: "hard_to_find",
                },
              ]}
              value={statusFilter}
              onChange={(val) => {
                if (onStatusFilterChange) onStatusFilterChange(val);
                if (onPageChange) onPageChange(1);
              }}
            />

            <Select
              label="Product status"
              labelInline
              options={[
                {
                  label: `All product statuses (${products.length})`,
                  value: "all",
                },
                {
                  label: `Active (${products.filter((product) => product.productStatus === "ACTIVE").length})`,
                  value: "active",
                },
                {
                  label: `Draft (${products.filter((product) => product.productStatus === "DRAFT").length})`,
                  value: "draft",
                },
                {
                  label: `Archived (${products.filter((product) => product.productStatus === "ARCHIVED").length})`,
                  value: "archived",
                },
              ]}
              value={productStatusFilter}
              onChange={(val) => {
                if (onProductStatusFilterChange) onProductStatusFilterChange(val);
                if (onPageChange) onPageChange(1);
              }}
            />

            <Select
              label="Sort by"
              labelInline
              options={[
                { label: "Lowest Score", value: "lowest" },
                { label: "Highest Score", value: "highest" },
              ]}
              value={sortBy}
              onChange={(val) => {
                onSortChange(val);
                if (onPageChange) onPageChange(1);
              }}
            />
          </InlineGrid>

          {/* Active Status Filter Indicator */}
          {statusFilter !== "all" && (
            <InlineStack gap="200" blockAlign="center" wrap>
              <Badge
                tone={
                  statusFilter === "easy"
                    ? "success"
                    : statusFilter === "needs_improvement"
                    ? "warning"
                    : "critical"
                }
              >
                {statusFilter === "easy"
                  ? "Filtered: Easy to Find (80–100)"
                  : statusFilter === "needs_improvement"
                  ? "Filtered: Needs Improvement (60–79)"
                  : "Filtered: Hard to Find (0–59)"}
              </Badge>
              <Text variant="bodyXs" tone="subdued">
                Showing {filteredProducts.length} of {products.length} products
              </Text>
              <Button
                variant="plain"
                size="slim"
                onClick={() => {
                  if (onStatusFilterChange) onStatusFilterChange("all");
                  if (onPageChange) onPageChange(1);
                }}
              >
                Show All Products
              </Button>
            </InlineStack>
          )}
          {productStatusFilter !== "all" && (
            <InlineStack gap="200" blockAlign="center" wrap>
              <Badge tone="info">
                Product status: {productStatusFilter.toLowerCase()}
              </Badge>
              <Text variant="bodyXs" tone="subdued">
                Showing {filteredProducts.length} of {products.length} products
              </Text>
              <Button
                variant="plain"
                size="slim"
                onClick={() => {
                  if (onProductStatusFilterChange) onProductStatusFilterChange("all");
                  if (onPageChange) onPageChange(1);
                }}
              >
                Show all product statuses
              </Button>
            </InlineStack>
          )}
        </BlockStack>
      </Card>

      {/* Table Content */}
      {loading ? (
        <Card padding="800">
          <BlockStack align="center" inlineAlign="center" gap="300">
            <Spinner size="large" />
            <Text variant="bodyMd" tone="subdued">
              Loading product discoverability data...
            </Text>
          </BlockStack>
        </Card>
      ) : products.length === 0 ? (
        <Card padding="800">
          <BlockStack align="center" inlineAlign="center" gap="300">
            <Text variant="headingMd" as="h4">
              No Product Discoverability Data
            </Text>
            <Text variant="bodyMd" tone="subdued" alignment="center">
              Product discoverability data will appear here once customer search, product interaction, collection, and purchase activity has been collected.
            </Text>
            {onRefresh && (
              <Button onClick={onRefresh} icon={RefreshIcon}>
                Refresh
              </Button>
            )}
          </BlockStack>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card padding="800">
          <BlockStack align="center" inlineAlign="center" gap="200">
            <Text variant="headingSm" as="h4">
              No products match your filter
            </Text>
            <Text variant="bodySm" tone="subdued">
              No products match &quot;{searchQuery}&quot;. Clear the search input to see all products.
            </Text>
          </BlockStack>
        </Card>
      ) : (
        <Card padding="0">
          <IndexTable
            resourceName={{
              singular: "product",
              plural: "products",
            }}
            itemCount={filteredProducts.length}
            headings={headings}
            selectable={false}
            pagination={{
              hasPrevious: currentPage > 1,
              onPrevious: () => onPageChange(currentPage - 1),
              hasNext: currentPage < totalPages,
              onNext: () => onPageChange(currentPage + 1),
              label: `Showing ${startItem}–${endItem} of ${filteredProducts.length} products`,
            }}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      )}
    </BlockStack>
  );
}
