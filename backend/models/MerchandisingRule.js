import mongoose from "mongoose";

const conditionSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      enum: [
        "inventory",
        "sales",
        "createdAt",
        "price",
        "productType",
        "vendor",
        "tag",
      ],
      required: true,
    },
    operator: {
      type: String,
      enum: ["equals", "not_equals", "greater_than", "less_than", "contains"],
      required: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false }
);

const actionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["boost", "demote", "move_to_top", "move_to_bottom"],
      required: true,
    },
    amount: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
    },
  },
  { _id: false }
);

const merchandisingRuleSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: "",
      maxlength: 500,
    },
    ruleType: {
      type: String,
      enum: [
        "best_seller",
        "new_product",
        "high_margin",
        "out_of_stock",
        "custom",
      ],
      default: "custom",
      required: true,
    },
    collectionIds: {
      type: [String],
      required: true,
      validate: {
        validator: (ids) => Array.isArray(ids) && ids.length > 0,
        message: "Select at least one collection.",
      },
    },
    priority: {
      type: Number,
      min: 1,
      max: 1000,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    configuration: {
      timeWindowDays: {
        type: Number,
        default: 30,
        min: 1,
        max: 365,
      },
      newThresholdDays: {
        type: Number,
        default: 30,
        min: 1,
        max: 365,
      },
      marginMetric: {
        type: String,
        enum: ["amount", "percentage"],
        default: "amount",
      },
      boostAmount: {
        type: Number,
        default: 10,
        min: 1,
        max: 100,
      },
      demoteAmount: {
        type: Number,
        default: 10,
        min: 1,
        max: 100,
      },
    },
    conditions: {
      type: [conditionSchema],
      default: [],
    },
    actions: {
      type: [actionSchema],
      default: [],
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    lastRunStatus: {
      type: String,
      enum: ["success", "failed", "partial", null],
      default: null,
    },
    lastRunMessage: {
      type: String,
      default: "",
    },
    lastRunProductsChanged: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

merchandisingRuleSchema.index({ shop: 1, priority: 1, createdAt: 1 });
merchandisingRuleSchema.index({ shop: 1, isActive: 1 });
merchandisingRuleSchema.index({ shop: 1, collectionIds: 1 });

export default mongoose.models.MerchandisingRule ||
  mongoose.model(
    "MerchandisingRule",
    merchandisingRuleSchema,
    "tbl_merchandising_rules"
  );
