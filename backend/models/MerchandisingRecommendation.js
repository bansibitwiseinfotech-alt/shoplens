import mongoose from "mongoose";

const evidenceSchema = new mongoose.Schema(
    {
        metric: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed, default: null },
        comparisonValue: { type: mongoose.Schema.Types.Mixed, default: null },
        period: { type: String, default: "" },
        explanation: { type: String, default: "" },
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false }
);

const lifecycleEntrySchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: ["PENDING", "REVIEWED", "IN_PROGRESS", "COMPLETED", "DISMISSED", "ACTION_FAILED"],
            required: true,
        },
        changedAt: { type: Date, default: Date.now },
        reason: { type: String, default: "" },
        note: { type: String, default: "" },
        actor: { type: String, default: "merchant" },
    },
    { _id: false }
);

const affectedProductSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true },
        title: { type: String, default: "" },
        handle: { type: String, default: "" },
        imageUrl: { type: String, default: "" },
    },
    { _id: false }
);

const affectedCollectionSchema = new mongoose.Schema(
    {
        collectionId: { type: String, required: true },
        title: { type: String, default: "" },
        handle: { type: String, default: "" },
    },
    { _id: false }
);

const recommendationSchema = new mongoose.Schema(
    {
        shop: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        fingerprint: {
            type: String,
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: [
                "ZERO_RESULT",
                "LOW_DISCOVERABILITY",
                "LOW_ENGAGEMENT",
                "JOURNEY_DROPOFF",
                "COLLECTION_PERFORMANCE",
                "TRENDING_SEARCH",
                "CROSS_MODULE",
            ],
            required: true,
            index: true,
        },

        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        problemDetected: { type: String, default: "", trim: true },
        whyItMatters: { type: String, default: "", trim: true },
        suggestedAction: { type: String, required: true, trim: true },

        sourceModule: { type: String, required: true, index: true },
        sourceRecordId: { type: String, default: null },
        sourcePath: { type: String, default: "" },

        actionType: { type: String, default: "", index: true },
        actionDestination: { type: String, default: "" },
        targetQuery: { type: String, default: "" },
        proposedChanges: { type: mongoose.Schema.Types.Mixed, default: null },

        executionState: {
            type: String,
            enum: ["NOT_STARTED", "PENDING", "SUCCESS", "FAILED"],
            default: "NOT_STARTED",
        },
        executionOutcome: {
            executedAt: { type: Date, default: null },
            executedBy: { type: String, default: "" },
            summary: { type: String, default: "" },
            details: { type: mongoose.Schema.Types.Mixed, default: null },
            error: { type: String, default: "" },
            note: { type: String, default: "" },
        },

        priority: {
            type: String,
            enum: ["HIGH", "MEDIUM", "LOW"],
            default: "LOW",
            index: true,
        },

        priorityScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
            index: true,
        },

        priorityReason: { type: String, default: "" },

        priorityBreakdown: {
            impact: { type: Number, default: 0, min: 0, max: 100 },
            evidenceStrength: { type: Number, default: 0, min: 0, max: 100 },
            actionability: { type: Number, default: 0, min: 0, max: 100 },
            effort: { type: Number, default: 0, min: 0, max: 100 },
        },

        confidence: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        confidenceLevel: {
            type: String,
            enum: ["HIGH", "MEDIUM", "LOW"],
            default: "LOW",
        },

        confidenceReason: { type: String, default: "" },

        evidence: { type: [evidenceSchema], default: [] },

        affectedProducts: { type: [affectedProductSchema], default: [] },
        affectedCollections: { type: [affectedCollectionSchema], default: [] },

        status: {
            type: String,
            enum: ["PENDING", "REVIEWED", "IN_PROGRESS", "COMPLETED", "DISMISSED", "ACTION_FAILED"],
            default: "PENDING",
            index: true,
        },

        dismissReason: { type: String, default: null },

        reviewedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        dismissedAt: { type: Date, default: null },

        lifecycleHistory: { type: [lifecycleEntrySchema], default: [] },

        lastDetectedAt: { type: Date, default: Date.now },
        lastEvidenceAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        collection: "tbl_merchandising_recommendations",
    }
);

recommendationSchema.index(
    { shop: 1, fingerprint: 1 },
    { unique: true }
);

recommendationSchema.index({
    shop: 1,
    status: 1,
    priorityScore: -1,
    updatedAt: -1,
});

recommendationSchema.index({
    shop: 1,
    type: 1,
    status: 1,
});

recommendationSchema.index({
    shop: 1,
    sourceModule: 1,
});

const MerchandisingRecommendation =
    mongoose.models.MerchandisingRecommendation ||
    mongoose.model(
        "MerchandisingRecommendation",
        recommendationSchema
    );

export default MerchandisingRecommendation;