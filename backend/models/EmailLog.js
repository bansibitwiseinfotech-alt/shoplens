import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: [true, "Ticket ID is required"],
      index: true,
      trim: true,
      uppercase: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportRequest",
      index: true,
      default: null,
    },
    recipient: {
      type: String,
      required: [true, "Recipient email is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    sender: {
      type: String,
      required: [true, "Sender is required"],
      trim: true,
    },
    messageType: {
      type: String,
      enum: ["support_notification", "merchant_confirmation", "support_reply"],
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    smtpMessageId: {
      type: String,
      default: null,
      trim: true,
    },
    lastAttemptedAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    errorDetails: {
      message: { type: String, default: null },
      code: { type: String, default: null },
      responseCode: { type: Number, default: null },
      timestamp: { type: Date, default: null },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "tbl_email_logs",
  }
);

emailLogSchema.index({ ticketId: 1, messageType: 1 });
emailLogSchema.index({ emailStatus: 1, createdAt: -1 });

// Clean JSON response (prevent leaking internal metadata)
emailLogSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const EmailLog =
  mongoose.models.EmailLog || mongoose.model("EmailLog", emailLogSchema);

export default EmailLog;
