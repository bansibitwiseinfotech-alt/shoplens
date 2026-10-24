import {
  Modal,
  BlockStack,
  Text,
  Box,
  Divider,
} from "@shopify/polaris";

/**
 * Terms & Conditions Modal for ShopLens
 * Built with pure Shopify Polaris components.
 */
export default function TermsModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Terms & Conditions — ShopLens"
      size="large"
      primaryAction={{
        content: "Close",
        onAction: onClose,
      }}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingXl" as="h2" fontWeight="bold">
              ShopLens Terms &amp; Conditions
            </Text>
            <Text variant="bodySm" tone="subdued">
              Last Updated: September 1, 2026
            </Text>
          </BlockStack>

          <Text variant="bodyMd" as="p">
            Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before installing or using the <strong>ShopLens</strong> Shopify App (&ldquo;App&rdquo; or &ldquo;Service&rdquo;). By installing, accessing, or using the App, you (&ldquo;Merchant&rdquo;, &ldquo;you&rdquo;, or &ldquo;your&rdquo;) agree to be bound by these Terms. The Service is provided by <strong>Bitwise Infotech</strong>, located in Rajkot, Gujarat, India.
          </Text>

          <Divider />

          {/* Section 1 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              1. Acceptance of Terms
            </Text>
            <Text variant="bodyMd" as="p">
              By installing ShopLens through the Shopify App Store, you acknowledge that you have read, understood, and agreed to these Terms and our Privacy Policy. If you do not agree to these Terms, you must immediately uninstall the App from your Shopify store.
            </Text>
          </BlockStack>

          <Divider />

          {/* Section 2 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              2. Description of Service
            </Text>
            <Text variant="bodyMd" as="p">
              ShopLens is a Shopify application designed to help merchants understand customer search behavior, optimize product discoverability, eliminate zero-result search dropoffs, and automate store merchandising through:
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • Search Intelligence &amp; Customer Query Analytics
                </Text>
                <Text variant="bodyMd" as="p">
                  • Search Trends &amp; Day-by-Day Historical Performance
                </Text>
                <Text variant="bodyMd" as="p">
                  • Product Discoverability &amp; Catalog Search Conversion Tracking
                </Text>
                <Text variant="bodyMd" as="p">
                  • Zero-Result Search Identification &amp; Missing Demand Detection
                </Text>
                <Text variant="bodyMd" as="p">
                  • Collection Merchandising &amp; Demand-Based Product Ordering
                </Text>
                <Text variant="bodyMd" as="p">
                  • Search Intent Analyzer (Informational, Navigational, Commercial, Transactional)
                </Text>
                <Text variant="bodyMd" as="p">
                  • Smart Merchandising Rules &amp; Merchandising Simulator Scenarios
                </Text>
                <Text variant="bodyMd" as="p">
                  • Merchandising Recommendations &amp; Customer Discovery Journeys
                </Text>
              </BlockStack>
            </Box>
            <Text variant="bodySm" tone="subdued" as="p">
              We reserve the right to modify, improve, suspend, or discontinue any feature of the Service at any time.
            </Text>
          </BlockStack>

          <Divider />

          {/* Section 3 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              3. Merchant Responsibilities
            </Text>
            <Text variant="bodyMd" as="p">
              As a merchant using ShopLens, you agree to:
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • Comply with all applicable laws, regulations, and industry standards.
                </Text>
                <Text variant="bodyMd" as="p">
                  • Maintain accurate store configurations and ensure appropriate permissions for store data synchronization.
                </Text>
                <Text variant="bodyMd" as="p">
                  • Use the Service strictly for lawful e-commerce analytics and store management.
                </Text>
                <Text variant="bodyMd" as="p">
                  • Not reverse engineer, decompile, copy, distribute, or create derivative works based on the App or its proprietary algorithms.
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>

          <Divider />

          {/* Section 4 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              4. Subscription Plans &amp; Billing
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • ShopLens offers tiered subscription plans (Free, Pro, and Premium) with distinct usage quotas and feature access.
                </Text>
                <Text variant="bodyMd" as="p">
                  • All subscription charges and billing cycles are processed exclusively through the Shopify Billing API in accordance with Shopify&apos;s merchant billing policies.
                </Text>
                <Text variant="bodyMd" as="p">
                  • Paid subscriptions renew automatically each month or year depending on your chosen billing cycle, unless cancelled or downgraded prior to the renewal date.
                </Text>
                <Text variant="bodyMd" as="p">
                  • Plan upgrades and downgrades take effect immediately, with prorated adjustments handled automatically by Shopify Billing.
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>

          <Divider />

          {/* Section 5 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              5. Intellectual Property &amp; Store Data
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • Bitwise Infotech retains all rights, title, and interest in and to ShopLens, including software, code, algorithms, user interfaces, and trademarks.
                </Text>
                <Text variant="bodyMd" as="p">
                  • You retain all ownership rights to your store data, product catalog, sales figures, and search records. You grant ShopLens a limited license to process this data solely to compute search analytics and deliver the Service.
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>

          <Divider />

          {/* Section 6 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              6. Disclaimers &amp; Limitation of Liability
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • ShopLens is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties of any kind, whether express or implied.
                </Text>
                <Text variant="bodyMd" as="p">
                  • While ShopLens computes search trends and merchandising metrics based on storefront customer data, the Service is for analytical and decision-support purposes only.
                </Text>
                <Text variant="bodyMd" as="p">
                  • To the fullest extent permitted by law, Bitwise Infotech shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of revenue, profits, or data.
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>

          <Divider />

          {/* Section 7 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              7. Termination
            </Text>
            <Text variant="bodyMd" as="p">
              You may terminate this agreement at any time by uninstalling ShopLens from your Shopify admin. Upon uninstallation, your active recurring subscription will be cancelled via Shopify Billing. Bitwise Infotech reserves the right to suspend or terminate service access in the event of any breach of these Terms.
            </Text>
          </BlockStack>

          <Divider />

          {/* Section 8 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              8. Contact Us
            </Text>
            <Text variant="bodyMd" as="p">
              If you have questions regarding these Terms &amp; Conditions or the ShopLens service, please contact us:
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="100">
                <Text variant="bodyMd" as="p">
                  <strong>App:</strong> ShopLens
                </Text>
                <Text variant="bodyMd" as="p">
                  <strong>Developer:</strong> Bitwise Infotech, Rajkot, Gujarat, India
                </Text>
                <Text variant="bodyMd" as="p">
                  <strong>Support Email:</strong> support@bitwiseinfotech.com
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
