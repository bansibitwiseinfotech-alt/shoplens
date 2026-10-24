import SearchIntent from "../models/SearchIntent.js";
import SearchEvent from "../models/searchEvent.model.js";
import mongoose from "mongoose";
import { fetchAllStoreProducts } from "./productSyncService.js";

/*
|--------------------------------------------------------------------------
| Basic helpers
|--------------------------------------------------------------------------
*/

const normalizeText = (value = "") => {
    return value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
};

const escapeRegex = (value = "") => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getWords = (text = "") => {
    return normalizeText(text)
        .split(" ")
        .map((word) => word.trim())
        .filter((word) => word.length >= 2);
};

/*
|--------------------------------------------------------------------------
| Common shopping attributes
|--------------------------------------------------------------------------
*/

const COLORS = [
    "black",
    "white",
    "red",
    "blue",
    "green",
    "yellow",
    "orange",
    "purple",
    "pink",
    "brown",
    "grey",
    "gray",
    "beige",
    "cream",
    "navy",
    "maroon",
    "silver",
    "gold",
    "golden",
    "multicolor",
    "multi color",
];

const SIZES = [
    "xs",
    "extra small",
    "small",
    "s",
    "medium",
    "m",
    "large",
    "l",
    "xl",
    "extra large",
    "xxl",
    "2xl",
    "xxxl",
    "3xl",
    "one size",
];

const PRODUCT_TYPE_KEYWORDS = [
    "running shoes",
    "shoes",
    "shoe",
    "sneakers",
    "sneaker",
    "boots",
    "sandals",
    "slippers",
    "shirt",
    "shirts",
    "tshirt",
    "t-shirt",
    "jeans",
    "pants",
    "trousers",
    "jacket",
    "coat",
    "dress",
    "skirt",
    "hoodie",
    "sweater",
    "bag",
    "backpack",
    "handbag",
    "wallet",
    "watch",
    "smartwatch",
    "tracker",
    "phone",
    "mobile",
    "iphone",
    "pixel",
    "laptop",
    "tablet",
    "headphones",
    "earbuds",
    "keyboard",
    "mouse",
    "camera",
    "charger",
    "cable",
];

const CATEGORY_KEYWORDS = {
    footwear: [
        "shoe",
        "shoes",
        "sneaker",
        "sneakers",
        "boots",
        "sandals",
        "slippers",
    ],

    clothing: [
        "shirt",
        "shirts",
        "tshirt",
        "t-shirt",
        "jeans",
        "pants",
        "trousers",
        "jacket",
        "coat",
        "dress",
        "skirt",
        "hoodie",
        "sweater",
    ],

    accessories: [
        "bag",
        "backpack",
        "handbag",
        "wallet",
        "watch",
        "smartwatch",
        "belt",
        "cap",
        "hat",
    ],

    electronics: [
        "phone",
        "mobile",
        "iphone",
        "pixel",
        "laptop",
        "tablet",
        "headphones",
        "earbuds",
        "keyboard",
        "mouse",
        "camera",
        "charger",
        "cable",
        "tracker",
        "smartwatch",
    ],
};

/*
|--------------------------------------------------------------------------
| Extract color
|--------------------------------------------------------------------------
*/

const extractColor = (query) => {
    const normalizedQuery = normalizeText(query);

    const found = COLORS.find((color) => {
        return normalizedQuery.includes(
            ` ${color} `
        ) ||
            normalizedQuery.startsWith(`${color} `) ||
            normalizedQuery.endsWith(` ${color}`) ||
            normalizedQuery === color;
    });

    return found || "";
};

/*
|--------------------------------------------------------------------------
| Extract size
|--------------------------------------------------------------------------
*/

const extractSize = (query) => {
    const normalizedQuery = normalizeText(query);

    const sizePattern =
        /\b(?:size\s*)?(xs|s|m|l|xl|xxl|xxxl|2xl|3xl)\b/i;

    const numericSizePattern =
        /\bsize\s*(\d{1,3})\b/i;

    const sizeMatch =
        normalizedQuery.match(sizePattern);

    if (sizeMatch) {
        return sizeMatch[1].toUpperCase();
    }

    const numericMatch =
        normalizedQuery.match(numericSizePattern);

    if (numericMatch) {
        return numericMatch[1];
    }

    const namedSize = SIZES.find(
        (size) =>
            normalizedQuery.includes(
                ` ${size} `
            ) ||
            normalizedQuery.startsWith(`${size} `) ||
            normalizedQuery.endsWith(` ${size}`)
    );

    return namedSize || "";
};

/*
|--------------------------------------------------------------------------
| Extract price intent
| Supports: Maximum price, Minimum price, Exact price, Price range, Budget
|--------------------------------------------------------------------------
*/

const parsePriceAmount = (str) => {
    if (!str) return null;
    const s = str.trim().toLowerCase().replace(/,/g, "");
    if (s.endsWith("k")) {
        const n = parseFloat(s.slice(0, -1));
        return Number.isNaN(n) ? null : Math.round(n * 1000);
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : Math.round(n);
};

const detectPriceCurrency = (query) => {
    if (query.includes("$") || /\busd\b/i.test(query)) return "$";
    if (query.includes("€") || /\beur\b/i.test(query)) return "€";
    if (query.includes("£") || /\bgbp\b/i.test(query)) return "£";
    return "₹";
};

const formatPriceCurrency = (curr, amount) => {
    return `${curr}${Number(amount).toLocaleString("en-IN")}`;
};

const extractPrice = (query) => {
    if (!query || typeof query !== "string") return "";
    const q = query.trim().toLowerCase();
    const curr = detectPriceCurrency(q);

    // 1. Range: "between X and Y", "X to Y", "X - Y"
    const rangeMatch = q.match(
        /(?:between|from)?\s*(?:(?:rs|inr|\$|€|£|₹)\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?k?)\s*(?:and|to|-)\s*(?:(?:rs|inr|\$|€|£|₹)\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?k?)/i
    );
    if (rangeMatch && (q.includes("between") || q.includes(" to ") || q.includes(" - "))) {
        const min = parsePriceAmount(rangeMatch[1]);
        const max = parsePriceAmount(rangeMatch[2]);
        if (min !== null && max !== null && min > 0 && max > 0 && max > min) {
            return `${formatPriceCurrency(curr, min)}–${formatPriceCurrency(curr, max)}`;
        }
    }

    // 2. Max: under, below, less than, upto, up to, within, max, maximum, at most
    const maxMatch = q.match(
        /(?:under|below|less than|upto|up to|within|max|maximum|at most)\s*(?:of\s*)?(?:(?:rs|inr|\$|€|£|₹)\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?k?)/i
    );
    if (maxMatch) {
        const amount = parsePriceAmount(maxMatch[1]);
        if (amount !== null && amount > 0) {
            return `Max ${formatPriceCurrency(curr, amount)}`;
        }
    }

    // 3. Min: above, over, more than, greater than, at least, min, minimum, starting from
    const minMatch = q.match(
        /(?:above|over|more than|greater than|at least|min|minimum|starting from)\s*(?:(?:rs|inr|\$|€|£|₹)\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?k?)/i
    );
    if (minMatch) {
        const amount = parsePriceAmount(minMatch[1]);
        if (amount !== null && amount > 0) {
            return `Min ${formatPriceCurrency(curr, amount)}`;
        }
    }

    // 4. Exact: for 5000, at 5000, approx 5000
    const exactMatch = q.match(
        /(?:for|at|around|approx)\s*(?:(?:rs|inr|\$|€|£|₹)\.?\s*)?(\d+(?:,\d+)*(?:\.\d+)?k?)/i
    );
    if (exactMatch) {
        const amount = parsePriceAmount(exactMatch[1]);
        if (amount !== null && amount > 0) {
            return formatPriceCurrency(curr, amount);
        }
    }

    // 5. Budget / affordable keywords
    if (/\b(budget|affordable|cheap|low price|low cost|economy)\b/i.test(q)) {
        return "Budget";
    }

    return "";
};

/*
|--------------------------------------------------------------------------
| Extract category
|--------------------------------------------------------------------------
*/

const extractCategory = (query) => {
    const normalizedQuery = normalizeText(query);

    for (const [category, keywords] of Object.entries(
        CATEGORY_KEYWORDS
    )) {
        const found = keywords.some((keyword) =>
            normalizedQuery.includes(keyword)
        );

        if (found) {
            return category;
        }
    }

    return "";
};

/*
|--------------------------------------------------------------------------
| Extract product type
|--------------------------------------------------------------------------
*/

const extractProductType = (
    query,
    products = []
) => {
    const normalizedQuery = normalizeText(query);

    /*
     * First try known product types.
     */
    const keywordMatch = PRODUCT_TYPE_KEYWORDS
        .filter((keyword) =>
            normalizedQuery.includes(keyword)
        )
        .sort(
            (a, b) =>
                b.length - a.length
        )[0];

    if (keywordMatch) {
        return keywordMatch;
    }

    /*
     * Then try real Shopify product titles.
     */
    const queryWords = getWords(query);

    let bestProductType = "";
    let bestScore = 0;

    for (const product of products) {
        const title = normalizeText(
            product.title || ""
        );

        if (!title) {
            continue;
        }

        const titleWords = getWords(title);

        const matchedWords =
            queryWords.filter((word) =>
                titleWords.includes(word)
            );

        const score =
            matchedWords.length /
            Math.max(queryWords.length, 1);

        if (score > bestScore) {
            bestScore = score;

            if (
                matchedWords.length >= 2
            ) {
                bestProductType =
                    matchedWords.join(" ");
            }
        }
    }

    return bestProductType;
};

/*
|--------------------------------------------------------------------------
| Extract brand from real Shopify catalog
|--------------------------------------------------------------------------
*/

const KNOWN_BRANDS = [
    "apple",
    "nike",
    "adidas",
    "samsung",
    "vivo",
    "sony",
    "lava",
    "tcl",
    "poko",
    "poco",
    "oppo",
    "xiaomi",
    "oneplus",
    "google",
    "dell",
    "hp",
    "lenovo",
    "asus",
    "boat",
    "noise",
    "puma",
    "reebok",
];

const extractBrand = (
    query,
    products = []
) => {
    const normalizedQuery = normalizeText(query);

    // Special case for iPhone / iPad / MacBook -> Apple
    if (
        normalizedQuery.includes("iphone") ||
        normalizedQuery.includes("ipad") ||
        normalizedQuery.includes("macbook") ||
        normalizedQuery.includes("apple")
    ) {
        return "Apple";
    }

    const brandCounts = {};

    for (const product of products) {
        const vendor = normalizeText(
            product.vendor || ""
        );

        if (vendor) {
            brandCounts[vendor] =
                (brandCounts[vendor] || 0) + 1;
        }
    }

    const brands = [
        ...Object.keys(brandCounts),
        ...KNOWN_BRANDS,
    ].sort((a, b) => b.length - a.length);

    const foundBrand = brands.find(
        (brand) =>
            normalizedQuery === brand ||
            normalizedQuery.includes(` ${brand} `) ||
            normalizedQuery.startsWith(`${brand} `) ||
            normalizedQuery.endsWith(` ${brand}`)
    );

    if (foundBrand) {
        return foundBrand.charAt(0).toUpperCase() + foundBrand.slice(1);
    }

    return "";
};

/*
|--------------------------------------------------------------------------
| Extract other requirements
|--------------------------------------------------------------------------
*/

const extractOtherRequirements = (
    query
) => {
    const normalizedQuery =
        normalizeText(query);

    const requirements = [];

    const requirementKeywords = [
        "noise cancelling",
        "cancelling",
        "5g",
        "4g",
        "pro",
        "max",
        "plus",
        "curve",
        "smart",
        "fitness",
        "tracker",
        "waterproof",
        "wireless",
        "lightweight",
        "heavy duty",
        "premium",
        "budget",
        "cheap",
        "discount",
        "sale",
        "new",
        "latest",
        "organic",
        "cotton",
        "leather",
        "formal",
        "casual",
        "sport",
        "sports",
        "gaming",
        "rechargeable",
        "portable",
        "foldable",
    ];

    for (const keyword of requirementKeywords) {
        if (
            normalizedQuery.includes(keyword)
        ) {
            requirements.push(keyword);
        }
    }

    return requirements;
};

/*
|--------------------------------------------------------------------------
| Calculate Understanding Quality
| Based strictly on attributes actually present in the query and analyzed.
| Missing attributes do NOT reduce quality.
|--------------------------------------------------------------------------
*/

const calculateUnderstandingQuality = ({
    productType,
    brand,
    color,
    size,
    price,
    category,
    otherRequirements,
}) => {
    const attributeScores = [];
    const attributeConfidences = {};

    if (productType) {
        // Product type keyword/catalog match confidence
        attributeScores.push(0.95);
        attributeConfidences.productType = 0.95;
    }

    if (brand) {
        // Known brand or catalog vendor match confidence
        attributeScores.push(0.95);
        attributeConfidences.brand = 0.95;
    }

    if (color) {
        // Color match confidence
        attributeScores.push(0.95);
        attributeConfidences.color = 0.95;
    }

    if (size) {
        // Size pattern match confidence
        attributeScores.push(0.95);
        attributeConfidences.size = 0.95;
    }

    if (price) {
        // Price intent match confidence
        attributeScores.push(0.95);
        attributeConfidences.price = 0.95;
    }

    if (category) {
        // Category taxonomy match confidence
        attributeScores.push(0.90);
        attributeConfidences.category = 0.90;
    }

    if (Array.isArray(otherRequirements) && otherRequirements.length > 0) {
        attributeScores.push(0.88 * otherRequirements.length);
        attributeConfidences.otherRequirements = 0.88;
    }

    // If no attributes were present or analyzed in the query, quality is 0% (Low · 0%)
    if (attributeScores.length === 0) {
        return {
            qualityScore: 0,
            qualityLevel: "Low",
            attributeConfidences,
        };
    }

    const average =
        attributeScores.reduce((sum, score) => sum + score, 0) / attributeScores.length;
    const qualityScore = Math.round(average * 100);
    const qualityLevel = getUnderstandingQualityLevel(qualityScore);

    return {
        qualityScore,
        qualityLevel,
        attributeConfidences,
    };
};

const getUnderstandingQualityLevel = (score) => {
    if (score === null || score === undefined || Number.isNaN(Number(score))) {
        return null;
    }
    const num = Math.round(Number(score));
    if (num < 0) return null;
    if (num >= 90) return "High";
    if (num >= 70) return "Medium";
    return "Low";
};

const calculateIntentConfidence = (params) => {
    const { qualityScore } = calculateUnderstandingQuality(params);
    return qualityScore;
};

export { calculateIntentConfidence };

/*
|--------------------------------------------------------------------------
| Get real Shopify products
|--------------------------------------------------------------------------
*/

const getShopProducts = async (shop, accessToken) =>
    fetchAllStoreProducts(shop, accessToken);

/*
|--------------------------------------------------------------------------
| Analyze search query
|--------------------------------------------------------------------------
*/

const analyzeSearchQuery = async ({
    shop,
    searchQuery,
    accessToken,
}) => {
    const normalizedQuery =
        normalizeText(searchQuery);

    const products =
        await getShopProducts(shop, accessToken);

    const productType =
        extractProductType(
            normalizedQuery,
            products
        );

    const brand = extractBrand(
        normalizedQuery,
        products
    );

    const color =
        extractColor(normalizedQuery);

    const size =
        extractSize(normalizedQuery);

    const price =
        extractPrice(searchQuery || normalizedQuery);

    const category =
        extractCategory(normalizedQuery);

    const otherRequirements =
        extractOtherRequirements(
            normalizedQuery
        );

    const { qualityScore, attributeConfidences } =
        calculateUnderstandingQuality({
            productType,
            brand,
            color,
            size,
            price,
            category,
            otherRequirements,
        });

    const structuredIntent = {
        query: normalizedQuery,

        intent: "product_search",

        attributes: {
            productType,
            brand,
            color,
            size,
            price,
            category,
            otherRequirements,
        },

        attributeConfidences,

        confidence: qualityScore,
    };

    return {
        searchQuery: normalizedQuery,

        intent: "product_search",

        productType,
        brand,
        color,
        size,
        price,
        category,

        otherRequirements,

        intentConfidence: qualityScore,

        attributeConfidences,

        structuredIntent,
    };
};

/*
|--------------------------------------------------------------------------
| Save / update search intent
|--------------------------------------------------------------------------
*/

const saveSearchIntent = async ({
    shop,
    searchQuery,
    accessToken,
}) => {
    const analysis =
        await analyzeSearchQuery({
            shop,
            searchQuery,
            accessToken,
        });

    let record =
        await SearchIntent.findOne({
            shop,
            searchQuery:
                analysis.searchQuery,
        });

    if (!record) {
        record = await SearchIntent.create({
            shop,

            searchQuery:
                analysis.searchQuery,

            searchCount: 1,

            intent:
                analysis.intent,

            productType:
                analysis.productType,

            brand:
                analysis.brand,

            color:
                analysis.color,

            size:
                analysis.size,

            price:
                analysis.price || "",

            category:
                analysis.category,

            otherRequirements:
                analysis.otherRequirements,

            intentConfidence:
                analysis.intentConfidence,

            structuredIntent:
                analysis.structuredIntent,

            lastSearchedAt:
                new Date(),
        });
    } else {
        record.searchCount += 1;

        record.intent =
            analysis.intent;

        record.productType =
            analysis.productType;

        record.brand =
            analysis.brand;

        record.color =
            analysis.color;

        record.size =
            analysis.size;

        record.price =
            analysis.price || "";

        record.category =
            analysis.category;

        record.otherRequirements =
            analysis.otherRequirements;

        record.intentConfidence =
            analysis.intentConfidence;

        record.structuredIntent =
            analysis.structuredIntent;

        record.lastSearchedAt =
            new Date();

        await record.save();
    }

    return record;
};

/*
|--------------------------------------------------------------------------
| Sync from real SearchEvent records
|--------------------------------------------------------------------------
*/

const activeSyncPromises = new Map();
const lastSyncTimes = new Map();

const syncFromSearchEvents = async (shop) => {
    if (!shop) return;
    if (activeSyncPromises.has(shop)) {
        return activeSyncPromises.get(shop);
    }
    const now = Date.now();
    const lastSync = lastSyncTimes.get(shop) || 0;
    if (now - lastSync < 1500) {
        return;
    }

    const syncPromise = (async () => {
        try {
            const events = await SearchEvent.find({
                shop,
                query: { $exists: true, $ne: "" },
            }).lean();

            if (!events || events.length === 0) return;

            const queryGroups = {};
            for (const ev of events) {
                const raw = ev.query || "";
                const normalized = normalizeText(raw);
                if (!normalized || normalized.length < 2) continue;

                if (!queryGroups[normalized]) {
                    queryGroups[normalized] = {
                        query: normalized,
                        count: 0,
                        lastDate: new Date(0),
                    };
                }
                queryGroups[normalized].count += 1;
                const evDate = new Date(ev.createdAt || ev.occurredAt || Date.now());
                if (evDate > queryGroups[normalized].lastDate) {
                    queryGroups[normalized].lastDate = evDate;
                }
            }

            const products = await getShopProducts(shop);

            const updateOps = Object.values(queryGroups).map((group) => {
                const productType = extractProductType(group.query, products);
                const brand = extractBrand(group.query, products);
                const color = extractColor(group.query);
                const size = extractSize(group.query);
                const price = extractPrice(group.query);
                const category = extractCategory(group.query);
                const otherRequirements = extractOtherRequirements(group.query);
                const { qualityScore, attributeConfidences } =
                    calculateUnderstandingQuality({
                        productType,
                        brand,
                        color,
                        size,
                        price,
                        category,
                        otherRequirements,
                    });

                const structuredIntent = {
                    query: group.query,
                    intent: "product_search",
                    attributes: {
                        productType,
                        brand,
                        color,
                        size,
                        price,
                        category,
                        otherRequirements,
                    },
                    attributeConfidences,
                    confidence: qualityScore,
                };

                return {
                    updateOne: {
                        filter: { shop, searchQuery: group.query },
                        update: {
                            $set: {
                                searchCount: group.count,
                                intent: "product_search",
                                productType,
                                brand,
                                color,
                                size,
                                price: price || "",
                                category,
                                otherRequirements,
                                intentConfidence: qualityScore,
                                structuredIntent,
                                lastSearchedAt: group.lastDate.getTime() > 0 ? group.lastDate : new Date(),
                            },
                            $setOnInsert: {
                                shop,
                                searchQuery: group.query,
                            },
                        },
                        upsert: true,
                    },
                };
            });

            if (updateOps.length > 0) {
                await SearchIntent.bulkWrite(updateOps, { ordered: false });
            }
            lastSyncTimes.set(shop, Date.now());
        } catch (err) {
            console.error("[SearchIntentService] Error syncing from search events:", err);
        } finally {
            activeSyncPromises.delete(shop);
        }
    })();

    activeSyncPromises.set(shop, syncPromise);
    return syncPromise;
};

/*
|--------------------------------------------------------------------------
| Get overview
|--------------------------------------------------------------------------
*/

const getOverview = async (
    shop
) => {
    await syncFromSearchEvents(shop);

    const records =
        await SearchIntent.find({
            shop,
        }).lean();

    const totalUniqueQueries =
        records.length;

    const totalSearches =
        records.reduce(
            (total, item) =>
                total +
                (item.searchCount || 0),
            0
        );

    const averageConfidence =
        records.length
            ? Math.round(
                records.reduce(
                    (total, item) =>
                        total +
                        (item.intentConfidence ||
                            0),
                    0
                ) / records.length
            )
            : 0;

    const productTypeCount =
        records.filter(
            (item) => Boolean(item.productType)
        ).length;

    const brandCount =
        records.filter(
            (item) => Boolean(item.brand)
        ).length;

    const colorCount =
        records.filter(
            (item) => Boolean(item.color)
        ).length;

    const sizeCount =
        records.filter(
            (item) => Boolean(item.size)
        ).length;

    const categoryCount =
        records.filter(
            (item) => Boolean(item.category)
        ).length;

    const queriesWithStructuredIntent = records.filter(
        (item) =>
            item.productType ||
            item.brand ||
            item.color ||
            item.size ||
            item.category ||
            (item.otherRequirements && item.otherRequirements.length > 0)
    ).length;

    // Distinct filter options extracted from REAL database records
    const distinctProductTypes = [
        ...new Set(records.map((r) => r.productType).filter(Boolean)),
    ].sort();

    const distinctBrands = [
        ...new Set(records.map((r) => r.brand).filter(Boolean)),
    ].sort();

    const distinctCategories = [
        ...new Set(records.map((r) => r.category).filter(Boolean)),
    ].sort();

    return {
        totalUniqueQueries,
        totalSearches,
        productTypesDetected: productTypeCount,
        brandsDetected: brandCount,
        queriesWithStructuredIntent,
        averageConfidence,

        attributeDetection: {
            productType: productTypeCount,
            brand: brandCount,
            color: colorCount,
            size: sizeCount,
            category: categoryCount,
        },

        filterOptions: {
            productTypes: distinctProductTypes,
            brands: distinctBrands,
            categories: distinctCategories,
        },
    };
};

/*
|--------------------------------------------------------------------------
| Get all search intents
|--------------------------------------------------------------------------
*/

const getSearchIntents = async ({
    shop,
    page = 1,
    limit = 20,
    sort = "recent",
    days = null,
    search = "",
    productType = "",
    brand = "",
    category = "",
    confidence = "",
}) => {
    await syncFromSearchEvents(shop);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const skip = (pageNum - 1) * limitNum;

    const filter = { shop };
    if (days && Number(days) > 0) {
        const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
        filter.lastSearchedAt = { $gte: cutoff };
    }
    if (search && typeof search === "string" && search.trim()) {
        filter.searchQuery = { $regex: escapeRegex(search.trim()), $options: "i" };
    }
    if (productType && productType !== "all") {
        filter.productType = { $regex: `^${escapeRegex(productType)}$`, $options: "i" };
    }
    if (brand && brand !== "all") {
        filter.brand = { $regex: `^${escapeRegex(brand)}$`, $options: "i" };
    }
    if (category && category !== "all") {
        filter.category = { $regex: `^${escapeRegex(category)}$`, $options: "i" };
    }
    if (confidence && confidence !== "all") {
        if (confidence === "high") {
            filter.intentConfidence = { $gte: 90 };
        } else if (confidence === "medium") {
            filter.intentConfidence = { $gte: 70, $lt: 90 };
        } else if (confidence === "low") {
            filter.intentConfidence = { $lt: 70, $gte: 0 };
        }
    }

    let sortOption = {
        lastSearchedAt: -1,
        updatedAt: -1,
        _id: -1,
    };

    if (sort === "frequency") {
        sortOption = {
            searchCount: -1,
            lastSearchedAt: -1,
        };
    } else if (sort === "confidence") {
        sortOption = {
            intentConfidence: -1,
            lastSearchedAt: -1,
        };
    } else if (sort === "recent") {
        sortOption = {
            lastSearchedAt: -1,
            updatedAt: -1,
            _id: -1,
        };
    }

    const [
        data,
        total,
    ] = await Promise.all([
        SearchIntent.find(filter)
            .sort(sortOption)
            .skip(skip)
            .limit(limitNum)
            .lean(),

        SearchIntent.countDocuments(filter),
    ]);

    return {
        data,

        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages:
                Math.ceil(
                    total / limitNum
                ) || 1,
        },
    };
};

/*
|--------------------------------------------------------------------------
| Get one intent
|--------------------------------------------------------------------------
*/

const getSearchIntentDetails = async ({
    shop,
    id,
}) => {
    const record =
        await SearchIntent.findOne({
            _id: id,
            shop,
        }).lean();

    if (!record) {
        throw new Error(
            "Search intent not found"
        );
    }

    return record;
};

/*
|--------------------------------------------------------------------------
| Get structured intent for Smart Product Matching
|--------------------------------------------------------------------------
*/

const getStructuredIntent =
    async ({
        shop,
        searchQuery,
        accessToken,
    }) => {
        return analyzeSearchQuery({
            shop,
            searchQuery,
            accessToken,
        });
    };

/*
|--------------------------------------------------------------------------
| Smart Product Matching: Intent-aware scoring engine
|--------------------------------------------------------------------------
*/

const ACCESSORY_KEYWORDS = [
    "case",
    "cover",
    "protector",
    "screen guard",
    "tempered glass",
    "sleeve",
    "pouch",
    "strap",
    "band",
    "holder",
    "mount",
    "stand",
    "charger",
    "cable",
    "adapter",
    "companion bundle",
    "bundle",
];

const CORE_DEVICE_KEYWORDS = [
    "iphone",
    "phone",
    "smartphone",
    "mobile",
    "laptop",
    "tablet",
    "ipad",
    "macbook",
    "watch",
    "smartwatch",
    "camera",
    "shoe",
    "shoes",
    "sneaker",
    "sneakers",
    "shirt",
    "shirts",
    "tshirt",
    "t-shirt",
    "jeans",
    "pant",
    "pants",
];

/**
 * Parse a price string into numeric constraints:
 * - max: { type: 'max', max: 50000 }
 * - min: { type: 'min', min: 80000 }
 * - range: { type: 'range', min: 50000, max: 70000 }
 * - exact: { type: 'exact', target: 5000, min: 4250, max: 5750 }
 * - budget: { type: 'budget' }
 */
const parsePriceConstraintDetails = (priceStr) => {
    if (!priceStr || typeof priceStr !== "string") return null;
    const clean = priceStr.trim().toLowerCase();
    if (!clean || clean === "—" || clean === "-") return null;

    if (clean === "budget" || clean.includes("budget") || clean.includes("affordable")) {
        return { type: "budget" };
    }

    // Range: "₹50,000–₹70,000" or "50000 to 70000" or "between 50000 and 70000"
    if (clean.includes("–") || clean.includes("-") || clean.includes("between") || clean.includes(" to ")) {
        const matches = clean.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
        if (matches && matches.length >= 2) {
            const min = parseFloat(matches[0]);
            const max = parseFloat(matches[1]);
            if (!Number.isNaN(min) && !Number.isNaN(max) && min < max) {
                return { type: "range", min, max };
            }
        }
    }

    // Max: "Max ₹50,000", "under 50000", "below 2000", "less than 500"
    if (
        clean.includes("max") ||
        clean.includes("under") ||
        clean.includes("below") ||
        clean.includes("less") ||
        clean.includes("upto") ||
        clean.includes("within")
    ) {
        const match = clean.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
        if (match) {
            const max = parseFloat(match[0]);
            if (!Number.isNaN(max)) return { type: "max", max };
        }
    }

    // Min: "Min ₹80,000", "above 80000", "over 80000", "more than 5000"
    if (
        clean.includes("min") ||
        clean.includes("above") ||
        clean.includes("over") ||
        clean.includes("more") ||
        clean.includes("at least")
    ) {
        const match = clean.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
        if (match) {
            const min = parseFloat(match[0]);
            if (!Number.isNaN(min)) return { type: "min", min };
        }
    }

    // Exact / single value
    const match = clean.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    if (match) {
        const target = parseFloat(match[0]);
        if (!Number.isNaN(target) && target > 0) {
            return {
                type: "exact",
                target,
                min: target * 0.85,
                max: target * 1.15,
            };
        }
    }

    return null;
};

const findMatchingProducts = async ({
    shop,
    accessToken,
    searchQuery,
    structuredIntent,
    attributes,
}) => {
    let attrs = attributes || structuredIntent?.attributes;
    if (!attrs || (!attrs.productType && !attrs.brand && !attrs.price && !attrs.color && !attrs.category)) {
        const analyzed = await analyzeSearchQuery({ shop, searchQuery, accessToken });
        attrs = { ...(attrs || {}), ...(analyzed.structuredIntent?.attributes || {}) };
    }

    const {
        productType = "",
        brand = "",
        color = "",
        size = "",
        price = "",
        category = "",
        otherRequirements = [],
    } = attrs || {};

    const normalizedQuery = normalizeText(searchQuery || "");
    const queryWords = getWords(normalizedQuery).filter(
        (w) => !["under", "below", "above", "over", "between", "from", "and", "the", "for", "with", "size"].includes(w)
    );

    // If query has no recognized shopping attributes and contains random non-words or zero query words
    const hasAnyIntentAttrs = Boolean(
        productType || brand || color || size || price || category || (Array.isArray(otherRequirements) && otherRequirements.length > 0)
    );

    // Check if query explicitly asks for an accessory
    const isAccessoryQuery = ACCESSORY_KEYWORDS.some((kw) =>
        new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(normalizedQuery)
    );

    // Check if user is searching for a core device / main product
    const isCoreDeviceIntent = CORE_DEVICE_KEYWORDS.some((kw) =>
        new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(
            `${productType} ${normalizedQuery}`
        )
    );

    // Parse price constraint if present
    const priceConstraint = parsePriceConstraintDetails(price);

    const catalog = await fetchAllStoreProducts(shop, accessToken);

    // Also get interaction counts from tbl_search_query_products for enrichment
    const statsLookup = new Map();
    try {
        const sqStats = await mongoose.connection
            .collection("tbl_search_query_products")
            .find({ shop })
            .toArray();
        for (const s of sqStats) {
            const cleanId = (s.productId || "").replace("gid://shopify/Product/", "");
            if (cleanId) statsLookup.set(cleanId, s);
        }
    } catch (error) {
        console.warn("Unable to load search query stats for enrichment:", error.message);
    }

    // If no attributes were detected (random/gibberish query e.g. "dtghfg"), verify if title matches any product
    if (!hasAnyIntentAttrs) {
        const matchedByKeyword = catalog.filter((p) => {
            const pTitle = normalizeText(p.title || "");
            return queryWords.length > 0 && queryWords.some((w) => pTitle.includes(w));
        });

        if (matchedByKeyword.length === 0) {
            return {
                searchQuery,
                structuredIntent: { attributes: attrs },
                matchedCount: 0,
                products: [],
                matchedAttributesList: [],
            };
        }
    }

    const scoredProducts = [];
    const matchedAttrSet = new Set();

    for (const p of catalog) {
        const pTitle = normalizeText(p.title || "");
        const pVendor = normalizeText(p.vendor || "");
        const pType = normalizeText(p.productType || "");
        const pTags = Array.isArray(p.tags) ? p.tags.map(normalizeText) : [];
        const pDescription = normalizeText(p.description || "");

        // Variant prices
        const variantPrices = (p.variants || [])
            .map((v) => Number(v.price))
            .filter((pr) => !Number.isNaN(pr) && pr >= 0);
        const minVariantPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : null;
        const maxVariantPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : null;
        const primaryPrice = variantPrices.length > 0 ? variantPrices[0] : null;

        // Check if product is an accessory/case
        const isProductAccessory = ACCESSORY_KEYWORDS.some((kw) =>
            new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(pTitle)
        );

        // HARD FILTER 1: If user wants a core device and didn't ask for accessories, exclude accessories
        if (isCoreDeviceIntent && !isAccessoryQuery && isProductAccessory) {
            continue; // Not a valid primary match (e.g. case when user searched for iPhone)
        }

        // HARD FILTER 2: Price constraints
        let priceSatisfied = true;
        let priceMatchReason = "";
        if (priceConstraint && minVariantPrice !== null) {
            if (priceConstraint.type === "max") {
                if (minVariantPrice > priceConstraint.max * 1.01) {
                    priceSatisfied = false;
                } else {
                    priceMatchReason = `₹${minVariantPrice.toLocaleString("en-IN")} ≤ ₹${priceConstraint.max.toLocaleString("en-IN")}`;
                }
            } else if (priceConstraint.type === "min") {
                if (maxVariantPrice < priceConstraint.min * 0.99) {
                    priceSatisfied = false;
                } else {
                    priceMatchReason = `₹${maxVariantPrice.toLocaleString("en-IN")} ≥ ₹${priceConstraint.min.toLocaleString("en-IN")}`;
                }
            } else if (priceConstraint.type === "range") {
                const inRange = variantPrices.some(
                    (pr) => pr >= priceConstraint.min * 0.99 && pr <= priceConstraint.max * 1.01
                );
                if (!inRange) {
                    priceSatisfied = false;
                } else {
                    priceMatchReason = `₹${priceConstraint.min.toLocaleString("en-IN")}–₹${priceConstraint.max.toLocaleString("en-IN")}`;
                }
            }
        }

        if (!priceSatisfied) {
            continue; // Price filter violated
        }

        // HARD FILTER 3: Brand constraint (if intent detected a brand)
        let brandMatch = false;
        if (brand) {
            const b = brand.toLowerCase();
            if (b === "apple") {
                // Apple brand match includes "Apple" in vendor/title OR specific Apple models like iPhone/iPad/MacBook
                brandMatch =
                    pVendor.includes("apple") ||
                    pTitle.includes("apple") ||
                    pTitle.includes("iphone") ||
                    pTitle.includes("ipad") ||
                    pTitle.includes("macbook");
            } else {
                brandMatch = pVendor.includes(b) || pTitle.includes(b);
            }

            // Exclude competing brands if intent brand is specific
            if (!brandMatch) {
                continue; // Brand mismatch
            }
        }

        // SCORING: Evaluate relevance across dimensions
        let score = 0;
        let maxPossibleScore = 0;
        const reasons = [];
        const productMatchedAttrs = [];

        // 1. Product Type Match (Weight: 35)
        if (productType) {
            maxPossibleScore += 35;
            const pt = productType.toLowerCase();
            const ptWords = getWords(pt).filter((w) => !KNOWN_BRANDS.includes(w));
            const ptMatch =
                pType.includes(pt) ||
                pTitle.includes(pt) ||
                pTags.some((t) => t.includes(pt)) ||
                (ptWords.length > 0 && ptWords.every((w) => pTitle.includes(w)));

            if (ptMatch) {
                score += 35;
                productMatchedAttrs.push("Product Type");
                matchedAttrSet.add("Product Type");
                reasons.push(`Product Type: ${productType.charAt(0).toUpperCase() + productType.slice(1)}`);
            }
        }

        // 2. Brand Match (Weight: 30)
        if (brand) {
            maxPossibleScore += 30;
            if (brandMatch) {
                score += 30;
                productMatchedAttrs.push("Brand");
                matchedAttrSet.add("Brand");
                reasons.push(`Brand: ${brand}`);
            }
        }

        // 3. Price Constraint Match (Weight: 20)
        if (priceConstraint) {
            maxPossibleScore += 20;
            if (priceSatisfied) {
                score += 20;
                productMatchedAttrs.push("Price");
                matchedAttrSet.add("Price");
                reasons.push(priceMatchReason ? `Price: ${priceMatchReason}` : `Price: within target`);
            }
        }

        // 4. Color Match (Weight: 15)
        if (color) {
            maxPossibleScore += 15;
            const c = color.toLowerCase();
            const colorMatch =
                new RegExp(`\\b${escapeRegex(c)}\\b`, "i").test(pTitle) ||
                new RegExp(`\\b${escapeRegex(c)}\\b`, "i").test(pDescription) ||
                pTags.some((t) => t.includes(c)) ||
                (p.variants || []).some((v) =>
                    new RegExp(`\\b${escapeRegex(c)}\\b`, "i").test(v.title || "")
                );

            if (colorMatch) {
                score += 15;
                productMatchedAttrs.push("Color");
                matchedAttrSet.add("Color");
                reasons.push(`Color: ${color.charAt(0).toUpperCase() + color.slice(1)}`);
            }
        }

        // 5. Size Match (Weight: 10)
        if (size) {
            maxPossibleScore += 10;
            const s = size.toLowerCase();
            const sizeMatch = (p.variants || []).some(
                (v) =>
                    (v.title && v.title.toLowerCase().includes(s)) ||
                    (Array.isArray(v.selectedOptions) &&
                        v.selectedOptions.some((opt) => opt.value && opt.value.toLowerCase() === s))
            );

            if (sizeMatch) {
                score += 10;
                productMatchedAttrs.push("Size");
                matchedAttrSet.add("Size");
                reasons.push(`Size: ${size}`);
            }
        }

        // 6. Keywords / Title words alignment (Weight: 15)
        if (queryWords.length > 0) {
            maxPossibleScore += 15;
            const matchedWords = queryWords.filter((w) => pTitle.includes(w) || pTags.includes(w));
            if (matchedWords.length > 0) {
                const keywordPoints = Math.round((matchedWords.length / queryWords.length) * 15);
                score += keywordPoints;
            }
        }

        // If no attributes were detected, score purely by title words match
        if (!hasAnyIntentAttrs && queryWords.length > 0) {
            maxPossibleScore = 100;
            const matchedCount = queryWords.filter((w) => pTitle.includes(w)).length;
            score = Math.round((matchedCount / queryWords.length) * 100);
        }

        // Normalize final match score to 0–100%
        const normalizedScore =
            maxPossibleScore > 0
                ? Math.min(100, Math.max(0, Math.round((score / maxPossibleScore) * 100)))
                : 0;

        // Threshold for primary match: must have at least 70% or have matched core constraints
        const isStrongMatch = normalizedScore >= 70;

        if (isStrongMatch) {
            const cleanId = String(p.shopifyProductId || p.id || p._id).replace("gid://shopify/Product/", "");
            const stats = statsLookup.get(cleanId);
            const level = getUnderstandingQualityLevel(normalizedScore) || "High";

            scoredProducts.push({
                id: cleanId,
                title: p.title,
                image: p.images?.[0]?.url || p.images?.[0] || null,
                vendor: p.vendor || brand || "Store Catalog",
                productType: p.productType || productType || "Product",
                price: primaryPrice,
                matchScore: normalizedScore,
                matchLevel: level,
                matchedAttributes: productMatchedAttrs,
                matchReasons: reasons,
                appearanceCount: stats?.appearanceCount || 1,
                clickCount: stats?.clickCount || 0,
                purchaseCount: stats?.purchaseCount || 0,
                adminUrl: `https://${shop}/admin/products/${cleanId}`,
                isPrimaryMatch: true,
            });
        }
    }

    // Sort by match score descending, then by price relevance / purchases
    scoredProducts.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.purchaseCount || 0) - (a.purchaseCount || 0);
    });

    return {
        searchQuery,
        structuredIntent: {
            attributes: attrs,
        },
        matchedCount: scoredProducts.length,
        products: scoredProducts,
        matchedAttributesList: Array.from(matchedAttrSet),
    };
};

export {
    analyzeSearchQuery,
    saveSearchIntent,
    syncFromSearchEvents,
    getOverview,
    getSearchIntents,
    getSearchIntentDetails,
    getStructuredIntent,
    findMatchingProducts,
    getUnderstandingQualityLevel,
    calculateUnderstandingQuality,
};

export default {
    analyzeSearchQuery,
    saveSearchIntent,
    syncFromSearchEvents,
    getOverview,
    getSearchIntents,
    getSearchIntentDetails,
    getStructuredIntent,
    findMatchingProducts,
    getUnderstandingQualityLevel,
    calculateUnderstandingQuality,
};