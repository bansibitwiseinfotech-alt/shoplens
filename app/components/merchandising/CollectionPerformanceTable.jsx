import { useMemo, useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineGrid,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

const performanceFilters = [
  { label: "All", value: "all" },
  { label: "Good", value: "Good" },
  { label: "Needs Attention", value: "Needs Attention" },
  { label: "No Sales", value: "No Sales" },
];

function PerformanceBadge({ performance }) {
  const tones = {
    Good: "success",
    "Needs Attention": "critical",
    "No Sales": "warning",
    "Not Enough Data": "attention",
  };

  return <Badge tone={tones[performance] || "attention"}>{performance}</Badge>;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatConversionDisplay(collection) {
  if (!collection || collection.productClicks === 0) return "—";
  if (collection.productClicks < 10) return "Not enough data";
  if (collection.conversionRate === null || collection.conversionRate === undefined) return "—";
  return `${Number(collection.conversionRate).toFixed(1)}%`;
}

export default function CollectionPerformanceTable({
  collections = [],
  onSelectCollection,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredCollections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return collections.filter((collection) => {
      const matchesSearch =
        !query || String(collection.title || "").toLowerCase().includes(query);
      const matchesPerformance =
        performanceFilter === "all" || collection.performance === performanceFilter;
      return matchesSearch && matchesPerformance;
    });
  }, [collections, searchQuery, performanceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCollections.length / pageSize));
  const startItem = filteredCollections.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, filteredCollections.length);

  const visibleCollections = useMemo(() => {
    return filteredCollections.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredCollections, currentPage, pageSize]);

  const changeSearch = (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const changeFilter = (value) => {
    setPerformanceFilter(value);
    setCurrentPage(1);
  };

  const headings = [
    { title: "Collection" },
    { title: "Products", alignment: "end" },
    { title: "Product Clicks", alignment: "end" },
    { title: "Purchases", alignment: "end" },
    { title: "Conversion Rate", alignment: "end" },
    { title: "Performance", alignment: "center" },
    { title: "Action", alignment: "end" },
  ];

  const rowMarkup = visibleCollections.map((collection, index) => {
    return (
      <IndexTable.Row
        id={String(collection.collectionId || index)}
        key={String(collection.collectionId || index)}
        position={index}
        onClick={() => onSelectCollection && onSelectCollection(collection)}
      >
        <IndexTable.Cell>
          <Box minWidth="150px">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {collection.title || "Untitled collection"}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="70px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatCount(collection.products)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="80px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatCount(collection.productClicks)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="75px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatCount(collection.purchases)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="90px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatConversionDisplay(collection)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="110px">
            <InlineStack align="center" blockAlign="center">
              <PerformanceBadge performance={collection.performance} />
            </InlineStack>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="90px">
            <InlineStack align="end" blockAlign="center">
              <Button
                variant="plain"
                size="slim"
                onClick={() => onSelectCollection && onSelectCollection(collection)}
              >
                {collection.action || "View Details"}
              </Button>
            </InlineStack>
          </Box>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card padding="0">
      <Box padding={{ xs: "300", sm: "400" }} borderBlockEndWidth="025" borderColor="border-subdued">
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          <BlockStack gap="050">
            <Text variant="headingMd" as="h2">
              Collection Performance
            </Text>
            <Text variant="bodySm" tone="subdued">
              See how each collection performs based on product clicks and purchases.
            </Text>
          </BlockStack>
          <InlineGrid columns={{ xs: 1, sm: "2fr 1fr" }} gap={{ xs: "200", sm: "300" }}>
            <TextField
              label="Search collections"
              labelHidden
              placeholder="Search collection..."
              value={searchQuery}
              onChange={changeSearch}
              prefix={<SearchIcon />}
              clearButton
              onClearButtonClick={() => changeSearch("")}
              autoComplete="off"
            />
            <Select
              label="Performance"
              labelHidden
              options={performanceFilters}
              value={performanceFilter}
              onChange={changeFilter}
            />
          </InlineGrid>
        </BlockStack>
      </Box>

      {collections.length === 0 ? (
        <Box padding="800">
          <EmptyState heading="No collections with products" image="">
            <Text variant="bodyMd" tone="subdued">
              Synced collections with products will appear here.
            </Text>
          </EmptyState>
        </Box>
      ) : filteredCollections.length === 0 ? (
        <Box padding="800">
          <EmptyState heading="No matching collections" image="">
            <Text variant="bodyMd" tone="subdued">
              Try another search or performance filter.
            </Text>
          </EmptyState>
        </Box>
      ) : (
        <IndexTable
          resourceName={{
            singular: "collection",
            plural: "collections",
          }}
          itemCount={filteredCollections.length}
          headings={headings}
          selectable={false}
          pagination={{
            hasPrevious: currentPage > 1,
            onPrevious: () => setCurrentPage((page) => page - 1),
            hasNext: currentPage < totalPages,
            onNext: () => setCurrentPage((page) => page + 1),
            label: `Showing ${startItem}–${endItem} of ${filteredCollections.length} collections`,
          }}
        >
          {rowMarkup}
        </IndexTable>
      )}
    </Card>
  );
}
