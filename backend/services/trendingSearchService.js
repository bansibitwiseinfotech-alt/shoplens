import TrendingSearch from "../models/TrendingSearch.js";
import SearchEvent from "../models/searchEvent.model.js";

const MIN_CURRENT_SEARCHES = 3;
const MIN_TREND_GROWTH = 25;

const calculateGrowth = (current, previous) => {
    if (previous === 0) {
        if (current > 0) return 100;
        return 0;
    }

    return ((current - previous) / previous) * 100;
};

const roundNumber = (value, decimals = 2) => {
    const multiplier = 10 ** decimals;
    return Math.round(value * multiplier) / multiplier;
};

const getTrendType = ({
    currentSearches,
    previousSearches,
    growthPercent,
}) => {
    if (currentSearches < MIN_CURRENT_SEARCHES) {
        return "Stable";
    }

    if (previousSearches === 0 && currentSearches >= MIN_CURRENT_SEARCHES) {
        return "New";
    }

    if (
        currentSearches >= MIN_CURRENT_SEARCHES &&
        growthPercent >= MIN_TREND_GROWTH
    ) {
        return "Rising";
    }

    return "Stable";
};

const getRecommendation = (trendType, growthPercent, currentSearches) => {
    if (trendType === "New") {
        return `New demand detected with ${currentSearches} searches. Review product availability and merchandising.`;
    }

    if (trendType === "Rising") {
        return `Search demand increased ${Math.round(growthPercent)}%. Consider improving product visibility for this search.`;
    }

    if (trendType === "Seasonal") {
        return "Recurring seasonal demand detected. Consider preparing relevant products and collections before demand increases.";
    }

    return "Search demand is currently stable.";
};

const buildSearchPipeline = ({
    shop,
    startDate,
    endDate,
}) => {
    return [
        {
            $match: {
                shop,
                $or: [
                    { eventName: "search_submitted" },
                    { eventType: "search" },
                ],
                occurredAt: {
                    $gte: startDate,
                    $lt: endDate,
                },
                query: {
                    $exists: true,
                    $ne: "",
                },
            },
        },

        {
            $project: {
                query: 1,
                normalizedQuery: {
                    $trim: {
                        input: {
                            $toLower: "$query",
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
                query: {
                    $first: "$query",
                },
            },
        },
    ];
};

const getSearchCounts = async ({
    shop,
    startDate,
    endDate,
}) => {
    return SearchEvent.aggregate(
        buildSearchPipeline({
            shop,
            startDate,
            endDate,
        })
    );
};

const calculateTrendScore = ({
    currentSearches,
    previousSearches,
    growthPercent,
}) => {
    const volumeScore = Math.min(currentSearches / 100, 1) * 40;

    const growthScore =
        Math.min(Math.max(growthPercent, 0) / 200, 1) * 60;

    const previousDemandBonus =
        previousSearches > 0
            ? Math.min(previousSearches / 50, 1) * 10
            : 0;

    return roundNumber(
        Math.min(volumeScore + growthScore + previousDemandBonus, 100),
        2
    );
};

export const calculateTrendingSearches = async ({
    shop,
    days = 30,
}) => {
    const now = new Date();

    const currentPeriodEnd = now;

    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(
        currentPeriodStart.getDate() - days
    );

    const previousPeriodEnd = new Date(currentPeriodStart);

    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(
        previousPeriodStart.getDate() - days
    );

    const [currentResults, previousResults] = await Promise.all([
        getSearchCounts({
            shop,
            startDate: currentPeriodStart,
            endDate: currentPeriodEnd,
        }),

        getSearchCounts({
            shop,
            startDate: previousPeriodStart,
            endDate: previousPeriodEnd,
        }),
    ]);

    const previousMap = new Map();

    for (const item of previousResults) {
        previousMap.set(item._id, {
            searches: item.searches,
            query: item.query,
        });
    }

    const currentMap = new Map();

    for (const item of currentResults) {
        currentMap.set(item._id, {
            searches: item.searches,
            query: item.query,
        });
    }

    const allQueries = new Set([
        ...currentMap.keys(),
        ...previousMap.keys(),
    ]);

    const trends = [];

    for (const normalizedQuery of allQueries) {
        const current = currentMap.get(normalizedQuery);
        const previous = previousMap.get(normalizedQuery);

        const currentSearches = current?.searches || 0;
        const previousSearches = previous?.searches || 0;

        if (currentSearches < MIN_CURRENT_SEARCHES) {
            continue;
        }

        const growthPercent = calculateGrowth(
            currentSearches,
            previousSearches
        );

        const trendType = getTrendType({
            currentSearches,
            previousSearches,
            growthPercent,
        });

        if (
            trendType === "Stable" &&
            growthPercent < MIN_TREND_GROWTH
        ) {
            continue;
        }

        const trendScore = calculateTrendScore({
            currentSearches,
            previousSearches,
            growthPercent,
        });

        const query = current?.query || previous?.query || normalizedQuery;

        trends.push({
            query,
            normalizedQuery,
            currentSearches,
            previousSearches,
            growthPercent: roundNumber(growthPercent),
            trendType,
            trendScore,
            currentPeriodStart,
            currentPeriodEnd,
            previousPeriodStart,
            previousPeriodEnd,
            recommendation: getRecommendation(
                trendType,
                growthPercent,
                currentSearches
            ),
        });
    }

    trends.sort((a, b) => {
        if (b.trendScore !== a.trendScore) {
            return b.trendScore - a.trendScore;
        }

        return b.growthPercent - a.growthPercent;
    });

    return {
        trends,
        period: {
            days,
            currentPeriod: {
                start: currentPeriodStart,
                end: currentPeriodEnd,
            },
            previousPeriod: {
                start: previousPeriodStart,
                end: previousPeriodEnd,
            },
        },
    };
};

export const saveTrendingSearches = async ({
    shop,
    trends,
}) => {
    if (!trends.length) {
        return [];
    }

    await TrendingSearch.deleteMany({
        shop,
        currentPeriodStart: trends[0].currentPeriodStart,
        currentPeriodEnd: trends[0].currentPeriodEnd,
    });

    return TrendingSearch.insertMany(
        trends.map((trend) => ({
            shop,
            ...trend,
            generatedAt: new Date(),
        }))
    );
};

export const getTrendingOverview = async ({
    shop,
    days = 30,
}) => {
    const { trends, period } =
        await calculateTrendingSearches({
            shop,
            days,
        });

    await saveTrendingSearches({
        shop,
        trends,
    });

    const trending = trends.filter(
        (item) => item.trendType === "Rising"
    );

    const newTrends = trends.filter(
        (item) => item.trendType === "New"
    );

    const seasonal = trends.filter(
        (item) => item.trendType === "Seasonal"
    );

    const totalCurrentSearches = trends.reduce(
        (total, item) => total + item.currentSearches,
        0
    );

    const totalPreviousSearches = trends.reduce(
        (total, item) => total + item.previousSearches,
        0
    );

    const overallGrowth = calculateGrowth(
        totalCurrentSearches,
        totalPreviousSearches
    );

    return {
        summary: {
            trendingSearches: trending.length,
            newTrends: newTrends.length,
            seasonalSearches: seasonal.length,
            searchGrowth: roundNumber(overallGrowth),
        },

        fastestGrowingSearches: trends.slice(0, 20),

        biggestTrend:
            trends.length > 0
                ? trends.reduce((best, current) =>
                    current.growthPercent > best.growthPercent
                        ? current
                        : best
                )
                : null,

        period,
    };
};

export const getTrendingSearchList = async ({
    shop,
    days = 30,
    trendType,
    limit = 50,
}) => {
    const { trends } = await calculateTrendingSearches({
        shop,
        days,
    });

    let filtered = trends;

    if (trendType) {
        filtered = filtered.filter(
            (item) => item.trendType === trendType
        );
    }

    return filtered.slice(0, Math.min(Number(limit) || 50, 100));
};