import { useMemo, useState } from "react";
import {
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  Box,
  BlockStack,
  InlineStack,
  TextField,
  ButtonGroup,
  InlineGrid,
  Pagination,
  useBreakpoints,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatGrowth(value) {
  const num = Math.round(Number(value || 0));
  if (num > 0) return `+${num}%`;
  return `${num}%`;
}

function getTrendBadgeTone(trendType) {
  switch (trendType) {
    case "Rising":
      return "success";
    case "New":
      return "info";
    case "Seasonal":
      return "attention";
    case "Stable":
    default:
      return "neutral";
  }
}

export default function TrendingSearchTable({
  searches = [],
  onSelectTrend,
}) {
  const { smDown } = useBreakpoints();
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const filteredSearches = useMemo(() => {
    return searches.filter((item) => {
      const matchesType =
        filterType === "all" || item.trendType === filterType;
      const matchesQuery =
        !searchQuery.trim() ||
        String(item.query || "")
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase());

      return matchesType && matchesQuery;
    });
  }, [searches, filterType, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSearches.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredSearches.length);
  const paginatedSearches = filteredSearches.slice(startIndex, endIndex);

  const resourceName = {
    singular: "trending search",
    plural: "trending searches",
  };

  const rowMarkup = paginatedSearches.map((trend, index) => {
    const badgeTone = getTrendBadgeTone(trend.trendType);
    const globalIndex = startIndex + index;

    return (
      <IndexTable.Row
        id={trend.query || String(globalIndex)}
        key={trend.query || globalIndex}
        position={globalIndex}
      >
        <IndexTable.Cell>
          <Box minWidth="120px">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {trend.query}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="90px">
            <Text variant="bodyMd" as="span">
              {formatNumber(trend.currentSearches)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="80px">
            <Text variant="bodyMd" tone="subdued" as="span">
              {formatNumber(trend.previousSearches)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="80px">
            <Text
              variant="bodyMd"
              tone={trend.growthPercent > 0 ? "success" : undefined}
              fontWeight="semibold"
              as="span"
            >
              {formatGrowth(trend.growthPercent)}
            </Text>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="90px">
            <Badge tone={badgeTone}>
              {trend.trendType}
            </Badge>
          </Box>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Box minWidth="100px">
            <Button
              size="slim"
              onClick={() => onSelectTrend && onSelectTrend(trend)}
            >
              View details
            </Button>
          </Box>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const emptyRows = [];
  if (filteredSearches.length > 0 && paginatedSearches.length < pageSize) {
    const missingCount = pageSize - paginatedSearches.length;
    for (let i = 0; i < missingCount; i++) {
      emptyRows.push(
        <IndexTable.Row
          id={`empty-row-${i}`}
          key={`empty-row-${i}`}
          position={startIndex + paginatedSearches.length + i}
          disabled
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              &nbsp;
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              &nbsp;
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              &nbsp;
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span">
              &nbsp;
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Box visibility="hidden">
              <Badge tone="neutral">Placeholder</Badge>
            </Box>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Box visibility="hidden">
              <Button size="slim">View details</Button>
            </Box>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  }

  const allRowMarkup = [...rowMarkup, ...emptyRows];

  return (
    <Card padding="0">
      <Box padding={{ xs: "300", sm: "400" }} borderBlockEndWidth="025" borderColor="border-subdued">
        {smDown ? (
          <BlockStack gap="300">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">
                Fastest Growing Searches
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                Searches with meaningful growth in customer demand.
              </Text>
            </BlockStack>

            <TextField
              placeholder="Filter search queries..."
              value={searchQuery}
              onChange={(val) => {
                setSearchQuery(val);
                setCurrentPage(1);
              }}
              prefix={<SearchIcon />}
              clearButton
              onClearButtonClick={() => {
                setSearchQuery("");
                setCurrentPage(1);
              }}
              autoComplete="off"
            />

            <ButtonGroup variant="segmented" fullWidth>
              <Button
                pressed={filterType === "all"}
                onClick={() => {
                  setFilterType("all");
                  setCurrentPage(1);
                }}
              >
                All
              </Button>
              <Button
                pressed={filterType === "Rising"}
                onClick={() => {
                  setFilterType("Rising");
                  setCurrentPage(1);
                }}
              >
                Rising
              </Button>
              <Button
                pressed={filterType === "New"}
                onClick={() => {
                  setFilterType("New");
                  setCurrentPage(1);
                }}
              >
                New
              </Button>
              <Button
                pressed={filterType === "Seasonal"}
                onClick={() => {
                  setFilterType("Seasonal");
                  setCurrentPage(1);
                }}
              >
                Seasonal
              </Button>
            </ButtonGroup>
          </BlockStack>
        ) : (
          <InlineStack align="space-between" blockAlign="center" wrap gap="300">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">
                Fastest Growing Searches
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                Searches with meaningful growth in customer demand.
              </Text>
            </BlockStack>

            <InlineStack gap="200" blockAlign="center" wrap>
              <Box minWidth="260px">
                <TextField
                  placeholder="Filter search queries..."
                  value={searchQuery}
                  onChange={(val) => {
                    setSearchQuery(val);
                    setCurrentPage(1);
                  }}
                  prefix={<SearchIcon />}
                  clearButton
                  onClearButtonClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  autoComplete="off"
                  size="slim"
                />
              </Box>

              <ButtonGroup variant="segmented">
                <Button
                  size="slim"
                  pressed={filterType === "all"}
                  onClick={() => {
                    setFilterType("all");
                    setCurrentPage(1);
                  }}
                >
                  All
                </Button>
                <Button
                  size="slim"
                  pressed={filterType === "Rising"}
                  onClick={() => {
                    setFilterType("Rising");
                    setCurrentPage(1);
                  }}
                >
                  Rising
                </Button>
                <Button
                  size="slim"
                  pressed={filterType === "New"}
                  onClick={() => {
                    setFilterType("New");
                    setCurrentPage(1);
                  }}
                >
                  New
                </Button>
                <Button
                  size="slim"
                  pressed={filterType === "Seasonal"}
                  onClick={() => {
                    setFilterType("Seasonal");
                    setCurrentPage(1);
                  }}
                >
                  Seasonal
                </Button>
              </ButtonGroup>
            </InlineStack>
          </InlineStack>
        )}
      </Box>

      {filteredSearches.length === 0 ? (
        <Box padding={{ xs: "400", sm: "800" }}>
          <BlockStack gap="200" inlineAlign="center">
            <Text variant="bodyMd" tone="subdued" alignment="center">
              No searches match the selected filter.
            </Text>
            <Button
              size="slim"
              onClick={() => {
                setFilterType("all");
                setSearchQuery("");
                setCurrentPage(1);
              }}
            >
              Reset filters
            </Button>
          </BlockStack>
        </Box>
      ) : smDown ? (
        <Box padding={{ xs: "300", sm: "400" }}>
          <BlockStack gap="300">
            {paginatedSearches.map((trend, index) => {
              const badgeTone = getTrendBadgeTone(trend.trendType);
              return (
                <Box
                  key={trend.query || index}
                  background="bg-surface-secondary"
                  borderRadius="200"
                  borderWidth="025"
                  borderColor="border-subdued"
                  padding="300"
                >
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center" wrap gap="150">
                      <InlineStack gap="150" blockAlign="center" wrap>
                        <Text variant="bodyMd" fontWeight="bold" breakWord>
                          {trend.query}
                        </Text>
                        <Badge tone={badgeTone} size="small">
                          {trend.trendType}
                        </Badge>
                      </InlineStack>

                      <Button
                        size="slim"
                        onClick={() => onSelectTrend && onSelectTrend(trend)}
                      >
                        View details
                      </Button>
                    </InlineStack>

                    <InlineGrid columns={3} gap="200">
                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">Current</Text>
                        <Text variant="bodyMd" fontWeight="semibold">
                          {formatNumber(trend.currentSearches)}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">Previous</Text>
                        <Text variant="bodyMd" tone="subdued">
                          {formatNumber(trend.previousSearches)}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="050">
                        <Text variant="bodyXs" tone="subdued">Growth</Text>
                        <Text
                          variant="bodyMd"
                          fontWeight="bold"
                          tone={trend.growthPercent > 0 ? "success" : undefined}
                        >
                          {formatGrowth(trend.growthPercent)}
                        </Text>
                      </BlockStack>
                    </InlineGrid>
                  </BlockStack>
                </Box>
              );
            })}

            {filteredSearches.length > pageSize && (
              <Box paddingBlock="200">
                <InlineStack align="center" blockAlign="center">
                  <Pagination
                    hasNext={safeCurrentPage < totalPages}
                    hasPrevious={safeCurrentPage > 1}
                    onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    onPrevious={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    label={`${startIndex + 1}–${endIndex} of ${filteredSearches.length}`}
                  />
                </InlineStack>
              </Box>
            )}
          </BlockStack>
        </Box>
      ) : (
        <IndexTable
          resourceName={resourceName}
          itemCount={filteredSearches.length}
          headings={[
            { title: "Search" },
            { title: "Current Searches" },
            { title: "Previous" },
            { title: "Growth" },
            { title: "Trend" },
            { title: "Action" },
          ]}
          selectable={false}
          pagination={
            filteredSearches.length > pageSize
              ? {
                  hasNext: safeCurrentPage < totalPages,
                  hasPrevious: safeCurrentPage > 1,
                  onNext: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
                  onPrevious: () => setCurrentPage((p) => Math.max(1, p - 1)),
                  label: `${startIndex + 1}–${endIndex} of ${filteredSearches.length}`,
                }
              : undefined
          }
        >
          {allRowMarkup}
        </IndexTable>
      )}
    </Card>
  );
}