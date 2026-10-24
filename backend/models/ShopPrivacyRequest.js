import mongoose from "mongoose";

const shopPrivacyRequestSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, index: true },
    requestId: { type: String, required: true, unique: true },
    customerId: { type: String, default: null, index: true },
    customerEmail: { type: String, default: null, index: true },
    customerData: { type: mongoose.Schema.Types.Mixed, required: true },
    requestedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  {
    collection: "tbl_shop_privacy_requests",
    autoCreate: false,
    autoIndex: false,
  }
);

export default mongoose.models.ShopPrivacyRequest ||
  mongoose.model("ShopPrivacyRequest", shopPrivacyRequestSchema);