import {
  shopifyBackendRequest,
  getBackendApiUrl,
  BackendRequestError,
} from "./shopifyBackendApi.js";

const STAFF_TOKEN_STORAGE_KEY = "shoplens_support_staff_token";

export function getStoredStaffToken() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage?.getItem(STAFF_TOKEN_STORAGE_KEY) || "";
}

export function setStoredStaffToken(token) {
  if (typeof window === "undefined") return;
  if (!token) {
    window.sessionStorage?.removeItem(STAFF_TOKEN_STORAGE_KEY);
  } else {
    window.sessionStorage?.setItem(STAFF_TOKEN_STORAGE_KEY, token.trim());
  }
}

/**
 * Merchant: Submit a new support request.
 */
export async function submitSupportRequest({
  shop,
  name,
  email,
  subject,
  message,
  category = "other",
  priority = "medium",
}) {
  return shopifyBackendRequest("/api/support/requests", {
    shop,
    method: "POST",
    body: {
      merchantName: name,
      merchantEmail: email,
      subject,
      message,
      category,
      priority,
    },
  });
}

/**
 * Merchant: List current merchant's support tickets.
 */
export async function getMerchantSupportRequests({ shop, page = 1, limit = 10, status = "" } = {}) {
  const query = new URLSearchParams({ page, limit });
  if (status && status !== "all") query.set("status", status);

  return shopifyBackendRequest(`/api/support/requests?${query.toString()}`, {
    shop,
    method: "GET",
  });
}

/**
 * Merchant: Get a specific ticket by ticket ID.
 */
export async function getMerchantTicketById({ shop, ticketId }) {
  return shopifyBackendRequest(`/api/support/requests/${ticketId}`, {
    shop,
    method: "GET",
  });
}

/**
 * Helper for staff requests passing x-support-token.
 */
async function staffRequest(path, { method = "GET", body, staffToken } = {}) {
  const token = staffToken || getStoredStaffToken();
  const url = `${getBackendApiUrl().replace(/\/+$/, "")}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-support-token": token,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new BackendRequestError(
      `Cannot connect to backend server at ${getBackendApiUrl()}.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new BackendRequestError(
      "Backend returned invalid response.",
      { status: response.status }
    );
  }

  if (!response.ok || data?.success === false) {
    throw new BackendRequestError(
      data?.message || `Request failed with status ${response.status}`,
      { status: response.status, response: data }
    );
  }

  return data;
}

/**
 * Staff: List all support tickets with filtering, search, and pagination.
 */
export async function getAdminSupportRequests({
  page = 1,
  limit = 20,
  status = "all",
  priority = "all",
  category = "all",
  search = "",
  staffToken,
} = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status && status !== "all") params.set("status", status);
  if (priority && priority !== "all") params.set("priority", priority);
  if (category && category !== "all") params.set("category", category);
  if (search) params.set("search", search);

  return staffRequest(`/api/support/admin/requests?${params.toString()}`, {
    method: "GET",
    staffToken,
  });
}

/**
 * Staff: Get full ticket details with email logs.
 */
export async function getAdminTicketById({ ticketId, staffToken }) {
  return staffRequest(`/api/support/admin/requests/${ticketId}`, {
    method: "GET",
    staffToken,
  });
}

/**
 * Staff: Update ticket status (open, in_progress, resolved).
 */
export async function updateAdminTicketStatus({ ticketId, status, staffToken }) {
  return staffRequest(`/api/support/admin/requests/${ticketId}/status`, {
    method: "PATCH",
    body: { status },
    staffToken,
  });
}

/**
 * Staff: Send a reply to the merchant via SMTP.
 */
export async function sendAdminSupportReply({
  ticketId,
  message,
  senderName = "ShopLens Support Team",
  staffToken,
}) {
  return staffRequest(`/api/support/admin/requests/${ticketId}/replies`, {
    method: "POST",
    body: { message, senderName },
    staffToken,
  });
}

/**
 * Staff: Get email delivery history for a ticket.
 */
export async function getAdminTicketEmailLogs({ ticketId, staffToken }) {
  return staffRequest(`/api/support/admin/requests/${ticketId}/emails`, {
    method: "GET",
    staffToken,
  });
}

/**
 * Staff: Retry sending a failed email.
 */
export async function retryAdminEmail({ ticketId, emailLogId, staffToken }) {
  return staffRequest(`/api/support/admin/requests/${ticketId}/retry-email`, {
    method: "POST",
    body: { emailLogId },
    staffToken,
  });
}

/**
 * Staff: Check SMTP health and connection.
 */
export async function checkAdminEmailHealth({ staffToken } = {}) {
  return staffRequest("/api/support/admin/email-health", {
    method: "GET",
    staffToken,
  });
}
