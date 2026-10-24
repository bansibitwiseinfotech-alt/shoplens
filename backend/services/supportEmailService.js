import nodemailer from "nodemailer";
import EmailLog from "../models/EmailLog.js";

// Active or test transporter instance
let activeTransporter = null;

/**
 * Escapes characters that have HTML meaning to prevent injection.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Reads and returns sanitized SMTP configuration from environment variables.
 */
export function getSmtpConfig() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === true
      : port === 465;

  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || `"ShopLens Support" <${user}>`;
  const supportEmail =
    process.env.SUPPORT_EMAIL || "support@bitwiseinfotech.com";

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    supportEmail,
  };
}

/**
 * Returns or creates the Nodemailer transporter.
 * Allows overriding with a custom transport (e.g. for unit/mock testing).
 */
export function getTransporter(overrideTransport = null) {
  if (overrideTransport) {
    activeTransporter = nodemailer.createTransport(overrideTransport);
    return activeTransporter;
  }

  if (activeTransporter) {
    return activeTransporter;
  }

  const config = getSmtpConfig();

  activeTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return activeTransporter;
}

/**
 * Resets the active transporter (useful in tests).
 */
export function resetTransporter() {
  activeTransporter = null;
}

/**
 * Verifies SMTP connection health.
 * Never leaks passwords or private secrets.
 */
export async function verifySmtpConnection(transporter = null) {
  const client = transporter || getTransporter();
  const config = getSmtpConfig();

  const sanitized = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    configuredUser: config.user ? `${config.user.slice(0, 3)}***@***` : "not_configured",
    supportEmail: config.supportEmail,
    senderFrom: config.from,
    hasPassword: Boolean(config.pass),
  };

  try {
    await client.verify();
    return {
      ok: true,
      status: "connected",
      message: "SMTP server is reachable and credentials are verified.",
      config: sanitized,
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      message: error.message || "Failed to verify SMTP connection.",
      code: error.code || "SMTP_VERIFY_FAILED",
      config: sanitized,
    };
  }
}

/**
 * Helper to build the responsive HTML layout with ShopLens branding.
 */
function buildEmailLayout({ preheader, headerTitle, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(headerTitle)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f6f6f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #202223; }
    .wrapper { width: 100%; max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e1e3e5; }
    .header { background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 24px 32px; text-align: left; }
    .brand-title { color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 0.5px; }
    .brand-sub { color: #9ca3af; font-size: 13px; margin-top: 4px; }
    .content { padding: 32px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge-ticket { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .meta-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0; }
    .meta-item { margin: 6px 0; font-size: 13px; color: #4b5563; }
    .meta-item strong { color: #111827; }
    .message-box { background: #ffffff; border-left: 4px solid #4f46e5; padding: 16px; margin: 20px 0; background: #faf5ff; border-radius: 0 6px 6px 0; }
    .footer { background: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
    .footer a { color: #4f46e5; text-decoration: none; }
    .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; }
  </style>
</head>
<body>
  <span class="preheader">${escapeHtml(preheader)}</span>
  <div class="wrapper">
    <div class="header">
      <h1 class="brand-title">🔍 ShopLens</h1>
      <div class="brand-sub">Store Intelligence & Product Discovery</div>
    </div>
    <div class="content">
      ${contentHtml}
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px 0;"><strong>ShopLens</strong> by Bitwise Infotech, Rajkot, Gujarat, India</p>
      <p style="margin: 0;">Support: <a href="mailto:support@bitwiseinfotech.com">support@bitwiseinfotech.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends support notification email to support inbox.
 * Uses authenticated SMTP sender as `from`, and merchant email as `replyTo`.
 */
export async function sendSupportNotification({
  ticket,
  shop,
  merchantName,
  merchantEmail,
  subject,
  message,
  category,
  priority,
  transporter = null,
}) {
  const config = getSmtpConfig();
  const client = transporter || getTransporter();

  const formattedDate = new Date().toUTCString();

  const htmlContent = `
    <div style="margin-bottom: 20px;">
      <span class="badge badge-ticket">Ticket ID: ${escapeHtml(ticket.ticketId)}</span>
      <h2 style="font-size: 20px; font-weight: 700; margin: 12px 0 6px 0; color: #111827;">New Support Request Received</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0;">Submitted on ${escapeHtml(formattedDate)}</p>
    </div>

    <div class="meta-box">
      <div class="meta-item"><strong>Store:</strong> ${escapeHtml(shop)}</div>
      <div class="meta-item"><strong>Merchant Name:</strong> ${escapeHtml(merchantName)}</div>
      <div class="meta-item"><strong>Merchant Email:</strong> <a href="mailto:${escapeHtml(merchantEmail)}">${escapeHtml(merchantEmail)}</a></div>
      <div class="meta-item"><strong>Category:</strong> ${escapeHtml(category || "General")}</div>
      <div class="meta-item"><strong>Priority:</strong> ${escapeHtml(priority || "Medium")}</div>
      <div class="meta-item"><strong>Subject:</strong> ${escapeHtml(subject)}</div>
    </div>

    <h3 style="font-size: 15px; font-weight: 600; margin-top: 24px; color: #111827;">Issue Description:</h3>
    <div class="message-box" style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #1f2937;">${escapeHtml(message)}</div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px;">
      <em>Tip: Replying directly to this email will deliver your response directly to <strong>${escapeHtml(merchantEmail)}</strong>.</em>
    </p>
  `;

  const fullHtml = buildEmailLayout({
    preheader: `[New Ticket #${ticket.ticketId}] ${subject}`,
    headerTitle: `[ShopLens Support] #${ticket.ticketId} - ${subject}`,
    contentHtml: htmlContent,
  });

  const plainText = `[ShopLens Support Notification]
Ticket ID: ${ticket.ticketId}
Store: ${shop}
Merchant: ${merchantName} (${merchantEmail})
Category: ${category}
Priority: ${priority}
Submitted: ${formattedDate}

Subject: ${subject}

Message:
${message}

Reply to this email to respond directly to ${merchantEmail}.
`;

  // Create EmailLog in pending state
  const emailLog = await EmailLog.create({
    ticketId: ticket.ticketId,
    requestId: ticket._id || null,
    recipient: config.supportEmail,
    sender: config.from,
    messageType: "support_notification",
    subject: `[ShopLens Support #${ticket.ticketId}] ${subject}`,
    deliveryAttempts: 1,
    emailStatus: "pending",
    lastAttemptedAt: new Date(),
    metadata: { shop, merchantEmail },
  });

  try {
    const info = await client.sendMail({
      from: config.from,
      to: config.supportEmail,
      replyTo: merchantEmail,
      subject: `[ShopLens Support #${ticket.ticketId}] ${subject}`,
      text: plainText,
      html: fullHtml,
    });

    emailLog.emailStatus = "sent";
    emailLog.smtpMessageId = info?.messageId || "mock-accepted";
    emailLog.sentAt = new Date();
    await emailLog.save();

    return {
      success: true,
      emailLogId: emailLog._id,
      smtpMessageId: emailLog.smtpMessageId,
      recipient: config.supportEmail,
    };
  } catch (error) {
    console.error("Support notification SMTP error:", error.message);
    emailLog.emailStatus = "failed";
    emailLog.errorDetails = {
      message: error.message,
      code: error.code || "SMTP_ERROR",
      responseCode: error.responseCode || null,
      timestamp: new Date(),
    };
    await emailLog.save();

    return {
      success: false,
      emailLogId: emailLog._id,
      error: error.message,
      code: error.code || "SMTP_ERROR",
    };
  }
}

/**
 * Sends confirmation email to merchant.
 */
export async function sendMerchantConfirmation({
  ticket,
  shop,
  merchantName,
  merchantEmail,
  subject,
  message,
  transporter = null,
}) {
  const config = getSmtpConfig();
  const client = transporter || getTransporter();

  const htmlContent = `
    <div style="margin-bottom: 20px;">
      <span class="badge badge-ticket">Ticket ID: ${escapeHtml(ticket.ticketId)}</span>
      <h2 style="font-size: 20px; font-weight: 700; margin: 12px 0 6px 0; color: #111827;">We've received your request!</h2>
      <p style="color: #4b5563; font-size: 14px; margin: 0;">
        Hello <strong>${escapeHtml(merchantName)}</strong>, thank you for reaching out to ShopLens support.
      </p>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #374151;">
      Our engineering and support team at <strong>Bitwise Infotech</strong> is reviewing your ticket. We strive to respond to all inquiries within 1 business day.
    </p>

    <div class="meta-box">
      <div class="meta-item"><strong>Ticket ID:</strong> ${escapeHtml(ticket.ticketId)}</div>
      <div class="meta-item"><strong>Shop:</strong> ${escapeHtml(shop)}</div>
      <div class="meta-item"><strong>Subject:</strong> ${escapeHtml(subject)}</div>
    </div>

    <h3 style="font-size: 14px; font-weight: 600; margin-top: 20px; color: #111827;">Your Submitted Message:</h3>
    <div class="message-box" style="white-space: pre-wrap; font-size: 13px; line-height: 1.5; color: #374151;">${escapeHtml(message)}</div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px;">
      Need to add more information? Simply reply to this email with your Ticket ID <strong>${escapeHtml(ticket.ticketId)}</strong> in the subject line.
    </p>
  `;

  const fullHtml = buildEmailLayout({
    preheader: `We received your request [#${ticket.ticketId}]`,
    headerTitle: `Request Received [#${ticket.ticketId}] - ShopLens Support`,
    contentHtml: htmlContent,
  });

  const plainText = `Hello ${merchantName},

Thank you for contacting ShopLens support. We have received your request.

Ticket ID: ${ticket.ticketId}
Store: ${shop}
Subject: ${subject}

Your message:
${message}

Our team at Bitwise Infotech will review your inquiry and respond shortly (typically within 1 business day).

Best regards,
ShopLens Support Team
Bitwise Infotech, Rajkot, Gujarat, India
support@bitwiseinfotech.com
`;

  const emailLog = await EmailLog.create({
    ticketId: ticket.ticketId,
    requestId: ticket._id || null,
    recipient: merchantEmail,
    sender: config.from,
    messageType: "merchant_confirmation",
    subject: `We received your request [#${ticket.ticketId}] - ShopLens Support`,
    deliveryAttempts: 1,
    emailStatus: "pending",
    lastAttemptedAt: new Date(),
    metadata: { shop },
  });

  try {
    const info = await client.sendMail({
      from: config.from,
      to: merchantEmail,
      replyTo: config.supportEmail,
      subject: `We received your request [#${ticket.ticketId}] - ShopLens Support`,
      text: plainText,
      html: fullHtml,
    });

    emailLog.emailStatus = "sent";
    emailLog.smtpMessageId = info?.messageId || "mock-accepted";
    emailLog.sentAt = new Date();
    await emailLog.save();

    return {
      success: true,
      emailLogId: emailLog._id,
      smtpMessageId: emailLog.smtpMessageId,
      recipient: merchantEmail,
    };
  } catch (error) {
    console.error("Merchant confirmation SMTP error:", error.message);
    emailLog.emailStatus = "failed";
    emailLog.errorDetails = {
      message: error.message,
      code: error.code || "SMTP_ERROR",
      responseCode: error.responseCode || null,
      timestamp: new Date(),
    };
    await emailLog.save();

    return {
      success: false,
      emailLogId: emailLog._id,
      error: error.message,
      code: error.code || "SMTP_ERROR",
    };
  }
}

/**
 * Sends support staff reply to merchant.
 */
export async function sendSupportReply({
  ticket,
  reply,
  recipientEmail,
  subject,
  transporter = null,
}) {
  const config = getSmtpConfig();
  const client = transporter || getTransporter();

  const toEmail = recipientEmail || ticket.merchantEmail;

  const htmlContent = `
    <div style="margin-bottom: 20px;">
      <span class="badge badge-ticket">Ticket ID: ${escapeHtml(ticket.ticketId)}</span>
      <h2 style="font-size: 20px; font-weight: 700; margin: 12px 0 6px 0; color: #111827;">Update regarding your support ticket</h2>
      <p style="color: #4b5563; font-size: 14px; margin: 0;">
        Hello <strong>${escapeHtml(ticket.merchantName)}</strong>,
      </p>
    </div>

    <div class="message-box" style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #111827; background: #eef2ff; border-left-color: #6366f1;">
<strong>Reply from ${escapeHtml(reply.senderName || "ShopLens Support")}:</strong>

${escapeHtml(reply.message)}
    </div>

    <div class="meta-box">
      <div class="meta-item"><strong>Ticket ID:</strong> ${escapeHtml(ticket.ticketId)}</div>
      <div class="meta-item"><strong>Original Subject:</strong> ${escapeHtml(subject || ticket.subject)}</div>
      <div class="meta-item"><strong>Store:</strong> ${escapeHtml(ticket.shop)}</div>
    </div>

    <p style="font-size: 13px; color: #6b7280; margin-top: 24px;">
      To continue this conversation, simply reply directly to this email or contact <a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a> with your Ticket ID.
    </p>
  `;

  const fullHtml = buildEmailLayout({
    preheader: `Support Reply [#${ticket.ticketId}]`,
    headerTitle: `Re: [ShopLens Support #${ticket.ticketId}] ${subject || ticket.subject}`,
    contentHtml: htmlContent,
  });

  const plainText = `Hello ${ticket.merchantName},

Here is an update on your support ticket [#${ticket.ticketId}]:

${reply.message}

---
Ticket ID: ${ticket.ticketId}
Original Subject: ${subject || ticket.subject}
Store: ${ticket.shop}

Best regards,
${reply.senderName || "ShopLens Support Team"}
Bitwise Infotech
${config.supportEmail}
`;

  const emailLog = await EmailLog.create({
    ticketId: ticket.ticketId,
    requestId: ticket._id || null,
    recipient: toEmail,
    sender: config.from,
    messageType: "support_reply",
    subject: `Re: [ShopLens Support #${ticket.ticketId}] ${subject || ticket.subject}`,
    deliveryAttempts: 1,
    emailStatus: "pending",
    lastAttemptedAt: new Date(),
    metadata: { replyId: reply.replyId, shop: ticket.shop },
  });

  try {
    const info = await client.sendMail({
      from: config.from,
      to: toEmail,
      replyTo: config.supportEmail,
      subject: `Re: [ShopLens Support #${ticket.ticketId}] ${subject || ticket.subject}`,
      text: plainText,
      html: fullHtml,
    });

    emailLog.emailStatus = "sent";
    emailLog.smtpMessageId = info?.messageId || "mock-accepted";
    emailLog.sentAt = new Date();
    await emailLog.save();

    return {
      success: true,
      emailLogId: emailLog._id,
      smtpMessageId: emailLog.smtpMessageId,
      recipient: toEmail,
    };
  } catch (error) {
    console.error("Support reply SMTP error:", error.message);
    emailLog.emailStatus = "failed";
    emailLog.errorDetails = {
      message: error.message,
      code: error.code || "SMTP_ERROR",
      responseCode: error.responseCode || null,
      timestamp: new Date(),
    };
    await emailLog.save();

    return {
      success: false,
      emailLogId: emailLog._id,
      error: error.message,
      code: error.code || "SMTP_ERROR",
    };
  }
}

/**
 * Retries sending an eligible failed email from EmailLog.
 */
export async function retryEmailLog(emailLogId, transporter = null) {
  const emailLog = await EmailLog.findById(emailLogId);
  if (!emailLog) {
    throw new Error("Email log not found.");
  }

  if (emailLog.emailStatus === "sent") {
    return {
      success: true,
      message: "Email is already marked as sent.",
      emailLog,
    };
  }

  const config = getSmtpConfig();
  const client = transporter || getTransporter();

  emailLog.deliveryAttempts += 1;
  emailLog.lastAttemptedAt = new Date();

  try {
    const info = await client.sendMail({
      from: config.from,
      to: emailLog.recipient,
      replyTo: config.supportEmail,
      subject: emailLog.subject,
      text: `[Retry Attempt #${emailLog.deliveryAttempts}] ${emailLog.subject}\nTicket: ${emailLog.ticketId}`,
      html: `<p>This is a retried message for Ticket <strong>${escapeHtml(emailLog.ticketId)}</strong>.</p>`,
    });

    emailLog.emailStatus = "sent";
    emailLog.smtpMessageId = info?.messageId || "mock-retried";
    emailLog.sentAt = new Date();
    emailLog.errorDetails = { message: null, code: null, timestamp: null };
    await emailLog.save();

    return {
      success: true,
      message: "Email successfully retried and sent.",
      emailLog,
    };
  } catch (error) {
    console.error("Retry email SMTP error:", error.message);
    emailLog.emailStatus = "failed";
    emailLog.errorDetails = {
      message: error.message,
      code: error.code || "SMTP_RETRY_ERROR",
      responseCode: error.responseCode || null,
      timestamp: new Date(),
    };
    await emailLog.save();

    return {
      success: false,
      message: error.message,
      emailLog,
    };
  }
}
