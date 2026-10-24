import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import SearchEvent from "../models/searchEvent.model.js";
import SearchIntent from "../models/SearchIntent.js";
import { getSearchIntentDistribution } from "../services/dashboardService.js";

const originalAggregate = SearchEvent.aggregate;
const originalFind = SearchIntent.find;

afterEach(() => {
  SearchEvent.aggregate = originalAggregate;
  SearchIntent.find = originalFind;
});

test("search intent distribution matches normalized real search queries", async () => {
  SearchIntent.find = () => ({
    select() {
      return {
        lean: async () => [
          { searchQuery: "iphone   case", category: "electronics" },
          { searchQuery: "running shoes", category: "footwear" },
        ],
      };
    },
  });
  SearchEvent.aggregate = async () => [
    { _id: "iphone case", searches: 3 },
    { _id: "running shoes", searches: 2 },
    { _id: "uncategorized query", searches: 4 },
  ];

  const categories = await getSearchIntentDistribution({
    shop: "store.myshopify.com",
    from: new Date("2026-10-01T00:00:00.000Z"),
    to: new Date("2026-10-22T00:00:00.000Z"),
  });

  assert.deepEqual(
    categories.map(({ id, count, queryCount }) => ({ id, count, queryCount })),
    [
      { id: "electronics", count: 3, queryCount: 1 },
      { id: "footwear", count: 2, queryCount: 1 },
    ]
  );
  assert.equal(
    categories.reduce((total, category) => total + category.count, 0),
    5
  );
});
