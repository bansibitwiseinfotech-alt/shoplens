import mongoose from "mongoose";

const missedSalesOpportunitySchema = new mongoose.Schema(
    {
        shop: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },

        opportunityKey: {
            type: String,
            required: true,
            index: true,
        },

        opportunityType: {
            type: String,
            enum: [
                "Zero Result",
                "Low Discoverability",
                "Journey Drop-off",
                "Combined",
            ],
            required: true,
        },

        query: {
            type: String,
            default: "",
            trim: true,
        },

        normalizedQuery: {
            type: String,
            default: "",
            trim: true,
        },

        productId: {
            type: String,
            default: "",
            trim: true,
        },

        productTitle: {
            type: String,
            default: "",
            trim: true,
        },

        searches: {
            type: Number,
            default: 0,
            min: 0,
        },

        zeroResultSearches: {
            type: Number,
            default: 0,
            min: 0,
        },

        potentialProducts: {
            type: Number,
            default: 0,
            min: 0,
        },

        potentialProductIds: {
            type: [String],
            default: [],
        },

        discoverabilityScore: {
            type: Number,
            default: null,
        },

        journeySessions: {
            type: Number,
            default: 0,
            min: 0,
        },

        journeyDropOffRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        impactScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        impactLevel: {
            type: String,
            enum: ["High", "Medium", "Low"],
            default: "Low",
        },

        problem: {
            type: String,
            default: "",
        },

        recommendation: {
            type: String,
            default: "",
        },

        signals: {
            zeroResult: {
                type: Boolean,
                default: false,
            },

            lowDiscoverability: {
                type: Boolean,
                default: false,
            },

            journeyDropOff: {
                type: Boolean,
                default: false,
            },
        },

        periodDays: {
            type: Number,
            required: true,
        },

        periodStart: {
            type: Date,
            required: true,
        },

        periodEnd: {
            type: Date,
            required: true,
        },

        generatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        collection: "tbl_missed_sales_opportunities",
        timestamps: true,
    }
);

missedSalesOpportunitySchema.index({
    shop: 1,
    periodStart: 1,
    periodEnd: 1,
});

missedSalesOpportunitySchema.index({
    shop: 1,
    impactScore: -1,
});

missedSalesOpportunitySchema.index({
    shop: 1,
    opportunityKey: 1,
    periodStart: 1,
});

export default mongoose.model(
    "MissedSalesOpportunity",
    missedSalesOpportunitySchema
);