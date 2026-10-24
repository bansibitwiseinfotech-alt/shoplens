import SearchEvent from "../models/searchEvent.model.js";
import MissedSalesOpportunity from "../models/MissedSalesOpportunity.js";
import { calculateOpportunityScore } from "../utils/opportunityScore.js";
import { getSearchAttribution } from "./searchIntelligence.service.js";
import { findPotentialProducts } from "./missedSalesOpportunityService.js";

/**
 * Detector configuration.
 */
const CONFIG = {
    /**
     * Minimum searches to classify as high volume.
     */
    HIGH_VOLUME_THRESHOLD: 10,

    /**
     * Minimum zero-result searches for recurring detection.
     */
    RECURRING_SEARCH_THRESHOLD: 3,

    /**
     * Minimum number of different days.
     */
    RECURRING_DAYS_THRESHOLD: 2,
};

/**
 * Build date filter.
 */
function buildDateFilter(from, to) {
    const dateFilter = {};

    if (from) {
        const fromDate = new Date(from);

        if (!Number.isNaN(fromDate.getTime())) {
            dateFilter.$gte = fromDate;
        }
    }

    if (to) {
        const toDate = new Date(to);

        if (!Number.isNaN(toDate.getTime())) {
            dateFilter.$lte = toDate;
        }
    }

    return Object.keys(dateFilter).length > 0
        ? dateFilter
        : null;
}

/**
 * Get zero-result searches.
 */
export async function getZeroResultSearches({
    shop,
    from,
    to,
    sort = "volume",
    limit = 50,
}) {
    const match = {
        shop,
        eventType: "search",

        /**
         * IMPORTANT:
         * null is NOT considered zero.
         *
         * Only resultCount === 0 is a failed search.
         */
        resultCount: 0,

        normalizedQuery: {
            $nin: [null, ""],
        },
    };

    /**
     * Date range.
     */
    const dateFilter = buildDateFilter(from, to);

    if (dateFilter) {
        match.occurredAt = dateFilter;
    }

    /**
     * MongoDB aggregation.
     */
    const pipeline = [
        {
            $match: match,
        },

        /**
         * Group identical normalized queries.
         */
        {
            $group: {
                _id: "$normalizedQuery",

                searches: {
                    $sum: 1,
                },

                customers: {
                    $addToSet: "$clientId",
                },

                queryIds: {
                    $addToSet: "$queryId",
                },

                activeDays: {
                    $addToSet: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$occurredAt",
                        },
                    },
                },

                firstSeen: {
                    $min: "$occurredAt",
                },

                lastSeen: {
                    $max: "$occurredAt",
                },
            },
        },

        /**
         * Format aggregation result.
         */
        {
            $project: {
                _id: 0,

                query: "$_id",

                searches: 1,

                zeroResults: "$searches",

                customers: 1,

                queryIds: 1,

                activeDays: 1,

                firstSeen: 1,

                lastSeen: 1,
            },
        },
    ];

    let results =
        await SearchEvent.aggregate(pipeline);

    const queriesList = results.map((item) => item.query).filter(Boolean);

    const clicksMap = new Map();
    const purchasesMap = new Map();

    if (queriesList.length > 0) {
        try {
            const clickEvents = await SearchEvent.aggregate([
                {
                    $match: {
                        shop,
                        eventType: "click",
                        normalizedQuery: { $in: queriesList },
                        ...(dateFilter ? { occurredAt: dateFilter } : {}),
                    },
                },
                {
                    $group: {
                        _id: "$normalizedQuery",
                        count: { $sum: 1 },
                    },
                },
            ]);
            for (const c of clickEvents) {
                clicksMap.set(c._id, c.count);
            }
        } catch (err) {
            console.error("Error aggregating clicks for zero result searches:", err);
        }

        try {
            const attributedPurchases = await getSearchAttribution({ shop, from, to });
            if (Array.isArray(attributedPurchases)) {
                for (const p of attributedPurchases) {
                    const q = p.search?.normalizedQuery;
                    if (q && queriesList.includes(q)) {
                        purchasesMap.set(q, (purchasesMap.get(q) || 0) + 1);
                    }
                }
            }
        } catch (err) {
            console.error("Error aggregating purchases for zero result searches:", err);
        }
    }

    /**
     * Merge Missed Sales Opportunity data for the shop.
     */
    const oppMap = new Map();
    if (queriesList.length > 0) {
        try {
            const normalizedQueriesList = queriesList.map((q) =>
                String(q || "").toLowerCase().trim()
            );
            const opps = await MissedSalesOpportunity.find({
                shop,
                $or: [
                    { query: { $in: queriesList } },
                    { normalizedQuery: { $in: normalizedQueriesList } },
                ],
            }).lean();
            for (const opp of opps) {
                if (opp.query) oppMap.set(opp.query.toLowerCase().trim(), opp);
                if (opp.normalizedQuery) oppMap.set(opp.normalizedQuery.toLowerCase().trim(), opp);
            }
        } catch (err) {
            console.error("Error fetching missed sales opportunities in zeroResultSearch:", err);
        }
    }

    const potentialProductsMap = new Map();
    const missingQueries = queriesList.filter((q) => !oppMap.has(String(q || "").toLowerCase().trim()));
    if (missingQueries.length > 0) {
        await Promise.all(
            missingQueries.map(async (query) => {
                try {
                    const products = await findPotentialProducts({ shop, query });
                    potentialProductsMap.set(String(query || "").toLowerCase().trim(), products.length);
                } catch (_) {
                    potentialProductsMap.set(String(query || "").toLowerCase().trim(), 0);
                }
            })
        );
    }

    /**
     * Calculate classifications.
     */
    results = results.map((item) => {
        /**
         * Remove null customer IDs.
         */
        const uniqueCustomers =
            item.customers.filter(
                (customer) =>
                    customer !== null &&
                    customer !== undefined
            ).length;

        /**
         * Remove null query IDs.
         */
        const uniqueQueries =
            item.queryIds.filter(
                (queryId) =>
                    queryId !== null &&
                    queryId !== undefined
            ).length;

        /**
         * High-volume condition.
         */
        const isHighVolume =
            item.searches >=
            CONFIG.HIGH_VOLUME_THRESHOLD;

        /**
         * Recurring condition.
         */
        const isRecurring =
            item.searches >=
            CONFIG.RECURRING_SEARCH_THRESHOLD &&
            item.activeDays.length >=
            CONFIG.RECURRING_DAYS_THRESHOLD;

        /**
         * Classification.
         */
        let classification = "one_off";

        let severity = "low";

        if (isHighVolume && isRecurring) {
            classification =
                "high_volume_recurring";

            severity = "critical";
        } else if (isHighVolume) {
            classification = "high_volume";

            severity = "high";
        } else if (isRecurring) {
            classification = "recurring";

            severity = "medium";
        }

        /**
         * Opportunity score calculation.
         */
        const scoreBreakdown = calculateOpportunityScore({
            searches: item.searches,
            isRecurring,
            activeDays: item.activeDays.length,
            uniqueCustomers,
        });

        const normQ = String(item.query || "").toLowerCase().trim();
        const existingOpp = oppMap.get(normQ);
        const potentialProducts =
            existingOpp?.potentialProducts !== undefined
                ? Number(existingOpp.potentialProducts || 0)
                : potentialProductsMap.get(normQ) || 0;

        const impactLevel =
            existingOpp?.impactLevel ||
            (item.searches >= 10 ? "High" : item.searches >= 4 ? "Medium" : "Low");
        const impactScore =
            existingOpp?.impactScore !== undefined
                ? existingOpp.impactScore
                : scoreBreakdown.finalScore;

        let opportunity = "No Opportunity";
        if (potentialProducts > 0) {
            if (item.searches >= 5 || isHighVolume || isRecurring) {
                opportunity = "Opportunity";
            } else if (item.searches >= 4) {
                opportunity = "Potential Opportunity";
            } else {
                opportunity = "Low";
            }
        } else {
            if (item.searches >= 4 || isHighVolume || isRecurring) {
                opportunity = "At Risk";
            } else {
                opportunity = "No Opportunity";
            }
        }

        const problem =
            existingOpp?.problem ||
            "Customers are searching for a product or need but receive no suitable search results.";
        const recommendation =
            existingOpp?.recommendation ||
            "Review product availability, search synonyms, product tags, pricing filters, and search relevance rules.";

        return {
            query: item.query,

            searches: item.searches,

            zeroResults: item.zeroResults,

            uniqueCustomers,

            uniqueQueries,

            activeDays:
                item.activeDays.length,

            classification,

            severity,

            isHighVolume,

            isRecurring,

            opportunityScore: scoreBreakdown.finalScore,

            scoreBreakdown,

            firstSeen: item.firstSeen,

            lastSeen: item.lastSeen && new Date(item.lastSeen).getTime() > Date.now()
                ? new Date()
                : item.lastSeen,

            clicks: clicksMap.get(item.query) || 0,

            purchases: purchasesMap.get(item.query) || 0,

            hasResults: false,

            resultCount: 0,

            potentialProducts,

            opportunity,

            customerSignal: "No results",

            impactLevel,

            impactScore,

            problem,

            recommendation,
        };
    });

    /**
     * Sorting.
     */
    switch (sort) {
        case "opportunity":
            results.sort(
                (a, b) =>
                    b.opportunityScore - a.opportunityScore ||
                    new Date(b.lastSeen) - new Date(a.lastSeen)
            );
            break;

        case "volume":
            results.sort((a, b) => {
                if (b.searches !== a.searches) {
                    return b.searches - a.searches;
                }
                return new Date(b.lastSeen) - new Date(a.lastSeen);
            });
            break;

        case "days":
            results.sort(
                (a, b) =>
                    b.activeDays - a.activeDays ||
                    new Date(b.lastSeen) - new Date(a.lastSeen)
            );
            break;

        case "recent":
        default:
            results.sort(
                (a, b) =>
                    new Date(b.lastSeen) - new Date(a.lastSeen)
            );
            break;
    }

    /**
     * Limit response.
     */
    return results.slice(0, limit);
}

/**
 * Dashboard summary.
 */
export async function getZeroResultSummary({
    shop,
    from,
    to,
}) {
    const baseFilter = {
        shop,
    };

    /**
     * Date range.
     */
    const dateFilter =
        buildDateFilter(from, to);

    if (dateFilter) {
        baseFilter.occurredAt =
            dateFilter;
    }

    /**
     * Total search events.
     */
    const totalSearches =
        await SearchEvent.countDocuments({
            ...baseFilter,
            eventType: "search",
        });

    /**
     * Zero-result searches.
     */
    const zeroResultSearches =
        await SearchEvent.countDocuments({
            ...baseFilter,
            eventType: "search",
            resultCount: 0,
        });

    /**
     * Failed search groups.
     */
    const failedSearches =
        await getZeroResultSearches({
            shop,
            from,
            to,
            sort: "opportunity",
            limit: 10000,
        });

    /**
     * High-volume gaps.
     */
    const highVolumeGaps =
        failedSearches.filter(
            (item) => item.isHighVolume
        );

    /**
     * Recurring gaps.
     */
    const recurringGaps =
        failedSearches.filter(
            (item) => item.isRecurring
        );

    /**
     * Potential Product Gaps: Recurring or high-volume gaps requiring merchant action.
     */
    const potentialProductGaps =
        failedSearches.filter(
            (item) => item.isRecurring || item.isHighVolume || item.classification !== "one_off"
        );

    /**
     * Zero-result percentage.
     */
    const zeroResultRate =
        totalSearches === 0
            ? 0
            : Number(
                (
                    (zeroResultSearches /
                        totalSearches) *
                    100
                ).toFixed(2)
            );

    const totalPotentialProducts = failedSearches.reduce(
        (sum, item) => sum + (Number(item.potentialProducts) || 0),
        0
    );

    return {
        totalSearches,

        zeroResultSearches,

        zeroResultRate,

        uniqueFailedQueries:
            failedSearches.length,

        potentialProductGaps:
            totalPotentialProducts > 0
                ? totalPotentialProducts
                : potentialProductGaps.length,

        potentialProducts:
            totalPotentialProducts > 0
                ? totalPotentialProducts
                : potentialProductGaps.length,

        highVolumeGaps:
            highVolumeGaps.length,

        recurringGaps:
            recurringGaps.length,

        topFailedSearch:
            failedSearches[0] || null,
    };
}

/**
 * Record a search event.
 */
export async function createSearchEvent(data) {
    return SearchEvent.create(data);
}
