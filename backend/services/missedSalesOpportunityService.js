import mongoose from "mongoose";

import MissedSalesOpportunity from "../models/MissedSalesOpportunity.js";

const DEFAULT_COLLECTIONS = {
  searchEvents:
    process.env.SHOPLENS_SEARCH_EVENTS_COLLECTION ||
    "tbl_search_events",

  discoveryEvents:
    process.env.SHOPLENS_DISCOVERY_EVENTS_COLLECTION ||
    "tbl_customer_discovery_events",

  discoverabilityScores:
    process.env.SHOPLENS_DISCOVERABILITY_COLLECTION ||
    "tbl_product_discoverabilities",

  products:
    process.env.SHOPLENS_PRODUCTS_COLLECTION ||
    "tbl_products",
};

const MIN_DISCOVERABILITY_SCORE = 40;

const normalizeQuery = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const round = (value, decimals = 2) => {
  const multiplier = 10 ** decimals;

  return (
    Math.round(Number(value || 0) * multiplier) /
    multiplier
  );
};

const clamp = (value, min, max) => {
  return Math.min(
    Math.max(Number(value || 0), min),
    max
  );
};

const getCollection = (name) => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "MongoDB connection is not ready."
    );
  }

  return mongoose.connection.db.collection(name);
};

const getFieldExpression = (...fields) => {
  if (fields.length === 1) {
    return `$${fields[0]}`;
  }

  return {
    $ifNull: [
      `$${fields[0]}`,
      fields
        .slice(1)
        .reduce(
          (expression, field) => ({
            $ifNull: [expression, `$${field}`],
          }),
          null
        ),
    ],
  };
};

const getDateRange = (days) => {
  const end = new Date();

  const start = new Date(end);

  start.setDate(start.getDate() - days);

  return {
    start,
    end,
  };
};

/**
 * ---------------------------------------------------------
 * ZERO RESULT SEARCHES
 * ---------------------------------------------------------
 *
 * Reads actual search events and identifies searches where
 * the customer received zero results.
 */
const getZeroResultOpportunities = async ({
  shop,
  start,
  end,
}) => {
  const collection = getCollection(
    DEFAULT_COLLECTIONS.searchEvents
  );

  const pipeline = [
    {
      $match: {
        shop,
        occurredAt: {
          $gte: start,
          $lt: end,
        },
      },
    },

    {
      $project: {
        query: getFieldExpression(
          "query",
          "searchQuery"
        ),

        resultCount: getFieldExpression(
          "resultCount",
          "resultsCount",
          "searchResultCount"
        ),

        eventName: getFieldExpression(
          "eventName",
          "eventType",
          "type"
        ),
      },
    },

    {
      $project: {
        query: 1,
        resultCount: 1,
        eventName: 1,

        normalizedQuery: {
          $trim: {
            input: {
              $toLower: {
                $ifNull: ["$query", ""],
              },
            },
          },
        },
      },
    },

    {
      $match: {
        normalizedQuery: {
          $ne: "",
        },

        $or: [
          {
            resultCount: {
              $lte: 0,
            },
          },
          {
            eventName: {
              $in: [
                "zero_result",
                "zero_result_search",
                "search_no_results",
              ],
            },
          },
        ],
      },
    },

    {
      $group: {
        _id: "$normalizedQuery",

        query: {
          $first: "$query",
        },

        zeroResultSearches: {
          $sum: 1,
        },
      },
    },

    {
      $sort: {
        zeroResultSearches: -1,
      },
    },

    {
      $limit: 100,
    },
  ];

  return collection.aggregate(pipeline).toArray();
};

/**
 * ---------------------------------------------------------
 * TOTAL SEARCH VOLUME
 * ---------------------------------------------------------
 */
const getSearchVolumes = async ({
  shop,
  start,
  end,
}) => {
  const collection = getCollection(
    DEFAULT_COLLECTIONS.searchEvents
  );

  const pipeline = [
    {
      $match: {
        shop,
        occurredAt: {
          $gte: start,
          $lt: end,
        },
      },
    },

    {
      $project: {
        query: getFieldExpression(
          "query",
          "searchQuery"
        ),
      },
    },

    {
      $project: {
        normalizedQuery: {
          $trim: {
            input: {
              $toLower: {
                $ifNull: ["$query", ""],
              },
            },
          },
        },
      },
    },

    {
      $match: {
        normalizedQuery: {
          $ne: "",
        },
      },
    },

    {
      $group: {
        _id: "$normalizedQuery",
        searches: {
          $sum: 1,
        },
      },
    },
  ];

  const results = await collection
    .aggregate(pipeline)
    .toArray();

  return new Map(
    results.map((item) => [
      item._id,
      item.searches,
    ])
  );
};

/**
 * ---------------------------------------------------------
 * LOW DISCOVERABILITY
 * ---------------------------------------------------------
 */
const getLowDiscoverabilityOpportunities = async ({
  shop,
}) => {
  const collection = getCollection(
    DEFAULT_COLLECTIONS.discoverabilityScores
  );

  const pipeline = [
    {
      $match: {
        shop,
      },
    },

    {
      $project: {
        productId: getFieldExpression(
          "productId",
          "shopifyProductId"
        ),

        productTitle: getFieldExpression(
          "productTitle",
          "title",
          "name"
        ),

        score: getFieldExpression(
          "score",
          "discoverabilityScore"
        ),
      },
    },

    {
      $match: {
        score: {
          $ne: null,
          $lt: MIN_DISCOVERABILITY_SCORE,
        },
      },
    },

    {
      $sort: {
        score: 1,
      },
    },

    {
      $limit: 100,
    },
  ];

  return collection.aggregate(pipeline).toArray();
};

/**
 * ---------------------------------------------------------
 * CUSTOMER JOURNEY DROP-OFF
 * ---------------------------------------------------------
 *
 * Journey:
 *
 * Search
 *   ↓
 * Collection
 *   ↓
 * Product
 *   ↓
 * Cart
 *   ↓
 * Purchase
 */
const getJourneyDropOffs = async ({
  shop,
  start,
  end,
}) => {
  const collection = getCollection(
    DEFAULT_COLLECTIONS.discoveryEvents
  );

  const pipeline = [
    {
      $match: {
        shop,
        occurredAt: {
          $gte: start,
          $lt: end,
        },
      },
    },

    {
      $project: {
        clientId: getFieldExpression(
          "clientId",
          "visitorId",
          "customerId"
        ),

        sessionId: getFieldExpression(
          "sessionId",
          "session",
          "journeyId"
        ),

        eventType: getFieldExpression(
          "eventType",
          "eventName",
          "type"
        ),

        query: getFieldExpression(
          "searchQuery",
          "query"
        ),
      },
    },

    {
      $match: {
        $or: [
          {
            clientId: {
              $ne: null,
            },
          },
          {
            sessionId: {
              $ne: null,
            },
          },
        ],
      },
    },

    {
      $project: {
        sessionKey: {
          $ifNull: [
            "$sessionId",
            "$clientId",
          ],
        },

        eventType: 1,
        query: 1,
      },
    },

    {
      $group: {
        _id: "$sessionKey",

        events: {
          $push: {
            type: "$eventType",
            query: "$query",
          },
        },
      },
    },
  ];

  const sessions = await collection
    .aggregate(pipeline)
    .toArray();

  const queryStats = new Map();

  for (const session of sessions) {
    const events = session.events || [];

    const searchEvents = events.filter(
      (event) =>
        [
          "search_submitted",
          "search",
          "search_performed",
        ].includes(event.type)
    );

    if (!searchEvents.length) {
      continue;
    }

    const hasCollection = events.some(
      (event) =>
        [
          "collection_viewed",
          "collection_view",
        ].includes(event.type)
    );

    const hasProduct = events.some(
      (event) =>
        [
          "product_viewed",
          "product_view",
          "product_clicked",
          "product_click",
        ].includes(event.type)
    );

    const hasCart = events.some(
      (event) =>
        [
          "product_added_to_cart",
          "add_to_cart",
          "cart_created",
        ].includes(event.type)
    );

    const hasPurchase = events.some(
      (event) =>
        [
          "checkout_completed",
          "purchase",
          "order_completed",
        ].includes(event.type)
    );

    for (const searchEvent of searchEvents) {
      const normalizedQuery = normalizeQuery(
        searchEvent.query
      );

      if (!normalizedQuery) {
        continue;
      }

      if (!queryStats.has(normalizedQuery)) {
        queryStats.set(normalizedQuery, {
          query:
            searchEvent.query ||
            normalizedQuery,

          sessions: 0,
          collectionSessions: 0,
          productSessions: 0,
          cartSessions: 0,
          purchaseSessions: 0,
        });
      }

      const stats =
        queryStats.get(normalizedQuery);

      stats.sessions += 1;

      if (hasCollection) {
        stats.collectionSessions += 1;
      }

      if (hasProduct) {
        stats.productSessions += 1;
      }

      if (hasCart) {
        stats.cartSessions += 1;
      }

      if (hasPurchase) {
        stats.purchaseSessions += 1;
      }
    }
  }

  const results = [];

  for (const [normalizedQuery, stats] of queryStats) {
    if (stats.sessions < 3) {
      continue;
    }

    const productDropOffRate =
      stats.sessions > 0
        ? ((stats.sessions -
            stats.productSessions) /
            stats.sessions) *
          100
        : 0;

    const purchaseDropOffRate =
      stats.cartSessions > 0
        ? ((stats.cartSessions -
            stats.purchaseSessions) /
            stats.cartSessions) *
          100
        : 0;

    const dropOffRate = Math.max(
      productDropOffRate,
      purchaseDropOffRate
    );

    if (dropOffRate < 30) {
      continue;
    }

    results.push({
      query: stats.query,
      normalizedQuery,
      journeySessions: stats.sessions,
      journeyDropOffRate: round(
        clamp(dropOffRate, 0, 100)
      ),
    });
  }

  results.sort(
    (a, b) =>
      b.journeyDropOffRate -
      a.journeyDropOffRate
  );

  return results.slice(0, 100);
};

/**
 * ---------------------------------------------------------
 * POTENTIAL PRODUCTS
 * ---------------------------------------------------------
 *
 * Uses real Shopify product data to find products that
 * could be related to a zero-result search.
 *
 * This is intentionally conservative.
 *
 * A product is considered related when query words occur
 * in its title, handle, vendor, tags, or product type.
 */
export const findPotentialProducts = async ({
  shop,
  query,
}) => {
  const collection = getCollection(
    DEFAULT_COLLECTIONS.products
  );

  const words = normalizeQuery(query)
    .split(" ")
    .filter((word) => word.length >= 2)
    .slice(0, 6);

  if (!words.length) {
    return [];
  }

  const regex = words.map(escapeRegex).join("|");

  const results = await collection
    .find({
      shop,

      $or: [
        {
          title: {
            $regex: regex,
            $options: "i",
          },
        },
        {
          handle: {
            $regex: regex,
            $options: "i",
          },
        },
        {
          vendor: {
            $regex: regex,
            $options: "i",
          },
        },
        {
          productType: {
            $regex: regex,
            $options: "i",
          },
        },
        {
          tags: {
            $regex: regex,
            $options: "i",
          },
        },
      ],
    })
    .project({
      _id: 0,
      id: 1,
      productId: 1,
      shopifyProductId: 1,
      title: 1,
    })
    .limit(20)
    .toArray();

  return results;
};

function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/**
 * ---------------------------------------------------------
 * IMPACT SCORE
 * ---------------------------------------------------------
 *
 * The merchant should not need to understand this formula.
 *
 * Inputs:
 *
 * Search volume
 * Potential products
 * Journey drop-off
 * Zero-result signal
 * Discoverability signal
 */
const calculateImpactScore = ({
  searches,
  potentialProducts,
  journeyDropOffRate,
  hasZeroResult,
  hasLowDiscoverability,
}) => {
  const searchVolumeScore = clamp(
    (searches / 500) * 35,
    0,
    35
  );

  const productOpportunityScore = clamp(
    (potentialProducts / 20) * 20,
    0,
    20
  );

  const dropOffScore = clamp(
    (journeyDropOffRate / 100) * 25,
    0,
    25
  );

  const signalScore =
    (hasZeroResult ? 10 : 0) +
    (hasLowDiscoverability ? 10 : 0);

  return round(
    clamp(
      searchVolumeScore +
        productOpportunityScore +
        dropOffScore +
        signalScore,
      0,
      100
    )
  );
};

const getImpactLevel = (score) => {
  if (score >= 70) {
    return "High";
  }

  if (score >= 40) {
    return "Medium";
  }

  return "Low";
};

const getProblem = ({
  hasZeroResult,
  hasLowDiscoverability,
  hasJourneyDropOff,
}) => {
  if (
    hasZeroResult &&
    hasLowDiscoverability &&
    hasJourneyDropOff
  ) {
    return "Customers are searching for this demand, but suitable products are difficult to discover and shoppers are dropping out of the journey.";
  }

  if (
    hasZeroResult &&
    hasJourneyDropOff
  ) {
    return "Customers are searching for this term but are not finding suitable products and are leaving the discovery journey.";
  }

  if (
    hasZeroResult &&
    hasLowDiscoverability
  ) {
    return "Customers are showing demand, but search results and product discoverability are not connecting them with suitable products.";
  }

  if (hasLowDiscoverability) {
    return "A relevant product has a low discoverability score and may be difficult for customers to find.";
  }

  if (hasJourneyDropOff) {
    return "Customers show product intent but a large share leave before reaching the next discovery stage.";
  }

  if (hasZeroResult) {
    return "Customers are searching for a product or need but receive no suitable search results.";
  }

  return "Customer demand is not being converted into successful product discovery.";
};

const getRecommendation = ({
  hasZeroResult,
  hasLowDiscoverability,
  hasJourneyDropOff,
  potentialProducts,
}) => {
  const actions = [];

  if (hasZeroResult) {
    if (potentialProducts > 0) {
      actions.push(
        "Improve search matching so existing relevant products can appear."
      );
    } else {
      actions.push(
        "Review whether products should be added or promoted for this demand."
      );
    }
  }

  if (hasLowDiscoverability) {
    actions.push(
      "Improve product visibility, collection placement, or merchandising."
    );
  }

  if (hasJourneyDropOff) {
    actions.push(
      "Review the customer discovery path and reduce the largest drop-off."
    );
  }

  if (!actions.length) {
    actions.push(
      "Review this opportunity and improve product discovery."
    );
  }

  return actions.join(" ");
};

/**
 * ---------------------------------------------------------
 * BUILD OPPORTUNITIES
 * ---------------------------------------------------------
 */
const buildOpportunities = async ({
  shop,
  days,
}) => {
  const { start, end } =
    getDateRange(days);

  const [
    zeroResults,
    searchVolumes,
    lowDiscoverability,
    journeyDropOffs,
  ] = await Promise.all([
    getZeroResultOpportunities({
      shop,
      start,
      end,
    }),

    getSearchVolumes({
      shop,
      start,
      end,
    }),

    getLowDiscoverabilityOpportunities({
      shop,
    }),

    getJourneyDropOffs({
      shop,
      start,
      end,
    }),
  ]);

  const opportunityMap = new Map();

  /**
   * -----------------------------------------------
   * ZERO RESULT SIGNAL
   * -----------------------------------------------
   */
  for (const item of zeroResults) {
    const key = `query:${item._id}`;

    const searches =
      searchVolumes.get(item._id) ||
      item.zeroResultSearches ||
      0;

    const potentialProducts =
      await findPotentialProducts({
        shop,
        query: item.query,
      });

    opportunityMap.set(key, {
      opportunityKey: key,

      opportunityType:
        potentialProducts.length > 0
          ? "Combined"
          : "Zero Result",

      query: item.query,
      normalizedQuery: item._id,

      searches,

      zeroResultSearches:
        item.zeroResultSearches,

      potentialProducts:
        potentialProducts.length,

      potentialProductIds:
        potentialProducts.map(
          (product) =>
            String(
              product.productId ||
                product.shopifyProductId ||
                product.id ||
                ""
            )
        ),

      signals: {
        zeroResult: true,
        lowDiscoverability: false,
        journeyDropOff: false,
      },

      journeySessions: 0,
      journeyDropOffRate: 0,
      discoverabilityScore: null,
    });
  }

  /**
   * -----------------------------------------------
   * JOURNEY DROP-OFF SIGNAL
   * -----------------------------------------------
   */
  for (const item of journeyDropOffs) {
    const key = `query:${item.normalizedQuery}`;

    const existing =
      opportunityMap.get(key);

    if (existing) {
      existing.signals.journeyDropOff =
        true;

      existing.journeySessions =
        item.journeySessions;

      existing.journeyDropOffRate =
        item.journeyDropOffRate;

      existing.opportunityType =
        "Combined";

      continue;
    }

    const searches =
      searchVolumes.get(
        item.normalizedQuery
      ) || 0;

    opportunityMap.set(key, {
      opportunityKey: key,

      opportunityType:
        "Journey Drop-off",

      query: item.query,

      normalizedQuery:
        item.normalizedQuery,

      searches,

      zeroResultSearches: 0,

      potentialProducts: 0,

      potentialProductIds: [],

      discoverabilityScore: null,

      journeySessions:
        item.journeySessions,

      journeyDropOffRate:
        item.journeyDropOffRate,

      signals: {
        zeroResult: false,
        lowDiscoverability: false,
        journeyDropOff: true,
      },
    });
  }

  /**
   * -----------------------------------------------
   * LOW DISCOVERABILITY SIGNAL
   * -----------------------------------------------
   *
   * Product-level opportunity.
   */
  for (const item of lowDiscoverability) {
    const productId = String(
      item.productId || ""
    );

    if (!productId) {
      continue;
    }

    const key = `product:${productId}`;

    const existing =
      opportunityMap.get(key);

    if (existing) {
      existing.signals.lowDiscoverability =
        true;

      existing.discoverabilityScore =
        Number(item.score);

      existing.productTitle =
        item.productTitle || "";

      existing.opportunityType =
        "Combined";

      continue;
    }

    opportunityMap.set(key, {
      opportunityKey: key,

      opportunityType:
        "Low Discoverability",

      query: "",

      normalizedQuery: "",

      productId,

      productTitle:
        item.productTitle || "",

      searches: 0,

      zeroResultSearches: 0,

      potentialProducts: 1,

      potentialProductIds: [
        productId,
      ],

      discoverabilityScore:
        Number(item.score),

      journeySessions: 0,

      journeyDropOffRate: 0,

      signals: {
        zeroResult: false,
        lowDiscoverability: true,
        journeyDropOff: false,
      },
    });
  }

  /**
   * -----------------------------------------------
   * FINALIZE
   * -----------------------------------------------
   */
  const opportunities = [];

  for (const opportunity of opportunityMap.values()) {
    const impactScore =
      calculateImpactScore({
        searches:
          opportunity.searches,

        potentialProducts:
          opportunity.potentialProducts,

        journeyDropOffRate:
          opportunity.journeyDropOffRate,

        hasZeroResult:
          opportunity.signals.zeroResult,

        hasLowDiscoverability:
          opportunity.signals
            .lowDiscoverability,
      });

    const impactLevel =
      getImpactLevel(impactScore);

    const problem = getProblem({
      hasZeroResult:
        opportunity.signals.zeroResult,

      hasLowDiscoverability:
        opportunity.signals
          .lowDiscoverability,

      hasJourneyDropOff:
        opportunity.signals
          .journeyDropOff,
    });

    const recommendation =
      getRecommendation({
        hasZeroResult:
          opportunity.signals.zeroResult,

        hasLowDiscoverability:
          opportunity.signals
            .lowDiscoverability,

        hasJourneyDropOff:
          opportunity.signals
            .journeyDropOff,

        potentialProducts:
          opportunity.potentialProducts,
      });

    opportunities.push({
      ...opportunity,

      impactScore,

      impactLevel,

      problem,

      recommendation,

      periodDays: days,

      periodStart: start,

      periodEnd: end,

      generatedAt: new Date(),
    });
  }

  opportunities.sort(
    (a, b) =>
      b.impactScore -
      a.impactScore
  );

  return {
    opportunities: opportunities.slice(
      0,
      100
    ),

    period: {
      days,

      start,

      end,
    },
  };
};

/**
 * ---------------------------------------------------------
 * SAVE SNAPSHOT
 * ---------------------------------------------------------
 */
const saveOpportunitySnapshot = async ({
  shop,
  opportunities,
  period,
}) => {
  await MissedSalesOpportunity.deleteMany({
    shop,

    periodStart: period.start,

    periodEnd: period.end,
  });

  if (!opportunities.length) {
    return [];
  }

  return MissedSalesOpportunity.insertMany(
    opportunities.map((opp) => ({
      shop,
      ...opp,
    }))
  );
};

/**
 * ---------------------------------------------------------
 * OVERVIEW
 * ---------------------------------------------------------
 */
export const getMissedSalesOpportunityOverview =
  async ({
    shop,
    days = 30,
  }) => {
    const result =
      await buildOpportunities({
        shop,
        days,
      });

    await saveOpportunitySnapshot({
      shop,

      opportunities:
        result.opportunities,

      period: result.period,
    });

    const opportunities =
      result.opportunities;

    const highImpact =
      opportunities.filter(
        (item) =>
          item.impactLevel === "High"
      );

    const potentialProducts =
      opportunities.reduce(
        (total, item) =>
          total +
          Number(
            item.potentialProducts || 0
          ),
        0
      );

    const searchesAtRisk =
      opportunities.reduce(
        (total, item) =>
          total +
          Number(
            item.searches || 0
          ),
        0
      );

    const combinedOpportunities =
      opportunities.filter(
        (item) =>
          item.signals.zeroResult &&
          (item.signals
            .lowDiscoverability ||
            item.signals
              .journeyDropOff)
      );

    return {
      summary: {
        totalOpportunities:
          opportunities.length,

        highImpact:
          highImpact.length,

        potentialProducts,

        searchesAtRisk,
      },

      opportunities,

      biggestOpportunity:
        opportunities[0] || null,

      combinedOpportunities:
        combinedOpportunities.length,

      period: result.period,
    };
  };

/**
 * ---------------------------------------------------------
 * LIST
 * ---------------------------------------------------------
 */
export const getMissedSalesOpportunityList =
  async ({
    shop,
    days = 30,
    impactLevel,
    opportunityType,
    limit = 50,
  }) => {
    const result =
      await buildOpportunities({
        shop,
        days,
      });

    let opportunities =
      result.opportunities;

    if (impactLevel) {
      opportunities =
        opportunities.filter(
          (item) =>
            item.impactLevel ===
            impactLevel
        );
    }

    if (opportunityType) {
      opportunities =
        opportunities.filter(
          (item) =>
            item.opportunityType ===
            opportunityType
        );
    }

    return opportunities.slice(
      0,
      Math.min(
        Number(limit) || 50,
        100
      )
    );
  };

export const getMissedSalesOpportunityDetails =
  async ({
    shop,
    opportunityKey,
    days = 30,
  }) => {
    const result =
      await buildOpportunities({
        shop,
        days,
      });

    return (
      result.opportunities.find(
        (item) =>
          item.opportunityKey ===
          opportunityKey
      ) || null
    );
  };