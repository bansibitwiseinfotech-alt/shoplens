import mongoose from "mongoose";

const productDiscoverabilitySchema = new mongoose.Schema(
    {
        shop: {
            type: String,
            required: true,
            index: true,
        },

        productId: {
            type: String,
            required: true,
            index: true,
        },

        productTitle: {
            type: String,
            required: true,
            trim: true,
        },

        searchVisibility: {
            type: Number,
            default: 0,
        },

        views: {
            type: Number,
            default: 0,
        },

        clicks: {
            type: Number,
            default: 0,
        },

        addToCart: {
            type: Number,
            default: 0,
        },

        purchases: {
            type: Number,
            default: 0,
        },

        collectionCount: {
            type: Number,
            default: 0,
        },

        collectionPlacementScore: {
            type: Number,
            default: 0,
        },

        searchVisibilityScore: {
            type: Number,
            default: 0,
        },

        viewsScore: {
            type: Number,
            default: 0,
        },

        clicksScore: {
            type: Number,
            default: 0,
        },

        addToCartScore: {
            type: Number,
            default: 0,
        },

        purchasesScore: {
            type: Number,
            default: 0,
        },

        discoverabilityScore: {
            type: Number,
            default: 0,
            index: true,
        },

        discoverabilityStatus: {
            type: String,
            enum: ["easy", "needs_improvement", "hard_to_find"],
            default: "hard_to_find",
        },

        calculatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: "tbl_product_discoverability",
        autoCreate: false,
        autoIndex: false,
    }
);

productDiscoverabilitySchema.index(
    {
        shop: 1,
        productId: 1,
    },
    {
        unique: true,
    }
);

productDiscoverabilitySchema.index({
    shop: 1,
    discoverabilityScore: 1,
});

const ProductDiscoverability = mongoose.model(
    "ProductDiscoverability",
    productDiscoverabilitySchema
);

export default ProductDiscoverability;