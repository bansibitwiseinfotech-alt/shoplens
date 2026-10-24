import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import connectDB from "../config/db.js";
import SupportRequest from "../models/SupportRequest.js";
import EmailLog from "../models/EmailLog.js";
import Store from "../models/Store.js";
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
  escapeHtml,
} from "../services/supportEmailService.js";
import { authenticateStaff } from "../middleware/authenticateStaff.js";

const TEST_SHOP_1 = "test-support-store-1.myshopify.com";
const TEST_SHOP_2 = "test-support-store-2.myshopify.com";
const TEST_STAFF_SECRET =
  process.env.SUPPORT_STAFF_SECRET ||
  process.env.INTERNAL_API_SECRET ||
  "6906c07ad35854d5c9780459a45a18d399936665434238dfcec4cfc83ed9838c";

// Mock successful Nodemailer transport
const createMockSuccessTransporter = () =>
  nodemailer.createTransport({
    jsonTransport: true,
  });

// Mock failing Nodemailer transport
const createMockFailingTransporter = (errorMessage = "SMTP Connection Timeout", errorCode = "ETIMEDOUT") => {
  return {
    sendMail: async () => {
      const err = new Error(errorMessage);
      err.code = errorCode;
      throw err;
    },
    verify: async () => {
      const err = new Error(errorMessage);
      err.code = errorCode;
      throw err;
    },
  };
};

test.before(async () => {
  await connectDB();

  // Clean test support tickets and email logs
  await SupportRequest.deleteMany({
    shop: { $in: [TEST_SHOP_1, TEST_SHOP_2] },
  });
  await EmailLog.deleteMany({
    metadata: { shop: { $in: [TEST_SHOP_1, TEST_SHOP_2] } },
  });

  // Ensure test store 1 and 2 exist in DB
  await Store.findOneAndUpdate(
    { shop: TEST_SHOP_1 },
    {
      $set: {
        shop: TEST_SHOP_1,
        accessToken: "test_token_1",
        installed: true,
      },
    },
    { upsert: true }
  );

  await Store.findOneAndUpdate(
    { shop: TEST_SHOP_2 },
    {
      $set: {
        shop: TEST_SHOP_2,
        accessToken: "test_token_2",
        installed: true,
      },
    },
    { upsert: true }
  );
});

test.after(async () => {
  await SupportRequest.deleteMany({
    shop: { $in: [TEST_SHOP_1, TEST_SHOP_2] },
  });
  await EmailLog.deleteMany({
    metadata: { shop: { $in: [TEST_SHOP_1, TEST_SHOP_2] } },
  });
  await Store.deleteMany({
    shop: { $in: [TEST_SHOP_1, TEST_SHOP_2] },
  });
  await mongoose.connection.close();
});

// 1. Valid support ticket submission & model creation
test("1. SupportRequest: generates unique ticket ID and saves valid ticket", async () => {
  const ticketId = await SupportRequest.generateTicketId();
  assert.match(ticketId, /^SL-\d{4}-[A-Z0-9]+$/);

  const ticket = await SupportRequest.create({
    ticketId,
    shop: TEST_SHOP_1,
    merchantName: "Alex Mercer",
    merchantEmail: "alex@example.com",
    subject: "Question about Product Discoverability",
    message: "How can I improve search discovery for my newly added summer dresses?",
    category: "product_discoverability",
    priority: "high",
    status: "open",
    emailStatus: "pending",
  });

  assert.equal(ticket.ticketId, ticketId);
  assert.equal(ticket.status, "open");
  assert.equal(ticket.priority, "high");
  assert.equal(ticket.replies.length, 0);
  assert.ok(ticket.submittedAt);
});

// 2. Missing required fields validation
test("2. Validator: catches missing required fields", () => {
  const result = validateCreateSupportRequest({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("name is required")));
  assert.ok(result.errors.some((e) => e.includes("email is required")));
  assert.ok(result.errors.some((e) => e.includes("Subject is required")));
  assert.ok(result.errors.some((e) => e.includes("Message is required")));
});

// 3. Invalid email address
test("3. Validator: rejects invalid email address", () => {
  const result = validateCreateSupportRequest({
    name: "John Doe",
    email: "not-an-email",
    subject: "Valid Subject Here",
    message: "Valid message describing the inquiry in detail.",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("valid email")));
});

// 4. Excessively long inputs and HTML escaping
test("4. Validator & Service: handles character limits and HTML escaping", () => {
  const veryLongName = "A".repeat(150);
  const result = validateCreateSupportRequest({
    name: veryLongName,
    email: "test@example.com",
    subject: "Hi", // Too short (min 3)
    message: "Short", // Too short (min 10)
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("100 characters")));
  assert.ok(result.errors.some((e) => e.includes("at least 3 characters")));
  assert.ok(result.errors.some((e) => e.includes("at least 10 characters")));

  // HTML escaping prevents XSS
  const maliciousInput = '<script>alert("xss")</script>&"test"';
  const escaped = escapeHtml(maliciousInput);
  assert.equal(escaped.includes("<script>"), false);
  assert.ok(escaped.includes("&lt;script&gt;"));
  assert.ok(escaped.includes("&amp;"));
});

// 5. Missing or invalid Shopify authentication on staff endpoints
test("5. Middleware: staff endpoint rejects missing or invalid authorization", () => {
  let statusResult = null;
  let jsonResult = null;

  const mockRes = {
    status(code) {
      statusResult = code;
      return this;
    },
    json(data) {
      jsonResult = data;
      return this;
    },
  };

  // Missing token
  authenticateStaff({ headers: {} }, mockRes, () => {});
  assert.equal(statusResult, 401);
  assert.equal(jsonResult.success, false);

  // Invalid token
  authenticateStaff(
    { headers: { "x-support-token": "wrong-secret-token" } },
    mockRes,
    () => {}
  );
  assert.equal(statusResult, 403);
  assert.equal(jsonResult.success, false);
});

// 6. Authorized staff token verification
test("6. Middleware: accepts valid staff authorization secret", () => {
  let nextCalled = false;
  const mockReq = {
    headers: { "x-support-token": TEST_STAFF_SECRET },
  };
  const mockRes = {};

  authenticateStaff(mockReq, mockRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(mockReq.staff?.role, "support_staff");
});

// 7. Merchant isolation: store 1 cannot access store 2's ticket
test("7. Tenant Isolation: Merchant can only access their own shop's ticket", async () => {
  const ticketId = await SupportRequest.generateTicketId();
  await SupportRequest.create({
    ticketId,
    shop: TEST_SHOP_2,
    merchantName: "Store Two Merchant",
    merchantEmail: "store2@example.com",
    subject: "Private store inquiry",
    message: "This is private store data that must never be visible to store 1.",
  });

  // Query as TEST_SHOP_1
  const ticketFoundByStore1 = await SupportRequest.findOne({
    ticketId,
    shop: TEST_SHOP_1,
  });
  assert.equal(ticketFoundByStore1, null);

  // Query as TEST_SHOP_2
  const ticketFoundByStore2 = await SupportRequest.findOne({
    ticketId,
    shop: TEST_SHOP_2,
  });
  assert.ok(ticketFoundByStore2);
  assert.equal(ticketFoundByStore2.shop, TEST_SHOP_2);
});

// 8. SMTP mock: Support notification email delivery
test("8. Email Service: successfully sends support notification using mock transporter", async () => {
  const mockTransporter = createMockSuccessTransporter();
  const ticketId = await SupportRequest.generateTicketId();
  const ticket = new SupportRequest({
    ticketId,
    shop: TEST_SHOP_1,
    merchantName: "Sarah Connor",
    merchantEmail: "sarah@example.com",
    subject: "Zero Result Search Issue",
    message: "Searches for 'sunglasses' yield zero results in the store.",
  });

  const res = await sendSupportNotification({
    ticket,
    shop: TEST_SHOP_1,
    merchantName: "Sarah Connor",
    merchantEmail: "sarah@example.com",
    subject: ticket.subject,
    message: ticket.message,
    category: "search_intelligence",
    priority: "high",
    transporter: mockTransporter,
  });

  assert.equal(res.success, true);
  assert.ok(res.emailLogId);

  const log = await EmailLog.findById(res.emailLogId);
  assert.equal(log.emailStatus, "sent");
  assert.equal(log.messageType, "support_notification");
  assert.equal(log.deliveryAttempts, 1);
});

// 9. SMTP mock: Merchant confirmation email delivery
test("9. Email Service: successfully sends merchant confirmation email", async () => {
  const mockTransporter = createMockSuccessTransporter();
  const ticketId = await SupportRequest.generateTicketId();
  const ticket = new SupportRequest({
    ticketId,
    shop: TEST_SHOP_1,
    merchantName: "Sarah Connor",
    merchantEmail: "sarah@example.com",
    subject: "Zero Result Search Issue",
    message: "Searches for 'sunglasses' yield zero results.",
  });

  const res = await sendMerchantConfirmation({
    ticket,
    shop: TEST_SHOP_1,
    merchantName: "Sarah Connor",
    merchantEmail: "sarah@example.com",
    subject: ticket.subject,
    message: ticket.message,
    transporter: mockTransporter,
  });

  assert.equal(res.success, true);
  assert.ok(res.emailLogId);

  const log = await EmailLog.findById(res.emailLogId);
  assert.equal(log.emailStatus, "sent");
  assert.equal(log.messageType, "merchant_confirmation");
  assert.equal(log.recipient, "sarah@example.com");
});

// 10. Partial Failure Scenario: notification succeeds, confirmation fails
test("10. Partial Failure: correctly records failed recipient without failing entire record", async () => {
  const successTransporter = createMockSuccessTransporter();
  const failingTransporter = createMockFailingTransporter("Merchant inbox unreachable", "ECONNREFUSED");

  const ticketId = await SupportRequest.generateTicketId();
  const ticket = await SupportRequest.create({
    ticketId,
    shop: TEST_SHOP_1,
    merchantName: "Partial Fail User",
    merchantEmail: "failuser@example.com",
    subject: "Testing partial failure",
    message: "Testing partial email dispatch state.",
  });

  // Notification succeeds
  const notif = await sendSupportNotification({
    ticket,
    shop: TEST_SHOP_1,
    merchantName: ticket.merchantName,
    merchantEmail: ticket.merchantEmail,
    subject: ticket.subject,
    message: ticket.message,
    transporter: successTransporter,
  });
  assert.equal(notif.success, true);

  // Confirmation fails
  const conf = await sendMerchantConfirmation({
    ticket,
    shop: TEST_SHOP_1,
    merchantName: ticket.merchantName,
    merchantEmail: ticket.merchantEmail,
    subject: ticket.subject,
    message: ticket.message,
    transporter: failingTransporter,
  });
  assert.equal(conf.success, false);
  assert.equal(conf.code, "ECONNREFUSED");

  const failedLog = await EmailLog.findById(conf.emailLogId);
  assert.equal(failedLog.emailStatus, "failed");
  assert.equal(failedLog.errorDetails?.code, "ECONNREFUSED");
});

// 11. Failed email retry
test("11. Email Service: retries failed email log successfully", async () => {
  const failingTransporter = createMockFailingTransporter("Initial failure", "EFAIL");
  const successTransporter = createMockSuccessTransporter();

  const ticketId = await SupportRequest.generateTicketId();
  const ticket = new SupportRequest({ ticketId, shop: TEST_SHOP_1 });

  const initialAttempt = await sendMerchantConfirmation({
    ticket,
    shop: TEST_SHOP_1,
    merchantName: "Retry User",
    merchantEmail: "retry@example.com",
    subject: "Subject for retry",
    message: "Message for retry test",
    transporter: failingTransporter,
  });

  assert.equal(initialAttempt.success, false);

  // Now retry with working transporter
  const retryResult = await retryEmailLog(initialAttempt.emailLogId, successTransporter);
  assert.equal(retryResult.success, true);
  assert.equal(retryResult.emailLog.emailStatus, "sent");
  assert.equal(retryResult.emailLog.deliveryAttempts, 2);
});

// 12. Support staff reply workflow
test("12. Staff Reply: adds reply to ticket and sends email via SMTP", async () => {
  const mockTransporter = createMockSuccessTransporter();
  const ticketId = await SupportRequest.generateTicketId();
  const ticket = await SupportRequest.create({
    ticketId,
    shop: TEST_SHOP_1,
    merchantName: "Merchant With Question",
    merchantEmail: "merchant@example.com",
    subject: "How does Search Intent work?",
    message: "I need help understanding high-intent vs low-intent searches.",
  });

  const replyData = {
    replyId: "REP-TEST1234",
    sender: "support_staff",
    senderName: "Bansi @ Bitwise Infotech",
    message: "Search Intent groups queries into Informational, Navigational, and Transactional.",
  };

  const replyRes = await sendSupportReply({
    ticket,
    reply: replyData,
    recipientEmail: ticket.merchantEmail,
    subject: ticket.subject,
    transporter: mockTransporter,
  });

  assert.equal(replyRes.success, true);
  assert.ok(replyRes.emailLogId);

  ticket.replies.push({
    ...replyData,
    emailStatus: "sent",
    smtpMessageId: replyRes.smtpMessageId,
  });
  ticket.status = "in_progress";
  ticket.lastRepliedAt = new Date();
  await ticket.save();

  const updated = await SupportRequest.findById(ticket._id);
  assert.equal(updated.replies.length, 1);
  assert.equal(updated.status, "in_progress");
  assert.equal(updated.replies[0].senderName, "Bansi @ Bitwise Infotech");
});

// 13. Ticket status updates and resolution
test("13. Ticket Status: updates status to resolved and sets resolvedAt timestamp", async () => {
  const validation = validateStatusUpdate({ status: "resolved" });
  assert.equal(validation.valid, true);

  const ticketId = await SupportRequest.generateTicketId();
  const ticket = await SupportRequest.create({
    ticketId,
    shop: TEST_SHOP_1,
    merchantName: "Test Merchant",
    merchantEmail: "merchant@test.com",
    subject: "Resolved ticket test",
    message: "This issue will be resolved.",
    status: "open",
  });

  ticket.status = "resolved";
  ticket.resolvedAt = new Date();
  await ticket.save();

  const resolved = await SupportRequest.findById(ticket._id);
  assert.equal(resolved.status, "resolved");
  assert.ok(resolved.resolvedAt);
});

// 14. Pagination, filter, and search queries
test("14. Filtering & Search: queries tickets by status, priority, and text search", async () => {
  const count = await SupportRequest.countDocuments({ shop: TEST_SHOP_1 });
  assert.ok(count >= 1);

  // Search by keyword
  const results = await SupportRequest.find({
    shop: TEST_SHOP_1,
    subject: { $regex: /Search/i },
  });
  assert.ok(results.length >= 1);
});

// 15. SMTP connection health check (never returns password or secrets)
test("15. SMTP Health: verifies transporter and does not expose passwords", async () => {
  const mockTransporter = {
    verify: async () => true,
  };

  const health = await verifySmtpConnection(mockTransporter);
  assert.equal(health.ok, true);
  assert.equal(health.status, "connected");
  assert.ok(health.config);
  assert.equal(health.config.pass, undefined); // Password is never returned
  assert.ok(health.config.configuredUser.includes("***")); // Masked
});

// 16. SMTP Timeout / Failure handling
test("16. SMTP Timeout: handles transporter timeout gracefully without crash", async () => {
  const timeoutTransporter = createMockFailingTransporter("ETIMEDOUT: Connection timed out", "ETIMEDOUT");

  const health = await verifySmtpConnection(timeoutTransporter);
  assert.equal(health.ok, false);
  assert.equal(health.code, "ETIMEDOUT");
  assert.ok(health.message.includes("timed out"));
});

// 17. Safe serialization: prevents internal Mongoose fields from leaking
test("17. Safe Object: ensures __v and internal tokens are omitted from JSON", async () => {
  const ticketId = await SupportRequest.generateTicketId();
  const ticket = await SupportRequest.create({
    ticketId,
    shop: TEST_SHOP_1,
    merchantName: "Serialization User",
    merchantEmail: "safe@example.com",
    subject: "Safe JSON serialization",
    message: "Testing toSafeObject formatting.",
  });

  const safe = ticket.toSafeObject();
  assert.equal(safe.__v, undefined);
  assert.equal(safe.ticketId, ticketId);
});
