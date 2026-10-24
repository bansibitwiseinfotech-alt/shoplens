import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
    },
    shopifyCustomerId: {
      type: String,
      required: true,
      index: true,
    },
    firstName: String,
    lastName: String,
    displayName: String,
    email: String,
    phone: String,
    numberOfOrders: {
      type: Number,
      default: 0,
    },
    amountSpent: Number,
    currencyCode: String,
    state: String,
    tags: [String],
    note: String,
    verifiedEmail: Boolean,
    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,
    lastSyncedAt: Date,            
  },              
  {
    timestamps: true,
    collection: "tbl_customers",
    autoCreate: false,
    autoIndex: false,
  }
);

CustomerSchema.index(
  { shop: 1, shopifyCustomerId: 1 },   
  { unique: true }
);

export default mongoose.models.Customer ||
  mongoose.model("Customer", CustomerSchema);
