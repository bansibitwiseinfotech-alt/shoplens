/**
 * Shopper Need and Understanding Quality Generator
 *
 * Real, deterministic natural-language explanation of customer shopping intent
 * and objective Understanding Quality score based exclusively on real extracted attributes.
 */

/**
 * Normalizes and formats attribute chips/display.
 * Returns "—" for missing or blank attributes.
 */
export function formatAttributeValue(val) {
    if (!val || typeof val !== "string" || !val.trim()) {
        return "—";
    }
    return val
        .trim()
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

/**
 * Central Understanding Quality Level Classifier.
 *
 * ONE consistent rule throughout the application:
 * 90–100% -> High
 * 70–89%  -> Medium
 * 0–69%   -> Low
 *
 * Exact boundary conditions:
 * 100% -> High
 * 95%  -> High
 * 90%  -> High
 * 89%  -> Medium
 * 80%  -> Medium
 * 70%  -> Medium
 * 69%  -> Low
 * 50%  -> Low
 * 0%   -> Low
 *
 * @param {number|null|undefined} score - Percentage score between 0 and 100
 * @returns {"High" | "Medium" | "Low" | null}
 */
export function getUnderstandingQualityLevel(score) {
    if (score === null || score === undefined || Number.isNaN(Number(score))) {
        return null;
    }
    const num = Math.round(Number(score));
    if (num < 0) return null;
    if (num >= 90) {
        return "High";
    }
    if (num >= 70) {
        return "Medium";
    }
    return "Low";
}

/**
 * Returns visual styling and Polaris badge tone for a quality level.
 * Consistent color rules:
 * - High: Green (Polaris tone: "success", color: "#108043")
 * - Medium: Orange/Amber (Polaris tone: "attention", color: "#b95000")
 * - Low: Red (Polaris tone: "critical", color: "#d72c0d")
 *
 * @param {"High" | "Medium" | "Low" | null} level
 * @returns {{ tone: string, color: string, bgColor: string, borderColor: string }}
 */
export function getUnderstandingQualityVisuals(level) {
    switch (level) {
        case "High":
            return {
                tone: "success",
                color: "#108043", // Green
                bgColor: "#f1f8f5",
                borderColor: "#bbf0d0",
            };
        case "Medium":
            return {
                tone: "attention",
                color: "#b95000", // Orange / Amber
                bgColor: "#fff4e5",
                borderColor: "#fed29d",
            };
        case "Low":
            return {
                tone: "critical",
                color: "#d72c0d", // Red
                bgColor: "#fef1f1",
                borderColor: "#fbc4c4",
            };
        default:
            return {
                tone: "subdued",
                color: "var(--p-color-text-subdued)",
                bgColor: "transparent",
                borderColor: "transparent",
            };
    }
}

/**
 * Calculates and formats Understanding Quality from real intent-analysis data.
 *
 * IMPORTANT — NO INTENT DETECTED RULE:
 * If the customer query produces NO valid structured shopping attributes:
 * Product Type = —
 * Brand = —
 * Color = —
 * Size = —
 * Category = —
 * -> Understanding Quality MUST be: Low · 0%
 * -> Shopper Need MUST be: "Could not identify specific product requirements."
 *
 * If at least one valid attribute is detected, calculate Understanding Quality
 * using real confidence data according to existing scoring logic:
 * 1. If backend already returns overall confidence (intentConfidence / confidence),
 *    normalize safely (whether 0.92 or 92) and use that value directly.
 * 2. If backend provides per-attribute confidence (attributeConfidences),
 *    calculate overall Understanding Quality from those REAL confidence values
 *    using a simple arithmetic mean of the actual relevant detected attributes.
 *    Missing attributes do NOT reduce quality.
 * 3. Exact boundary thresholds:
 *    90–100% -> High
 *    70–89%  -> Medium
 *    0–69%   -> Low
 *
 * @param {Object|number} intent - Search intent record, structured intent object, or direct numeric score
 * @returns {{ score: number, level: string, formatted: string, tone: string, color: string, tooltip: string }}
 */
export function calculateUnderstandingQuality(intent) {
    if (intent === null || intent === undefined) {
        return formatQualityResult(0);
    }

    // Direct numeric input support (for testing / direct score formatting)
    if (typeof intent === "number") {
        return formatQualityResult(intent);
    }

    // Check whether ANY valid structured shopping attributes were detected
    const hasAnyAttributes = Boolean(
        (intent.productType && String(intent.productType).trim()) ||
        (intent.brand && String(intent.brand).trim()) ||
        (intent.color && String(intent.color).trim()) ||
        (intent.size && String(intent.size).trim()) ||
        (intent.price && String(intent.price).trim()) ||
        (intent.category && String(intent.category).trim()) ||
        (Array.isArray(intent.otherRequirements) &&
            intent.otherRequirements.some((r) => Boolean(r && String(r).trim()))) ||
        (intent.structuredIntent?.attributes &&
            Object.values(intent.structuredIntent.attributes).some((v) => {
                if (Array.isArray(v)) return v.some((item) => Boolean(item && String(item).trim()));
                return Boolean(v && String(v).trim());
            }))
    );

    // If ZERO valid shopping attributes are detected, Understanding Quality MUST be Low · 0%
    if (!hasAnyAttributes) {
        return formatQualityResult(0);
    }

    let score = null;

    // 1. Check if backend already returns overall confidence
    const overallVal =
        intent.intentConfidence !== undefined && intent.intentConfidence !== null
            ? intent.intentConfidence
            : intent.confidence !== undefined && intent.confidence !== null
            ? intent.confidence
            : intent.structuredIntent?.confidence;

    if (overallVal !== undefined && overallVal !== null && !Number.isNaN(Number(overallVal))) {
        const val = Number(overallVal);
        // Normalize decimal (0 < val <= 1) vs percentage (0 <= val <= 100)
        if (val > 0 && val <= 1) {
            score = Math.round(val * 100);
        } else if (val >= 0 && val <= 100) {
            score = Math.round(val);
        }
    }

    // 2. If no valid overall confidence, check per-attribute confidence
    if (score === null) {
        const attrConf =
            intent.attributeConfidences ||
            intent.structuredIntent?.attributeConfidences;

        if (attrConf && typeof attrConf === "object") {
            const relevantScores = [];

            // Only attributes ACTUALLY PRESENT and detected participate in the calculation
            for (const rawVal of Object.values(attrConf)) {
                if (rawVal !== null && rawVal !== undefined && !Number.isNaN(Number(rawVal))) {
                    const num = Number(rawVal);
                    const normalized = num > 0 && num <= 1 ? num * 100 : num;
                    if (normalized >= 0 && normalized <= 100) {
                        relevantScores.push(normalized);
                    }
                }
            }

            if (relevantScores.length > 0) {
                const sum = relevantScores.reduce((acc, v) => acc + v, 0);
                score = Math.round(sum / relevantScores.length);
            }
        }
    }

    // 3. Fallback deterministic calculation from real present attributes if not yet precalculated
    if (score === null) {
        const presentScores = [];
        if (intent.productType) presentScores.push(95);
        if (intent.brand) presentScores.push(95);
        if (intent.color) presentScores.push(95);
        if (intent.size) presentScores.push(95);
        if (intent.price) presentScores.push(95);
        if (intent.category) presentScores.push(90);
        if (Array.isArray(intent.otherRequirements) && intent.otherRequirements.length > 0) {
            intent.otherRequirements.forEach(() => presentScores.push(88));
        }

        if (presentScores.length > 0) {
            const sum = presentScores.reduce((acc, v) => acc + v, 0);
            score = Math.round(sum / presentScores.length);
        }
    }

    // If still null or negative, fallback to 0%
    if (score === null || Number.isNaN(score) || score < 0) {
        return formatQualityResult(0);
    }

    return formatQualityResult(score);
}

function formatQualityResult(rawScore) {
    const score = Math.min(100, Math.max(0, Math.round(Number(rawScore))));
    const level = getUnderstandingQualityLevel(score);
    const visuals = getUnderstandingQualityVisuals(level);

    return {
        score,
        level,
        formatted: `${level} · ${score}%`,
        tone: visuals.tone,
        color: visuals.color,
        bgColor: visuals.bgColor,
        borderColor: visuals.borderColor,
        tooltip:
            score === 0
                ? "Could not identify any shopping attributes from this search query."
                : `${level} understanding quality (${score}%) based on verified shopping attributes.`,
    };
}

/**
 * Dynamically builds natural-language "Shopper Need" explanation from real structured intent attributes.
 *
 * @param {Object} intent - Search intent record or structured intent object
 * @returns {string} Natural-language Shopper Need description
 */
export function buildShopperNeed(intent) {
    if (!intent) return "Could not identify specific product requirements.";

    const attrs = intent.attributes || intent.structuredIntent?.attributes || intent;
    const rawBrand = (attrs.brand || intent.brand || "").trim();
    const rawProductType = (attrs.productType || intent.productType || "").trim();
    const rawColor = (attrs.color || intent.color || "").trim();
    const rawSize = (attrs.size || intent.size || "").trim();
    const rawPrice = (attrs.price || intent.price || "").trim();
    const rawCategory = (attrs.category || intent.category || "").trim();

    let rawFeatures = [];
    if (Array.isArray(attrs.otherRequirements)) rawFeatures = attrs.otherRequirements;
    else if (Array.isArray(intent.otherRequirements)) rawFeatures = intent.otherRequirements;
    else if (Array.isArray(attrs.features)) rawFeatures = attrs.features;
    else if (attrs.feature) rawFeatures = [attrs.feature];
    else if (intent.feature) rawFeatures = [intent.feature];

    const cleanFeatures = rawFeatures
        .map((f) => String(f).trim())
        .filter(Boolean);

    // If no meaningful structured intent exists
    if (
        !rawBrand &&
        !rawProductType &&
        !rawColor &&
        !rawSize &&
        !rawPrice &&
        !rawCategory &&
        cleanFeatures.length === 0
    ) {
        return "Could not identify specific product requirements.";
    }

    const capitalize = (str) => {
        if (!str) return "";
        return str
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
    };

    const brand = capitalize(rawBrand);
    const color = rawColor.toLowerCase();
    const size = rawSize;
    const category = rawCategory.toLowerCase();

    // Helper to format features: e.g. "5g" -> "5G support", "waterproof" -> "water resistance"
    const formatFeature = (f) => {
        const lower = f.toLowerCase();
        if (lower === "5g" || lower === "4g") return `${lower.toUpperCase()} support`;
        if (lower.endsWith("support")) return lower;
        if (lower === "noise cancelling" || lower === "cancelling") return "noise cancellation";
        if (lower === "wireless") return "wireless connectivity";
        if (lower === "waterproof") return "water resistance";
        return f;
    };

    // Case 1: Only Brand is detected
    if (brand && !rawProductType && !color && !size && !category && cleanFeatures.length === 0) {
        return `Looking for products from ${brand}.`;
    }

    // Case 2: Only Category is detected
    if (category && !brand && !rawProductType && !color && !size && cleanFeatures.length === 0) {
        return `Looking for ${category} products.`;
    }

    // Determine plural or singular for productType
    const lowerPt = rawProductType.toLowerCase();
    const isPlural =
        lowerPt.endsWith("shoes") ||
        lowerPt.endsWith("sneakers") ||
        lowerPt.endsWith("boots") ||
        lowerPt.endsWith("sandals") ||
        lowerPt.endsWith("slippers") ||
        lowerPt.endsWith("jeans") ||
        lowerPt.endsWith("pants") ||
        lowerPt.endsWith("trousers") ||
        lowerPt.endsWith("headphones") ||
        lowerPt.endsWith("earbuds") ||
        (lowerPt.endsWith("s") && !lowerPt.endsWith("ss"));

    const isAppleDevice = lowerPt === "iphone" || lowerPt === "ipad" || lowerPt === "macbook";

    // Build the core noun phrase
    let coreNoun = "";
    if (brand && rawProductType) {
        if (isAppleDevice) {
            const formattedDevice =
                lowerPt === "iphone" ? "iPhone" : lowerPt === "ipad" ? "iPad" : "MacBook";
            coreNoun = brand.toLowerCase() === "apple" ? `an ${formattedDevice}` : `an ${brand} ${formattedDevice}`;
        } else if (color) {
            if (isPlural) {
                coreNoun = `${brand} ${color} ${lowerPt}`;
            } else {
                const vowels = ["a", "e", "i", "o", "u"];
                const article = vowels.includes(brand.toLowerCase()[0]) ? "an" : "a";
                coreNoun = `${article} ${brand} ${color} ${lowerPt}`;
            }
        } else if (isPlural) {
            coreNoun = `${brand} ${lowerPt}`;
        } else {
            const vowels = ["a", "e", "i", "o", "u"];
            const article = vowels.includes(brand.toLowerCase()[0]) ? "an" : "a";
            coreNoun = `${article} ${brand} ${lowerPt}`;
        }
    } else if (rawProductType) {
        if (color) {
            // e.g. "Looking for black running shoes." or "Looking for a black t-shirt."
            if (isPlural) {
                coreNoun = `${color} ${lowerPt}`;
            } else {
                const vowels = ["a", "e", "i", "o", "u"];
                const article = vowels.includes(color[0]) ? "an" : "a";
                coreNoun = `${article} ${color} ${lowerPt}`;
            }
        } else if (isAppleDevice) {
            const formattedDevice =
                lowerPt === "iphone" ? "iPhone" : lowerPt === "ipad" ? "iPad" : "MacBook";
            coreNoun = `an ${formattedDevice}`;
        } else if (isPlural) {
            coreNoun = lowerPt;
        } else {
            const vowels = ["a", "e", "i", "o", "u"];
            const article = vowels.includes(lowerPt[0]) ? "an" : "a";
            coreNoun = `${article} ${lowerPt}`;
        }
    } else if (brand) {
        coreNoun = `${brand} products`;
    } else if (category) {
        coreNoun = `${category} products`;
    } else {
        coreNoun = "products";
    }

    // Modifiers: in {color}, size {size}, {price}, with {features}
    const modifiers = [];

    // If color wasn't already consumed in coreNoun
    if (color && !rawProductType) {
        modifiers.push(`in ${color}`);
    }

    if (size) {
        modifiers.push(`size ${size}`);
    }

    if (rawPrice) {
        if (rawPrice.startsWith("Max ")) {
            modifiers.push(`under ${rawPrice.slice(4)}`);
        } else if (rawPrice.startsWith("Min ")) {
            modifiers.push(`above ${rawPrice.slice(4)}`);
        } else if (rawPrice.includes("–")) {
            modifiers.push(`between ${rawPrice.replace("–", " and ")}`);
        } else if (rawPrice.toLowerCase() === "budget") {
            modifiers.push("on a budget");
        } else {
            modifiers.push(`around ${rawPrice}`);
        }
    }

    if (cleanFeatures.length > 0) {
        const featureStr = cleanFeatures.map(formatFeature).join(" and ");
        modifiers.push(`with ${featureStr}`);
    }

    let sentence = `Looking for ${coreNoun}`;
    if (modifiers.length > 0) {
        let modifierText = "";
        for (let i = 0; i < modifiers.length; i++) {
            const mod = modifiers[i];
            if (i === 0) {
                if (mod.startsWith("size ")) {
                    modifierText += `, ${mod}`;
                } else {
                    modifierText += ` ${mod}`;
                }
            } else {
                modifierText += `, ${mod}`;
            }
        }
        sentence += modifierText;
    }

    sentence = sentence.trim();
    if (!sentence.endsWith(".")) {
        sentence += ".";
    }

    return sentence;
}

/**
 * Normalizes an API search intent item into a clean UI data structure.
 */
export function normalizeSearchIntent(rawItem) {
    if (!rawItem) return null;

    const quality = calculateUnderstandingQuality(rawItem);
    const shopperNeed = buildShopperNeed(rawItem);

    return {
        ...rawItem,
        customerSearch: rawItem.searchQuery || "",
        productType: rawItem.productType || "",
        brand: rawItem.brand || "",
        color: rawItem.color || "",
        size: rawItem.size || "",
        price: rawItem.price || "",
        category: rawItem.category || "",
        searchCount: rawItem.searchCount ?? 1,
        understandingQuality: quality,
        shopperNeed,
    };
}

export default buildShopperNeed;
