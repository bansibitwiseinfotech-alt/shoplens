import mongoose from "mongoose";
import crypto from "crypto";

const replySchema = new mongoose.Schema(
  {
    replyId: {
      type: String,
      default: () => `REP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      required: true,
    },
    sender: {
      type: String,
      enum: ["support_staff", "merchant"],
      default: "support_staff",
    },
    senderName: {
      type: String,
      trim: true,
      default: "ShopLens Support Team",
    },
    senderEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    message: {
      type: String,
      required: [true, "Reply message is required"],
      trim: true,
      maxlength: [10000, "Reply message cannot exceed 10000 characters"],
    },
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    smtpMessageId: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const supportRequestSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: [true, "Ticket ID is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    shop: {
      type: String,
      required: [true, "Shop domain is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    merchantName: {
      type: String,
      required: [true, "Merchant name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    merchantEmail: {
      type: String,
      required: [true, "Merchant email is required"],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
      index: true,
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      minlength: [3, "Subject must be at least 3 characters"],
      maxlength: [200, "Subject cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      minlength: [10, "Message must be at least 10 characters"],
      maxlength: [10000, "Message cannot exceed 10000 characters"],
    },
    category: {
      type: String,
      enum: [
        "billing",
        "search_intelligence",
        "product_discoverability",
        "merchandising",
        "technical_issue",
        "feature_request",
        "other",
      ],
      default: "other",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
      index: true,
    },
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "partial_failure", "failed"],
      default: "pending",
      index: true,
    },
    lastEmailError: {
      type: String,
      default: null,
    },
    replies: [replySchema],
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
    lastRepliedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "tbl_support_requests",
  }
);

supportRequestSchema.index({ shop: 1, createdAt: -1 });
supportRequestSchema.index({ status: 1, createdAt: -1 });

// Static helper to generate a unique ticket ID: SL-2026-XXXXXX
supportRequestSchema.statics.generateTicketId = async function () {
  const currentYear = new Date().getFullYear();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const candidateId = `SL-${currentYear}-${randomSuffix}`;
    const exists = await this.exists({ ticketId: candidateId });
    if (!exists) {
      return candidateId;
    }
    attempts++;
  }

  // Fallback with timestamp to guarantee uniqueness
  const timestampSuffix = Date.now().toString(36).toUpperCase().slice(-6);
  return `SL-${currentYear}-${timestampSuffix}`;
};

// Safe output without internal mongoose fields
supportRequestSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

supportRequestSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const SupportRequest =
  mongoose.models.SupportRequest ||
  mongoose.model("SupportRequest", supportRequestSchema);

export default SupportRequest;
