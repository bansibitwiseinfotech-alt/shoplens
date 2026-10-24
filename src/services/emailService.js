const { createTransporter } = require("../config/smtp");

const transporter = createTransporter();

async function verifyEmailConnection() {
    await transporter.verify();
}

async function sendSupportEmails({ name, email, subject, message }) {
    // 1. Send the actual support request to the support team.
    const supportResult = await transporter.sendMail({
        from: {
            name: "ShopLens Support",
            address: process.env.SMTP_FROM
        },
        to: process.env.SUPPORT_EMAIL,
        replyTo: {
            name,
            address: email
        },
        subject: `[ShopLens Support] ${subject}`,
        text: [
            "New ShopLens support request",
            "",
            `Name: ${name}`,
            `Contact email: ${email}`,
            `Subject: ${subject}`,
            "",
            "Message:",
            message
        ].join("\n")
    });

    // 2. Acknowledge the request to the merchant.
    // If this fails, the original support email may still have been sent.
    let confirmationSent = false;

    try {
        await transporter.sendMail({
            from: {
                name: "ShopLens Support",
                address: process.env.SMTP_FROM
            },
            to: email,
            replyTo: process.env.SUPPORT_EMAIL,
            subject: "We received your ShopLens support request",
            text: [
                `Hello ${name},`,
                "",
                "Thank you for contacting ShopLens Support.",
                "We have received your support request.",
                "",
                `Subject: ${subject}`,
                "",
                "Our team will review your message and respond as soon as possible.",
                "",
                "Regards,",
                "ShopLens Support Team"
            ].join("\n")
        });

        confirmationSent = true;
    } catch (error) {
        // Do not pretend the acknowledgment was sent.
        console.error(
            "Support acknowledgment email failed:",
            error.message
        );
    }

    return {
        supportMessageId: supportResult.messageId,
        confirmationSent
    };
}

module.exports = {
    verifyEmailConnection,
    sendSupportEmails
};