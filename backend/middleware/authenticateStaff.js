import crypto from "crypto";

/**
 * Middleware to restrict support admin/staff endpoints.
 * Requires a valid staff secret passed in `x-support-token` or `Authorization: Bearer <token>`.
 * Compares against SUPPORT_STAFF_SECRET or INTERNAL_API_SECRET using constant-time comparison.
 */
export const authenticateStaff = (req, res, next) => {
  const configuredSecret =
    process.env.SUPPORT_STAFF_SECRET || process.env.INTERNAL_API_SECRET;

  if (!configuredSecret) {
    console.error("Staff authentication failed: SUPPORT_STAFF_SECRET or INTERNAL_API_SECRET is not configured in environment.");
    return res.status(500).json({
      success: false,
      message: "Support staff authentication is not configured on the server.",
    });
  }

  // Extract token from header: x-support-token, x-staff-token, or Authorization: Bearer <token>
  let providedToken =
    req.headers["x-support-token"] || req.headers["x-staff-token"];

  if (!providedToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      providedToken = parts[1];
    }
  }

  if (!providedToken || typeof providedToken !== "string") {
    return res.status(401).json({
      success: false,
      message: "Staff authentication required. Missing support authorization token.",
    });
  }

  try {
    const bufProvided = Buffer.from(providedToken.trim());
    const bufConfigured = Buffer.from(configuredSecret.trim());

    if (
      bufProvided.length !== bufConfigured.length ||
      !crypto.timingSafeEqual(bufProvided, bufConfigured)
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid support staff authorization token.",
      });
    }

    req.staff = {
      role: "support_staff",
      authenticatedAt: new Date(),
    };

    return next();
  } catch (error) {
    console.error("Staff authentication error:", error.message);
    return res.status(403).json({
      success: false,
      message: "Authorization verification failed.",
    });
  }
};

export default authenticateStaff;
