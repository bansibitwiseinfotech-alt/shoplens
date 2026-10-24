import { useState, useMemo } from "react";
import {
  Card,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  EmptyState,
  Select,
  Box,
  Button,
  IndexTable,
  InlineGrid,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

function getActionBadge(action) {
  switch (action) {
    case "Move Higher":
      return <Badge tone="success">Move Higher</Badge>;
    case "Move Lower":
      return <Badge tone="warning">Move Lower</Badge>;
    case "Review Product":
      return <Badge tone="critical">Review Product</Badge>;
    case "Keep Position":
    default:
      return <Badge tone="info">Keep Position</Badge>;
  }
}

/**
 * PositioningProblemsTable
 * Displays detected positioning problems with full column visibility and native Polaris IndexTable.
 */
export default function PositioningProblemsTable({
  problems = [],
  onSelectCollection,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const formatNumber = (num) =>
    Number(num || 0).toLocaleString("en-US");

  // Filter problems
  const filteredProblems = useMemo(() => {
    return problems.filter((item) => {
      const pTitle = String(item.productTitle || "").toLowerCase();
      const cTitle = String(item.collectionTitle || item.collection || "").toLowerCase();
      const issue = String(item.issue || "").toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      const matchesSearch =
        !q ||
        pTitle.includes(q) ||
        cTitle.includes(q) ||
        issue.includes(q);

      const matchesAction =
        actionFilter === "all" ||
        item.action?.toLowerCase() === actionFilter.toLowerCase();

      return matchesSearch && matchesAction;
    });
  }, [problems, searchQuery, actionFilter]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredProblems.length / pageSize));
  const startItem = filteredProblems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, filteredProblems.length);

  const paginatedProblems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProblems.slice(start, start + pageSize);
  }, [filteredProblems, currentPage, pageSize]);

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleActionFilterChange = (val) => {
    setActionFilter(val);
    setCurrentPage(1);
  };

  const actionFilterOptions = [
    { label: "All Actions", value: "all" },
    { label: "Move Higher", value: "move higher" },
    { label: "Move Lower", value: "move lower" },
    { label: "Review Product", value: "review product" },
  ];

  const headings = [
    { title: "Product" },
    { title: "Collection" },
    { title: "Position", alignment: "center" },
    { title: "Clicks", alignment: "end" },
    { title: "Purchases", alignment: "end" },
    { title: "Conv. Rate", alignment: "end" },
    { title: "Issue" },
    { title: "Action", alignment: "end" },
  ];

  const rowMarkup = paginatedProblems.map((item, idx) => {
    const displayTitle = item.productTitle || "Untitled product";
    const collectionTitle = item.collectionTitle || item.collection || "Collection";

    return (
      <IndexTable.Row
        id={String(item.productId || `${item.collectionId}-${idx}`)}
        key={String(item.productId || `${item.collectionId}-${idx}`)}
        position={idx}
      >
        <IndexTable.Cell>
          <Box minWidth="150px">
            <InlineStack gap="150" blockAlign="center" wrap={false}>
              <Box background="bg-surface-brand" borderRadius="100" padding="100">
                <Text variant="bodyXs" fontWeight="bold">🏷️</Text>
              </Box>
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                {displayTitle}
              </Text>
            </InlineStack>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="120px">
            <Text variant="bodyMd" as="span">
              {collectionTitle}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="70px">
            <InlineStack align="center" blockAlign="center">
              <Badge tone={item.position <= 3 ? "attention" : "info"}>
                {`#${item.position}`}
              </Badge>
            </InlineStack>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="65px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatNumber(item.clicks)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="65px">
            <Text variant="bodyMd" alignment="end" as="span">
              {formatNumber(item.purchases)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="75px">
            <Text variant="bodyMd" alignment="end" fontWeight="semibold" as="span">
              {Number(item.conversionRate || 0).toFixed(1)}%
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="160px">
            <Text variant="bodySm" as="span">
              {item.issue}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="130px">
            <BlockStack gap="100" inlineAlign="end">
              {getActionBadge(item.action)}
              {item.recommendation && (
                <Text variant="bodyXs" tone="subdued" alignment="end" as="span">
                  {item.recommendation}
                </Text>
              )}
              {onSelectCollection && (
                <Button
                  size="slim"
                  variant="plain"
                  onClick={() =>
                    onSelectCollection({
                      collectionId: item.collectionId,
                      title: collectionTitle,
                    })
                  }
                >
                  Inspect
                </Button>
              )}
            </BlockStack>
          </Box>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card padding="0">
      {/* Header & Filters */}
      <Box padding={{ xs: "300", sm: "400" }} borderBlockEndWidth="025" borderColor="border-subdued">
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          <InlineStack align="space-between" blockAlign="center" wrap gap="200">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">
                Product Positioning Opportunities
              </Text>
              <Text variant="bodyXs" tone="subdued">
                Products are compared with collection benchmarks to identify items positioned too high or too low.
              </Text>
            </BlockStack>
            <Badge tone="warning">
              {`${filteredProblems.length} Opportunit${filteredProblems.length === 1 ? "y" : "ies"}`}
            </Badge>
          </InlineStack>

          <InlineGrid columns={{ xs: 1, sm: "2fr 1fr" }} gap={{ xs: "200", sm: "300" }}>
            <TextField
              label="Search product or collection"
              labelHidden
              placeholder="Search product, collection, or issue..."
              value={searchQuery}
              onChange={handleSearchChange}
              prefix={<SearchIcon />}
              clearButton
              onClearButtonClick={() => handleSearchChange("")}
              autoComplete="off"
            />
            <Select
              label="Action"
              labelHidden
              options={actionFilterOptions}
              value={actionFilter}
              onChange={handleActionFilterChange}
            />
          </InlineGrid>
        </BlockStack>
      </Box>

      {/* Table Body */}
      {problems.length === 0 ? (
        <Box padding="800">
          <EmptyState heading="No positioning problems detected" image="">
            <Text variant="bodyMd" tone="subdued">
              No products currently require a positioning change for the selected period.
            </Text>
          </EmptyState>
        </Box>
      ) : filteredProblems.length === 0 ? (
        <Box padding="800">
          <EmptyState heading="No matching positioning opportunities" image="">
            <Text variant="bodyMd" tone="subdued">
              Try adjusting your search query or action filter.
            </Text>
          </EmptyState>
        </Box>
      ) : (
        <IndexTable
          resourceName={{
            singular: "positioning opportunity",
            plural: "positioning opportunities",
          }}
          itemCount={filteredProblems.length}
          headings={headings}
          selectable={false}
          pagination={{
            hasPrevious: currentPage > 1,
            onPrevious: () => setCurrentPage((p) => Math.max(1, p - 1)),
            hasNext: currentPage < totalPages,
            onNext: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
            label: `Showing ${startItem}–${endItem} of ${filteredProblems.length} opportunities`,
          }}
        >
          {rowMarkup}
        </IndexTable>
      )}
    </Card>
  );
}
