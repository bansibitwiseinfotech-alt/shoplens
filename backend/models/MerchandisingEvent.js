import mongoose from "mongoose";

const MerchandisingEventSchema = new mongoose.Schema(
    {
        shop: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        eventType: {
            type: String,
            required: true,
            enum: [
                "collection_view",
                "product_click",
                "purchase",
            ],
            index: true,
        },

        collectionId: {
            type: String,
            default: null,
            index: true,
        },

        productId: {
            type: String,
            default: null,
            index: true,
        },

        orderId: {
            type: String,
            default: null,
        },

        sessionId: {
            type: String,
            default: null,
            index: true,
        },

        customerId: {
            type: String,
            default: null,
        },

        quantity: {
            type: Number,
            default: 1,
            min: 1,
        },

        revenue: {
            type: Number,
            default: 0,
            min: 0,
        },

        currency: {
            type: String,
            default: "USD",
        },

        occurredAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        collection: "tbl_merchandising_events",
    }
);

MerchandisingEventSchema.index({
    shop: 1,
    collectionId: 1,
    eventType: 1,
    occurredAt: -1,
});

MerchandisingEventSchema.index({
    shop: 1,
    productId: 1,
    eventType: 1,
    occurredAt: -1,
});

MerchandisingEventSchema.index({
    shop: 1,
    occurredAt: -1,
});

export default mongoose.models.MerchandisingEvent ||
    mongoose.model(
        "MerchandisingEvent",
        MerchandisingEventSchema
    );