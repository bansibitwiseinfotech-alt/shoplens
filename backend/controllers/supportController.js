import SupportRequest from "../models/SupportRequest.js";
import EmailLog from "../models/EmailLog.js";
import {
  validateCreateSupportRequest,
  validateSupportReply,
  validateStatusUpdate,
} from "../validators/supportValidator.js";
import {
  sendSupportNotification,
  sendMerchantConfirmation,
  sendSupportReply,
  retryEmailLog,
  verifySmtpConnection,
} from "../services/supportEmailService.js";

/**
 * ==========================================
 * MERCHANT CONTROLLERS
 * ==========================================
 */

/**
 * POST /api/support/requests
 * Creates a support ticket and sends real emails via SMTP.
 */
export async function createSupportRequest(req, res) {
  try {
    const shop = req.shop || req.store?.shop;
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: "Shopify shop could not be verified from the session token.",
      });
    }

    const validation = validateCreateSupportRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || "Invalid support request details.",
        errors: validation.errors,
      });
    }

    const { merchantName, merchantEmail, subject, message, category, priority } =
      validation.data;

    // Idempotency: prevent double submission within 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const existingDuplicate = await SupportRequest.findOne({
      shop,
      subject,
      message,
      createdAt: { $gte: thirtySecondsAgo },
    });

    if (existingDuplicate) {
      return res.status(200).json({
        success: true,
        message: "Your support request was already submitted and is being processed.",
        ticketId: existingDuplicate.ticketId,
        emailStatus: existingDuplicate.emailStatus,
        isDuplicate: true,
      });
    }

    // Generate unique Ticket ID
    const ticketId = await SupportRequest.generateTicketId();

    const supportTicket = new SupportRequest({
      ticketId,
      shop,
      merchantName,
      merchantEmail,
      subject,
      message,
      category,
      priority,
      status: "open",
      emailStatus: "pending",
      submittedAt: new Date(),
    });

    await supportTicket.save();

    // 1. Send Support Notification (to Bitwise Infotech support team)
    const notifResult = await sendSupportNotification({
      ticket: supportTicket,
      shop,
      merchantName,
      merchantEmail,
      subject,
      message,
      category,
      priority,
    });

    // 2. Send Merchant Confirmation
    const confResult = await sendMerchantConfirmation({
      ticket: supportTicket,
      shop,
      merchantName,
      merchantEmail,
      subject,
      message,
    });

    // Determine aggregate email delivery state
    let finalEmailStatus = "sent";
    let lastError = null;

    if (notifResult.success && confResult.success) {
      finalEmailStatus = "sent";
    } else if (notifResult.success || confResult.success) {
      finalEmailStatus = "partial_failure";
      lastError = notifResult.error || confResult.error;
    } else {
      finalEmailStatus = "failed";
      lastError = notifResult.error || confResult.error;
    }

    supportTicket.emailStatus = finalEmailStatus;
    supportTicket.lastSentAt = new Date();
    supportTicket.lastEmailError = lastError;
    await supportTicket.save();

    return res.status(201).json({
      success: true,
      message:
        finalEmailStatus === "sent"
          ? "Support request submitted and confirmation email sent."
          : finalEmailStatus === "partial_failure"
          ? "Support request created. One of the notification emails encountered an issue, but our team has recorded your ticket."
          : "Support request saved in our database. Email dispatch will be retried shortly.",
      ticketId: supportTicket.ticketId,
      ticket: supportTicket.toSafeObject(),
      emailStatus: finalEmailStatus,
      notificationSent: notifResult.success,
      confirmationSent: confResult.success,
    });
  } catch (error) {
    console.error("Failed to create support request:", error.message);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while saving your support request.",
    });
  }
}

/**
 * GET /api/support/requests/:ticketId
 * Merchant gets their own ticket details.
 */
export async function getMerchantTicket(req, res) {
  try {
    const shop = req.shop || req.store?.shop;
    const { ticketId } = req.params;

    const ticket = await SupportRequest.findOne({
      ticketId: ticketId.toUpperCase(),
      shop,
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found or you are not authorized to view it.",
      });
    }

    return res.status(200).json({
      success: true,
      ticket: ticket.toSafeObject(),
    });
  } catch (error) {
    console.error("Failed to fetch merchant ticket:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve support ticket.",
    });
  }
}

/**
 * GET /api/support/requests
 * Lists tickets for authenticated merchant's store.
 */
export async function listMerchantTickets(req, res) {
  try {
    const shop = req.shop || req.store?.shop;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "10", 10)));
    const skip = (page - 1) * limit;

    const query = { shop };
    if (req.query.status) {
      query.status = req.query.status.toLowerCase();
    }

    const [tickets, totalCount] = await Promise.all([
      SupportRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SupportRequest.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      tickets: tickets.map((t) => t.toSafeObject()),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error) {
    console.error("Failed to list merchant tickets:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve your support tickets.",
    });
  }
}

/**
 * ==========================================
 * AUTHORIZED SUPPORT STAFF CONTROLLERS
 * ==========================================
 */

/**
 * GET /api/support/admin/requests
 * Lists all support tickets across shops with filtering, search, and pagination.
 */
export async function listAdminTickets(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status.toLowerCase();
    }

    if (req.query.priority && req.query.priority !== "all") {
      query.priority = req.query.priority.toLowerCase();
    }

    if (req.query.category && req.query.category !== "all") {
      query.category = req.query.category.toLowerCase();
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), "i");
      query.$or = [
        { ticketId: searchRegex },
        { merchantEmail: searchRegex },
        { merchantName: searchRegex },
        { subject: searchRegex },
        { shop: searchRegex },
      ];
    }

    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sortField = req.query.sortBy || "createdAt";

    const [tickets, totalCount] = await Promise.all([
      SupportRequest.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit),
      SupportRequest.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      tickets: tickets.map((t) => t.toSafeObject()),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error) {
    console.error("Staff list tickets error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve support tickets.",
    });
  }
}

/**
 * GET /api/support/admin/requests/:ticketId
 * Returns full ticket details and its email logs for staff.
 */
export async function getAdminTicket(req, res) {
  try {
    const { ticketId } = req.params;
    const ticket = await SupportRequest.findOne({
      ticketId: ticketId.toUpperCase(),
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }

    const emailLogs = await EmailLog.find({
      ticketId: ticket.ticketId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      ticket: ticket.toSafeObject(),
      emailLogs,
    });
  } catch (error) {
    console.error("Staff get ticket error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve ticket details.",
    });
  }
}

/**
 * PATCH /api/support/admin/requests/:ticketId/status
 * Updates ticket status (open, in_progress, resolved).
 */
export async function updateTicketStatus(req, res) {
  try {
    const { ticketId } = req.params;
    const validation = validateStatusUpdate(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0],
      });
    }

    const ticket = await SupportRequest.findOne({
      ticketId: ticketId.toUpperCase(),
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }

    ticket.status = validation.data.status;
    if (validation.data.status === "resolved") {
      ticket.resolvedAt = new Date();
    } else {
      ticket.resolvedAt = null;
    }

    await ticket.save();

    return res.status(200).json({
      success: true,
      message: `Ticket status updated to ${ticket.status}.`,
      ticket: ticket.toSafeObject(),
    });
  } catch (error) {
    console.error("Staff update ticket status error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update ticket status.",
    });
  }
}

/**
 * POST /api/support/admin/requests/:ticketId/replies
 * Authorized staff sends a reply and emails the merchant.
 */
export async function replyToTicket(req, res) {
  try {
    const { ticketId } = req.params;
    const validation = validateSupportReply(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0],
      });
    }

    const ticket = await SupportRequest.findOne({
      ticketId: ticketId.toUpperCase(),
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }

    const replyData = {
      sender: "support_staff",
      senderName: validation.data.senderName,
      senderEmail: process.env.SUPPORT_EMAIL || "support@bitwiseinfotech.com",
      message: validation.data.message,
      emailStatus: "pending",
      createdAt: new Date(),
    };

    ticket.replies.push(replyData);
    const addedReply = ticket.replies[ticket.replies.length - 1];

    // Attempt to send email to merchant
    const emailResult = await sendSupportReply({
      ticket,
      reply: addedReply,
      recipientEmail: ticket.merchantEmail,
      subject: ticket.subject,
    });

    addedReply.emailStatus = emailResult.success ? "sent" : "failed";
    addedReply.smtpMessageId = emailResult.smtpMessageId || null;

    ticket.lastRepliedAt = new Date();
    if (ticket.status === "open") {
      ticket.status = "in_progress";
    }

    await ticket.save();

    return res.status(201).json({
      success: true,
      message: emailResult.success
        ? "Reply added and sent to merchant."
        : "Reply saved, but outbound email delivery failed and can be retried.",
      ticket: ticket.toSafeObject(),
      reply: addedReply,
      emailSent: emailResult.success,
    });
  } catch (error) {
    console.error("Staff reply error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to submit support reply.",
    });
  }
}

/**
 * GET /api/support/admin/requests/:ticketId/emails
 * Lists email delivery history for a ticket.
 */
export async function getTicketEmailLogs(req, res) {
  try {
    const { ticketId } = req.params;
    const logs = await EmailLog.find({
      ticketId: ticketId.toUpperCase(),
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      emailLogs: logs,
    });
  } catch (error) {
    console.error("Staff get email logs error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve email logs.",
    });
  }
}

/**
 * POST /api/support/admin/requests/:ticketId/retry-email
 * Retries an eligible failed email for a ticket.
 */
export async function retryTicketEmail(req, res) {
  try {
    const { ticketId } = req.params;
    const { emailLogId } = req.body;

    let targetLog;
    if (emailLogId) {
      targetLog = await EmailLog.findOne({
        _id: emailLogId,
        ticketId: ticketId.toUpperCase(),
      });
    } else {
      // Find the most recent failed log for this ticket
      targetLog = await EmailLog.findOne({
        ticketId: ticketId.toUpperCase(),
        emailStatus: "failed",
      }).sort({ createdAt: -1 });
    }

    if (!targetLog) {
      return res.status(404).json({
        success: false,
        message: "No eligible failed email found for retry.",
      });
    }

    const result = await retryEmailLog(targetLog._id);

    // Update parent ticket email status if all now sent
    const remainingFailed = await EmailLog.countDocuments({
      ticketId: ticketId.toUpperCase(),
      emailStatus: "failed",
    });

    if (remainingFailed === 0) {
      await SupportRequest.updateOne(
        { ticketId: ticketId.toUpperCase() },
        { $set: { emailStatus: "sent", lastEmailError: null } }
      );
    }

    return res.status(200).json({
      success: result.success,
      message: result.message,
      emailLog: result.emailLog,
    });
  } catch (error) {
    console.error("Staff retry email error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retry email delivery.",
    });
  }
}

/**
 * GET /api/support/admin/email-health
 * Sanity and health check for SMTP connection.
 */
export async function getEmailHealth(req, res) {
  try {
    const health = await verifySmtpConnection();
    return res.status(200).json({
      success: health.ok,
      health,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to check email health.",
      error: error.message,
    });
  }
}