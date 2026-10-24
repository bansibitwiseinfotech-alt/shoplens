const nodemailer = require("nodemailer");

const requiredVariables = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SUPPORT_EMAIL"
];

function validateSmtpConfig() {
    const missing = requiredVariables.filter(
        (key) => !process.env[key]
    );

    if (missing.length) {
        throw new Error(
            `Missing environment variables: ${missing.join(", ")}`
        );
    }
}

function createTransporter() {
    validateSmtpConfig();

    const port = Number(process.env.SMTP_PORT);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("SMTP_PORT must be a valid port number");
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000
    });
}

module.exports = {
    createTransporter,
    validateSmtpConfig
};