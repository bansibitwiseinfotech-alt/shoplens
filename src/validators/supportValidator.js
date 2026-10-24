const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSupportRequest(body = {}) {
    const name = typeof body.name === "string"
        ? body.name.trim()
        : "";

    const email = typeof body.email === "string"
        ? body.email.trim()
        : "";

    const subject = typeof body.subject === "string"
        ? body.subject.trim()
        : "";

    const message = typeof body.message === "string"
        ? body.message.trim()
        : "";

    const errors = [];

    if (name.length < 2 || name.length > 100) {
        errors.push("Name must be between 2 and 100 characters.");
    }

    if (email.length > 254 || !EMAIL_REGEX.test(email)) {
        errors.push("Please provide a valid email address.");
    }

    if (subject.length < 3 || subject.length > 150) {
        errors.push("Subject must be between 3 and 150 characters.");
    }

    if (message.length < 10 || message.length > 5000) {
        errors.push("Message must be between 10 and 5000 characters.");
    }

    return {
        valid: errors.length === 0,
        errors,
        data: { name, email, subject, message }
    };
}

module.exports = { validateSupportRequest };