import express from "express";
import rateLimit from "express-rate-limit";
import { authenticateShop } from "../middleware/authenticateShop.js";
import { authenticateStaff } from "../middleware/authenticateStaff.js";
import {
  createSupportRequest,
  getMerchantTicket,
  listMerchantTickets,
  listAdminTickets,
  getAdminTicket,
  updateTicketStatus,
  replyToTicket,
  getTicketEmailLogs,
  retryTicketEmail,
  getEmailHealth,
} from "../controllers/supportController.js";

const router = express.Router();

/**
 * Rate limiter for merchant support submissions:
 * Allows at most 10 ticket submissions per 15 minutes per IP.
 */
const supportSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many support requests submitted. Please wait a few minutes before submitting again.",
  },
});

/**
 * Merchant Endpoints (Authenticated via Shopify session token)
 */
router.post(
  "/requests",
  supportSubmissionLimiter,
  authenticateShop,
  createSupportRequest
);

router.get("/requests/:ticketId", authenticateShop, getMerchantTicket);
router.get("/requests", authenticateShop, listMerchantTickets);

/**
 * Authorized Support Staff Endpoints (Authenticated via staff authorization token)
 */
router.get("/admin/requests", authenticateStaff, listAdminTickets);
router.get("/admin/requests/:ticketId", authenticateStaff, getAdminTicket);
router.patch("/admin/requests/:ticketId/status", authenticateStaff, updateTicketStatus);
router.post("/admin/requests/:ticketId/replies", authenticateStaff, replyToTicket);
router.get("/admin/requests/:ticketId/emails", authenticateStaff, getTicketEmailLogs);
router.post("/admin/requests/:ticketId/retry-email", authenticateStaff, retryTicketEmail);
router.get("/admin/email-health", authenticateStaff, getEmailHealth);

export default router;