import "dotenv/config";
import {
  verifySmtpConnection,
  getSmtpConfig,
  getTransporter,
} from "../services/supportEmailService.js";

async function runSmtpSmokeTest() {
  console.log("==========================================");
  console.log("🔍 ShopLens SMTP Real Connection Smoke Test");
  console.log("==========================================");

  const config = getSmtpConfig();
  console.log(`Host:            ${config.host}`);
  console.log(`Port:            ${config.port}`);
  console.log(`Secure (TLS):    ${config.secure}`);
  console.log(`User:            ${config.user ? config.user.slice(0, 3) + "***@***" : "NOT CONFIGURED"}`);
  console.log(`From Header:     ${config.from}`);
  console.log(`Support Inbox:   ${config.supportEmail}`);
  console.log("------------------------------------------");
  console.log("Connecting to SMTP server and verifying credentials...");

  const health = await verifySmtpConnection();

  if (health.ok) {
    console.log("✅ SUCCESS: SMTP server accepted connection and authenticated!");
    console.log("Status message:", health.message);
  } else {
    console.error("❌ FAILED: SMTP server rejected connection or credentials.");
    console.error("Code:", health.code);
    console.error("Error message:", health.message);
    process.exit(1);
  }

  // If --send flag is provided, send a live test message
  if (process.argv.includes("--send")) {
    console.log("\nAttempting live test send to support inbox...");
    const transporter = getTransporter();
    try {
      const info = await transporter.sendMail({
        from: config.from,
        to: config.supportEmail,
        subject: "[ShopLens Test] SMTP Smoke Test Verification",
        text: "This is an automated smoke test verifying that ShopLens can send support emails via Nodemailer SMTP.",
        html: "<p><strong>ShopLens Support</strong>: SMTP smoke test message sent successfully.</p>",
      });
      console.log("✅ Live test email sent! Message ID:", info.messageId);
    } catch (err) {
      console.error("❌ Live test send failed:", err.message);
      process.exit(1);
    }
  }

  console.log("==========================================");
  process.exit(0);
}

runSmtpSmokeTest().catch((err) => {
  console.error("Smoke test unexpected error:", err);
  process.exit(1);
});
