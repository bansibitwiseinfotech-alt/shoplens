import mongoose from "mongoose";
import { BILLING_PLANS, BILLING_INTERVALS } from "../config/billingPlans.js";

const subscriptionSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: [true, "Shop domain is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    plan: {
      type: String,
      required: [true, "Plan identifier is required"],
      enum: ["free", "pro", "premium"],
      default: "free",
      index: true,
    },

    interval: {
      type: String,
      enum: [BILLING_INTERVALS.MONTHLY, BILLING_INTERVALS.YEARLY],
      default: BILLING_INTERVALS.MONTHLY,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "PENDING", "CANCELLED", "DECLINED", "EXPIRED", "FROZEN"],
      default: "ACTIVE",
      index: true,
    },

    shopifySubscriptionId: {
      type: String,
      default: null,
      index: true,
    },

    shopifyConfirmationUrl: {
      type: String,
      default: null,
    },

    test: {
      type: Boolean,
      default: false,
    },

    price: {
      type: Number,
      default: 0,
    },

    currency: {
      type: String,
      default: "USD",
    },

    currentPeriodStart: {
      type: Date,
      default: null,
    },

    currentPeriodEnd: {
      type: Date,
      default: null,
    },

    activatedAt: {
      type: Date,
      default: Date.now,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelReason: {
      type: String,
      default: null,
    },

    lastWebhookEventId: {
      type: String,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "tbl_subscriptions",
  }
);

/**
 * Check if the subscription is currently active.
 */
subscriptionSchema.methods.isActive = function () {
  if (this.plan === "free") {
    return this.status === "ACTIVE";
  }

  if (this.status !== "ACTIVE") {
    return false;
  }

  // If Shopify provided a currentPeriodEnd, ensure it hasn't lapsed past a grace buffer
  if (this.currentPeriodEnd) {
    const gracePeriodMs = 24 * 60 * 60 * 1000; // 24-hour grace window
    return this.currentPeriodEnd.getTime() + gracePeriodMs >= Date.now();
  }

  return true;
};

/**
 * Return sanitized subscription object for safe client/API consumption.
 */
subscriptionSchema.methods.toSafeObject = function () {
  const planConfig = BILLING_PLANS[this.plan] || BILLING_PLANS.free;

  return {
    id: this._id,
    shop: this.shop,
    plan: this.plan,
    planName: planConfig.name,
    tier: planConfig.tier,
    interval: this.interval,
    status: this.status,
    isActive: this.isActive(),
    isPaid: this.plan !== "free",
    price: this.price,
    currency: this.currency,
    shopifySubscriptionId: this.shopifySubscriptionId,
    confirmationUrl: this.status === "PENDING" ? this.shopifyConfirmationUrl : null,
    currentPeriodStart: this.currentPeriodStart,
    currentPeriodEnd: this.currentPeriodEnd,
    activatedAt: this.activatedAt,
    cancelledAt: this.cancelledAt,
    features: planConfig.features,
    limits: planConfig.limits,
    displayFeatures: planConfig.displayFeatures,
    test: this.test,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

/**
 * Get existing subscription or create default Free active subscription for shop.
 */
subscriptionSchema.statics.getOrCreateForShop = async function (shop) {
  if (!shop) throw new Error("Shop domain is required to find or create subscription.");
  const normalizedShop = shop.toLowerCase().trim();

  let subscription = await this.findOne({ shop: normalizedShop });
  if (!subscription) {
    subscription = await this.create({
      shop: normalizedShop,
      plan: "free",
      interval: BILLING_INTERVALS.MONTHLY,
      status: "ACTIVE",
      price: 0,
      currency: "USD",
      activatedAt: new Date(),
    });
  }

  return subscription;
};

const Subscription =
  mongoose.models.Subscription ||
  mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
