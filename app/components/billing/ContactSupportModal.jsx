import { useState, useCallback } from "react";
import {
  Modal,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Box,
  TextField,
  Select,
  Banner,
  Link,
  Badge,
} from "@shopify/polaris";
import { submitSupportRequest } from "../../services/supportApi.js";

const CATEGORY_OPTIONS = [
  { label: "Billing & Plans", value: "billing" },
  { label: "Search Intelligence", value: "search_intelligence" },
  { label: "Product Discoverability", value: "product_discoverability" },
  { label: "Smart Merchandising", value: "merchandising" },
  { label: "Technical Issue", value: "technical_issue" },
  { label: "Feature Request", value: "feature_request" },
  { label: "Other / General Question", value: "other" },
];

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

/**
 * Contact Support Modal for ShopLens
 * Connected to live Node.js + MongoDB + SMTP backend.
 * Built 100% with pure Shopify Polaris components.
 */
export default function ContactSupportModal({ open, onClose, shop = "" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("billing");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [apiErrorMessage, setApiErrorMessage] = useState("");

  const validate = useCallback(() => {
    const errors = {};

    if (!name.trim()) {
      errors.name = "Please enter your name.";
    } else if (name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters.";
    } else if (name.trim().length > 100) {
      errors.name = "Name cannot exceed 100 characters.";
    }

    if (!email.trim()) {
      errors.email = "Please enter your contact email.";
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    if (!subject.trim()) {
      errors.subject = "Please enter a subject for your request.";
    } else if (subject.trim().length < 3) {
      errors.subject = "Subject must be at least 3 characters.";
    } else if (subject.trim().length > 200) {
      errors.subject = "Subject cannot exceed 200 characters.";
    }

    if (!message.trim()) {
      errors.message = "Please describe your question or issue in detail.";
    } else if (message.trim().length < 10) {
      errors.message = "Message must be at least 10 characters so we can assist you effectively.";
    } else if (message.trim().length > 10000) {
      errors.message = "Message cannot exceed 10,000 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [name, email, subject, message]);

  const handleSubmit = useCallback(async () => {
    setApiErrorMessage("");

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await submitSupportRequest({
        shop,
        name: name.trim(),
        email: email.trim(),
        category,
        subject: subject.trim(),
        message: message.trim(),
      });

      setSubmissionResult(response);
    } catch (err) {
      setApiErrorMessage(
        err.message ||
          "Failed to submit support request. Please check your connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [shop, name, email, category, subject, message, validate]);

  const handleClose = useCallback(() => {
    if (submissionResult) {
      // Reset form upon successful completion
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setCategory("billing");
      setSubmissionResult(null);
      setFieldErrors({});
    }
    setApiErrorMessage("");
    onClose();
  }, [submissionResult, onClose]);

  const isSuccess = Boolean(submissionResult);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Contact Support — ShopLens"
      size="large"
      primaryAction={
        isSuccess
          ? {
              content: "Done",
              onAction: handleClose,
            }
          : {
              content: "Send Support Request",
              onAction: handleSubmit,
              loading: isSubmitting,
              disabled: isSubmitting,
            }
      }
      secondaryActions={
        isSuccess
          ? []
          : [
              {
                content: "Cancel",
                onAction: handleClose,
                disabled: isSubmitting,
              },
            ]
      }
    >
      <Modal.Section>
        <BlockStack gap="400">
          {/* Header */}
          <BlockStack gap="100">
            <Text variant="headingLg" as="h2" fontWeight="bold">
              Contact Support
            </Text>
            <Text variant="bodySm" tone="subdued">
              Direct assistance from Bitwise Infotech. When you submit a ticket, our engineering team is notified immediately via SMTP and you will receive an email confirmation.
            </Text>
          </BlockStack>

          {/* Success Banner */}
          {isSuccess && (
            <Banner
              title={`Support Ticket Created: #${submissionResult.ticketId}`}
              tone={
                submissionResult.emailStatus === "sent" ? "success" : "info"
              }
            >
              <BlockStack gap="200">
                <Text as="p">
                  Thank you, <strong>{name}</strong>! Your support ticket has been recorded in our system.
                </Text>

                <InlineStack gap="400" blockAlign="center" wrap>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" fontWeight="bold">
                      Ticket ID:
                    </Text>
                    <Badge tone="info">{submissionResult.ticketId}</Badge>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" fontWeight="bold">
                      Email Status:
                    </Text>
                    {submissionResult.emailStatus === "sent" ? (
                      <Badge tone="success">Confirmation Sent</Badge>
                    ) : submissionResult.emailStatus === "partial_failure" ? (
                      <Badge tone="warning">Queued for Delivery</Badge>
                    ) : (
                      <Badge tone="attention">Saved in Database</Badge>
                    )}
                  </InlineStack>
                </InlineStack>

                <Text as="p" tone="subdued">
                  A confirmation email has been dispatched to <strong>{email}</strong>. Our team will review your ticket and reply directly to your email address.
                </Text>
              </BlockStack>
            </Banner>
          )}

          {/* API Error Banner */}
          {apiErrorMessage && (
            <Banner tone="critical" onDismiss={() => setApiErrorMessage("")}>
              <p>{apiErrorMessage}</p>
            </Banner>
          )}

          {/* Developer & Contact Info Box */}
          <Box
            background="bg-surface-secondary"
            padding="300"
            borderRadius="200"
            borderWidth="025"
            borderColor="border"
          >
            <BlockStack gap="100">
              <Text variant="bodyMd" as="p">
                <strong>App:</strong> ShopLens — Store Intelligence & Product Discovery
              </Text>
              <Text variant="bodyMd" as="p">
                <strong>Developer:</strong> Bitwise Infotech, Rajkot, Gujarat, India
              </Text>
              <Text variant="bodyMd" as="p">
                <strong>Support Desk:</strong>{" "}
                <Link url="mailto:support@bitwiseinfotech.com">
                  support@bitwiseinfotech.com
                </Link>{" "}
                (Average response time: within 24 hours)
              </Text>
            </BlockStack>
          </Box>

          {!isSuccess && (
            <BlockStack gap="300">
              {/* Row 1: Name and Email */}
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                <TextField
                  label="Your Name"
                  value={name}
                  onChange={(val) => {
                    setName(val);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: null }));
                  }}
                  autoComplete="name"
                  placeholder="e.g. Alex Smith"
                  requiredIndicator
                  error={fieldErrors.name}
                  disabled={isSubmitting}
                />

                <TextField
                  label="Contact Email"
                  type="email"
                  value={email}
                  onChange={(val) => {
                    setEmail(val);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
                  }}
                  autoComplete="email"
                  placeholder="merchant@example.com"
                  helpText="We will send your ticket confirmation and reply here."
                  requiredIndicator
                  error={fieldErrors.email}
                  disabled={isSubmitting}
                />
              </InlineGrid>

              {/* Row 2: Category and Subject */}
              <InlineGrid columns={{ xs: 1, sm: "1fr 2fr" }} gap="300">
                <Select
                  label="Category"
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={setCategory}
                  disabled={isSubmitting}
                />

                <TextField
                  label="Subject"
                  value={subject}
                  onChange={(val) => {
                    setSubject(val);
                    if (fieldErrors.subject) setFieldErrors((prev) => ({ ...prev, subject: null }));
                  }}
                  autoComplete="off"
                  placeholder="e.g. Question about search trends or plan limits"
                  requiredIndicator
                  error={fieldErrors.subject}
                  disabled={isSubmitting}
                />
              </InlineGrid>

              {/* Row 3: Message */}
              <TextField
                label="Message / Issue Description"
                value={message}
                onChange={(val) => {
                  setMessage(val);
                  if (fieldErrors.message) setFieldErrors((prev) => ({ ...prev, message: null }));
                }}
                multiline={5}
                autoComplete="off"
                placeholder="Describe what you need help with, any specific product or search term involved, and steps to reproduce..."
                helpText={`${message.length}/10,000 characters`}
                requiredIndicator
                error={fieldErrors.message}
                disabled={isSubmitting}
              />
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
