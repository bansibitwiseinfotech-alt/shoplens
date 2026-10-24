import mongoose from "mongoose";

const trendingSearchSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    query: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedQuery: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    currentSearches: {
      type: Number,
      default: 0,
      min: 0,
    },

    previousSearches: {
      type: Number,
      default: 0,
      min: 0,
    },

    growthPercent: {
      type: Number,
      default: 0,
    },

    trendType: {
      type: String,
      enum: ["Rising", "New", "Seasonal", "Stable"],
      default: "Stable",
    },

    trendScore: {
      type: Number,
      default: 0,
    },

    currentPeriodStart: {
      type: Date,
      required: true,
    },

    currentPeriodEnd: {
      type: Date,
      required: true,
    },

    previousPeriodStart: {
      type: Date,
      required: true,
    },

    previousPeriodEnd: {
      type: Date,
      required: true,
    },

    recommendation: {
      type: String,
      default: "",
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "tbl_trending_searches",
    timestamps: true,
  }
);

trendingSearchSchema.index({
  shop: 1,
  normalizedQuery: 1,
  generatedAt: -1,
});

trendingSearchSchema.index({
  shop: 1,
  trendType: 1,
  growthPercent: -1,
});

export default mongoose.model("TrendingSearch", trendingSearchSchema);