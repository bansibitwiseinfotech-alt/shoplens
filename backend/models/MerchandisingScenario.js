import mongoose from "mongoose";

const scenarioSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    investigationType: {
      type: String,
      enum: [
        "product_engagement",
        "search_discovery",
        "purchase_conversion",
        "collection_gaps",
        "search_demand",
        "discovery_dropoffs",
      ],
      required: true,
      default: "product_engagement",
    },

    scope: {
      type: String,
      enum: ["store_wide", "product"],
      default: "store_wide",
    },

    product: {
      id: { type: String, default: null },
      title: { type: String, default: null },
      imageUrl: { type: String, default: null },
      handle: { type: String, default: null },
    },

    dateRange: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },

    target: {
      metric: {
        type: String,
        enum: ["clickThroughRate", "purchaseConversionRate", "searchClicks", "productViews"],
        required: true,
        default: "clickThroughRate",
      },
      targetRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      assumedPurchaseConversionRate: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },
    },

    baseline: {
      views: { type: Number, min: 0, default: null },
      clicks: { type: Number, min: 0, default: null },
      clickThroughRate: { type: Number, min: 0, default: null },
      searchSubmissions: { type: Number, min: 0, default: null },
      searchClicks: { type: Number, min: 0, default: null },
      addToCart: { type: Number, min: 0, default: null },
      purchases: { type: Number, min: 0, default: null },
      revenue: { type: Number, min: 0, default: null },
      purchaseConversionRate: { type: Number, min: 0, default: null },
      metricsAvailability: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    comparison: {
      targetRate: { type: Number, default: null },
      estimatedTargetClicks: { type: Number, default: null },
      targetValue: { type: Number, default: null },
      absoluteDifference: { type: Number, default: null },
      percentagePointDifference: { type: Number, default: null },
      additionalClicks: { type: Number, default: null },
      hypotheticalAdditionalPurchases: { type: Number, default: null },
      hypotheticalAdditionalRevenue: { type: Number, default: null },
      assumptions: [{ type: String }],
      disclaimer: { type: String, default: "Hypothetical Estimate — Not Guaranteed" },
    },

    formulaVersion: {
      type: String,
      default: "v2_simplified_ctr",
    },

    dataSource: {
      type: String,
      default: "Verified Shopify Store Events (ShopLens Analytics)",
    },

    dataQuality: {
      complete: { type: Boolean, default: false },
      notes: [{ type: String }],
      missingMetrics: [{ type: String }],
      lastUpdatedAt: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
    collection: "tbl_merchandising_scenarios",
  }
);

scenarioSchema.index({ shop: 1, createdAt: -1 });
scenarioSchema.index({ shop: 1, "product.id": 1 });

const MerchandisingScenario =
  mongoose.models.MerchandisingScenario ||
  mongoose.model("MerchandisingScenario", scenarioSchema);

export default MerchandisingScenario;
