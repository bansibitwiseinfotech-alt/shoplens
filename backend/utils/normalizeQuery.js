/**
 * Normalize a shopper search query.
 *
 * Example:
 *
 * "  BLACK   Running Shoes "
 *
 * becomes:
 *
 * "black running shoes"
 */

export function normalizeQuery(query) {
    if (!query || typeof query !== "string") {
        return "";
    }

    return query
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}
