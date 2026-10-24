import mongoose from "mongoose";

const searchIntentSchema = new mongoose.Schema(
    {
        shop: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        searchQuery: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },

        searchCount: {
            type: Number,
            default: 1,
            min: 0,
        },

        intent: {
            type: String,
            default: "product_search",
            trim: true,
        },

        productType: {
            type: String,
            default: "",
            trim: true,
        },

        brand: {
            type: String,
            default: "",
            trim: true,
        },

        color: {
            type: String,
            default: "",
            trim: true,
        },

        size: {
            type: String,
            default: "",
            trim: true,
        },

        price: {
            type: String,
            default: "",
            trim: true,
        },

        category: {
            type: String,
            default: "",
            trim: true,
        },

        otherRequirements: {
            type: [String],
            default: [],
        },

        intentConfidence: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        structuredIntent: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        lastSearchedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: "tbl_search_intents",
    }
);

searchIntentSchema.index({
    shop: 1,
    searchQuery: 1,
});

searchIntentSchema.index({
    shop: 1,
    searchCount: -1,
});

searchIntentSchema.index({
    shop: 1,
    productType: 1,
});

searchIntentSchema.index({
    shop: 1,
    brand: 1,
});

searchIntentSchema.index({
    shop: 1,
    category: 1,
});

const SearchIntent = mongoose.model(
    "SearchIntent",
    searchIntentSchema
);

export default SearchIntent;