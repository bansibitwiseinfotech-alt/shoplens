import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
    },

    shopifyOrderId: {
      type: String,
      required: true,
      index: true,
    },

    orderNumber: String,

    customer: {
      id: String,
      name: String,
      email: String,
    },

    lineItems: [
      {
        productId: String,
        variantId: String,
        title: String,
        sku: String,
        quantity: Number,
        price: Number,
      },
    ],

    currencyCode: String,
    subtotal: Number,
    totalPrice: Number,
    totalTax: Number,
    totalDiscount: Number,
    totalShipping: Number,

    financialStatus: String,
    fulfillmentStatus: String,

    processedAt: Date,
    cancelledAt: Date,
    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,

    lastSyncedAt: Date,
  },
  {
    timestamps: true,
    collection: "tbl_orders",
    autoCreate: false,
    autoIndex: false,
  }
);

OrderSchema.index(
  { shop: 1, shopifyOrderId: 1 },
  { unique: true }
);

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);