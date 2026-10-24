/**
 * Single, Canonical Opportunity Score Calculation for Zero-Result Searches.
 *
 * STANDARD FORMULA:
 * Opportunity Score =
 *     Search Demand Score
 *   + Active Days Bonus
 *   + Recurring Bonus
 *   + Unique Customer Bonus
 *
 * 1. SEARCH DEMAND SCORE:
 *    10 points per search (searches * 10). Maximum = 60 points.
 *    1 search = 10, 2 searches = 20, 3 searches = 30, 4 = 40, 5 = 50, 6+ = 60.
 *
 * 2. ACTIVE DAYS BONUS:
 *    5 points per active day (activeDays * 5). Maximum = 15 points.
 *    1 active day = 5, 2 active days = 10, 3+ active days = 15.
 *
 * 3. RECURRING BONUS:
 *    One-off = 0, Recurring = 20.
 *
 * 4. UNIQUE CUSTOMER BONUS:
 *    0 or 1 unique customer = 0, 2+ unique customers = 5.
 *
 * 5. FINAL SCORE:
 *    Clamp between 0 and 100: Math.min(100, Math.max(0, rawScore)).
 *
 * @param {Object} params
 * @param {number} [params.searches=0] - Total searches for this query
 * @param {number} [params.activeDays=0] - Number of active days detected
 * @param {boolean} [params.isRecurring=false] - Whether the query is classified as recurring
 * @param {number} [params.uniqueCustomers=0] - Number of unique customers/sessions
 * @returns {{
 *   demandScore: number,
 *   activeDaysBonus: number,
 *   recurrenceBonus: number,
 *   uniqueCustomerBonus: number,
 *   finalScore: number
 * }}
 */
export function calculateOpportunityScore({
    searches = 0,
    activeDays = 0,
    isRecurring = false,
    uniqueCustomers = 0,
} = {}) {
    const safeSearches = Math.max(0, Number(searches) || 0);
    const safeActiveDays = Math.max(0, Number(activeDays) || 0);
    const safeUniqueCustomers = Math.max(0, Number(uniqueCustomers) || 0);
    const safeIsRecurring = Boolean(isRecurring);

    // 1. Search Demand Score: 10 points per search, capped at 60
    const demandScore = Math.min(60, safeSearches * 10);

    // 2. Active Days Bonus: 5 points per active day, capped at 15
    const activeDaysBonus = Math.min(15, safeActiveDays * 5);

    // 3. Recurring Bonus: One-off = 0, Recurring = 20
    const recurrenceBonus = safeIsRecurring ? 20 : 0;

    // 4. Unique Customer Bonus: 0 or 1 = 0, 2+ = 5
    const uniqueCustomerBonus = safeUniqueCustomers >= 2 ? 5 : 0;

    // 5. Final Score: clamped between 0 and 100
    const rawScore = demandScore + activeDaysBonus + recurrenceBonus + uniqueCustomerBonus;
    const finalScore = Math.min(100, Math.max(0, rawScore));

    return {
        demandScore,
        activeDaysBonus,
        recurrenceBonus,
        uniqueCustomerBonus,
        finalScore,
    };
}
