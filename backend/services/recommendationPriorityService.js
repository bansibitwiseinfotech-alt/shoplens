export const clamp = (value, min = 0, max = 100) =>
    Math.min(max, Math.max(min, Number(value) || 0));

/**
 * Deterministic recommendation priority calculator.
 *
 * Evaluates:
 * - Business impact (40%)
 * - Evidence strength (30%)
 * - Actionability (20%)
 * - Effort (10% inverted: lower effort produces higher priority)
 */
export function calculateRecommendationPriority({
    impact = 0,
    evidenceStrength = 0,
    actionability = 0,
    effort = 0,
}) {
    const clampedImpact = clamp(impact);
    const clampedEvidence = clamp(evidenceStrength);
    const clampedAction = clamp(actionability);
    const clampedEffort = clamp(effort);

    const score = Math.round(
        clampedImpact * 0.4 +
        clampedEvidence * 0.3 +
        clampedAction * 0.2 +
        (100 - clampedEffort) * 0.1
    );

    const clampedScore = clamp(score);

    const priority =
        clampedScore >= 70 ? "HIGH" :
            clampedScore >= 40 ? "MEDIUM" :
                "LOW";

    const reason = `Priority ${priority} (${clampedScore}/100) based on business impact (${Math.round(clampedImpact)}/100, 40%), evidence strength (${Math.round(clampedEvidence)}/100, 30%), merchant actionability (${Math.round(clampedAction)}/100, 20%), and execution effort (${Math.round(clampedEffort)}/100, 10%).`;

    return {
        score: clampedScore,
        priority,
        reason,
        breakdown: {
            impact: clampedImpact,
            evidenceStrength: clampedEvidence,
            actionability: clampedAction,
            effort: clampedEffort,
        },
    };
}

/**
 * Confidence calculation calibrated to empirical sample size, recency, and source reliability.
 *
 * Does not report statistical probability unless mathematically calibrated.
 */
export function calculateConfidence({
    sampleSize = 0,
    sourceVerified = false,
    recencyDays = 30,
    dataCompleteness = true,
}) {
    const safeSampleSize = Math.max(0, Number(sampleSize) || 0);

    if (safeSampleSize <= 0) {
        return {
            confidence: 0,
            level: "LOW",
            reason: "Insufficient sample size (0 events recorded).",
        };
    }

    // Sample saturation curve (up to 50 points based on sample count)
    const sampleScore = Math.min(
        50,
        Math.round((safeSampleSize / (safeSampleSize + 15)) * 60)
    );

    // Source verification bonus: +25 points for verified internal ShopLens modules
    const verificationScore = sourceVerified ? 25 : 10;

    // Recency bonus: up to +15 points for recent observations
    let recencyScore = 5;
    if (recencyDays <= 7) recencyScore = 15;
    else if (recencyDays <= 30) recencyScore = 10;

    // Completeness bonus: +10 points if comparison denominators exist
    const completenessScore = dataCompleteness ? 10 : 0;

    const total = clamp(
        sampleScore + verificationScore + recencyScore + completenessScore
    );

    const level =
        total >= 75 ? "HIGH" :
            total >= 45 ? "MEDIUM" :
                "LOW";

    const reason = `Confidence is ${level} (${total}%) based on ${safeSampleSize} verified event(s) observed within ${recencyDays} day(s) from ${sourceVerified ? "verified store analytics" : "unverified data"}.`;

    return {
        confidence: total,
        level,
        reason,
    };         
}