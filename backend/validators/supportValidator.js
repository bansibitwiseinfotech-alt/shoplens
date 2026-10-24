const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

const VALID_CATEGORIES = new Set([
  "billing",
  "search_intelligence",
  "product_discoverability",
  "merchandising",
  "technical_issue",
  "feature_request",
  "other",
]);

const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);

/**
 * Escapes characters that have HTML meaning to prevent injection.
 */
export function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str.trim();
}

/**
 * Validates the payload for creating a new support request.
 */
export function validateCreateSupportRequest(payload) {
  const errors = [];
  const data = {};

  const name = sanitizeString(payload?.name || payload?.merchantName);
  if (!name) {
    errors.push("Your name is required.");
  } else if (name.length < 2) {
    errors.push("Your name must be at least 2 characters.");
  } else if (name.length > 100) {
    errors.push("Your name cannot exceed 100 characters.");
  } else {
    data.merchantName = name;
  }

  const email = sanitizeString(payload?.email || payload?.merchantEmail).toLowerCase();
  if (!email) {
    errors.push("Contact email is required.");
  } else if (!EMAIL_REGEX.test(email) || email.length > 254) {
    errors.push("Please provide a valid email address.");
  } else {
    data.merchantEmail = email;
  }

  const subject = sanitizeString(payload?.subject);
  if (!subject) {
    errors.push("Subject is required.");
  } else if (subject.length < 3) {
    errors.push("Subject must be at least 3 characters.");
  } else if (subject.length > 200) {
    errors.push("Subject cannot exceed 200 characters.");
  } else {
    data.subject = subject;
  }

  const message = sanitizeString(payload?.message);
  if (!message) {
    errors.push("Message is required.");
  } else if (message.length < 10) {
    errors.push("Message must be at least 10 characters.");
  } else if (message.length > 10000) {
    errors.push("Message cannot exceed 10000 characters.");
  } else {
    data.message = message;
  }

  const category = (payload?.category || "other").toString().toLowerCase().trim();
  data.category = VALID_CATEGORIES.has(category) ? category : "other";

  const priority = (payload?.priority || "medium").toString().toLowerCase().trim();
  data.priority = VALID_PRIORITIES.has(priority) ? priority : "medium";

  return {
    valid: errors.length === 0,
    errors,
    data,
  };
}

/**
 * Validates support reply payload.
 */
export function validateSupportReply(payload) {
  const errors = [];
  const data = {};

  const message = sanitizeString(payload?.message);
  if (!message) {
    errors.push("Reply message is required.");
  } else if (message.length < 2) {
    errors.push("Reply message must be at least 2 characters.");
  } else if (message.length > 10000) {
    errors.push("Reply message cannot exceed 10000 characters.");
  } else {
    data.message = message;
  }

  const senderName = sanitizeString(payload?.senderName);
  data.senderName = senderName || "ShopLens Support Team";

  return {
    valid: errors.length === 0,
    errors,
    data,
  };
}

/**
 * Validates ticket status update payload.
 */
export function validateStatusUpdate(payload) {
  const status = (payload?.status || "").toString().toLowerCase().trim();
  if (!VALID_STATUSES.has(status)) {
    return {
      valid: false,
      errors: ["Invalid status. Allowed values: open, in_progress, resolved."],
      data: null,
    };
  }

  return {
    valid: true,
    errors: [],
    data: { status },
  };
}
