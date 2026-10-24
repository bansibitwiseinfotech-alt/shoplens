
export default function merchandisingErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = Number.isInteger(err.status) ? err.status : 500;

  if (status >= 500) {
    console.error("[Smart Merchandising Rules]", err.message);
  }

  return res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "An unexpected merchandising error occurred."
        : err.message,
  });
}
