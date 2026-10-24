import mongoose from "mongoose";

const customerDiscoveryEventSchema = new mongoose.Schema(
    {
        shopDomain: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },

        clientId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        sessionId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        eventId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        eventType: {
            type: String,
            required: true,
            enum: [
                "search_submitted",
                "collection_viewed",
                "product_viewed",
                "product_added_to_cart",
                "checkout_started",
                "checkout_completed",
            ],
            index: true,
        },

        occurredAt: {
            type: Date,
            required: true,
            index: true,
        },

        searchQuery: {
            type: String,
            default: null,
            trim: true,
        },

        collectionId: {
            type: String,
            default: null,
            trim: true,
        },

        collectionTitle: {
            type: String,
            default: null,
            trim: true,
        },

        productId: {
            type: String,
            default: null,
            trim: true,
        },

        productTitle: {
            type: String,
            default: null,
            trim: true,
        },

        variantId: {
            type: String,
            default: null,
            trim: true,
        },

        cartToken: {
            type: String,
            default: null,
            trim: true,
        },

        checkoutId: {
            type: String,
            default: null,
            trim: true,
        },

        orderId: {
            type: String,
            default: null,
            trim: true,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        collection: "tbl_customer_discovery_events",
    }
);

customerDiscoveryEventSchema.index({
    shopDomain: 1,
    sessionId: 1,
    occurredAt: 1,
});

customerDiscoveryEventSchema.index({
    shopDomain: 1,
    eventType: 1,
    occurredAt: 1,
});

export default mongoose.models.CustomerDiscoveryEvent ||
    mongoose.model("CustomerDiscoveryEvent", customerDiscoveryEventSchema);