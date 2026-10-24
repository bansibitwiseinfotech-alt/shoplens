import {
  Modal,
  BlockStack,
  Text,
  Box,
  Divider,
} from "@shopify/polaris";

/**
 * Privacy Policy Modal for ShopLens
 * Built with pure Shopify Polaris components.
 */
export default function PrivacyPolicyModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Privacy Policy — ShopLens"
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
              ShopLens Privacy Policy
            </Text>
            <Text variant="bodySm" tone="subdued">
              Last Updated: September 1, 2026
            </Text>
          </BlockStack>

          <Text variant="bodyMd" as="p">
            This Privacy Policy describes how <strong>ShopLens</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, stores, and shares your information when you install and use our Shopify App. This app is developed and operated by <strong>Bitwise Infotech</strong>, located in Rajkot, Gujarat, India.
          </Text>

          <Divider />

          {/* Section 1 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              1. Information We Collect
            </Text>
            <Text variant="bodyMd" as="p">
              When you install and use the App, we may access and collect certain information from your Shopify store, including:
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • <strong>Store Information:</strong> Shop domain, store name, email address, subscription plan details, and billing information.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Customer Search &amp; Interaction Events:</strong> Search queries, normalized search keywords, product click events, add-to-cart events, search-attributed purchases, and zero-result search events recorded via the storefront search experience.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Product &amp; Catalog Data:</strong> Product IDs, titles, handles, collection memberships, prices, inventory availability, and product statuses required for search intelligence, product discoverability, and collection merchandising.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Order &amp; Conversion Data:</strong> Order IDs, line items, timestamps, and search attribution data used strictly to measure search conversion rates and customer discovery journeys.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Merchant Configuration:</strong> Merchandising rules, simulator configurations, boost/hide rules, search intent settings, and selected subscription tier.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Analytics &amp; Usage Data:</strong> App interaction metrics, report views, simulator runs, and export requests to monitor and improve service reliability.
                </Text>
              </BlockStack>
            </Box>
            <Text variant="bodySm" tone="subdued" as="p">
              ShopLens only accesses the minimum Shopify store data necessary to provide app functionality.
            </Text>
          </BlockStack>

          <Divider />

          {/* Section 2 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              2. How We Use Your Information
            </Text>
            <Text variant="bodyMd" as="p">
              We use the information we collect to:
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • <strong>Search Intelligence &amp; Trends:</strong> Analyze search volume, track popular customer queries, identify search performance trends, and compute click-to-purchase conversion rates.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Product Discoverability:</strong> Evaluate which catalog items are successfully discovered and purchased by storefront shoppers.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Zero-Result Search Analysis:</strong> Detect search queries that yielded zero products to help merchants discover missing catalog demand and optimize keywords.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Collection Merchandising:</strong> Optimize collection product sorting based on actual customer search demand and engagement data.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Search Intent Analyzer:</strong> Categorize customer search phrases into actionable purchase intents (informational, navigational, commercial, transactional).
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Smart Merchandising Rules &amp; Simulation:</strong> Enable merchants to test and automate product boosting, pinning, and ordering rules.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Subscription Management:</strong> Manage app plan quotas, billing cycles, and feature access via the Shopify Billing API.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Security &amp; Protection:</strong> Detect, prevent, and mitigate fraud, security incidents, and unauthorized use of the Service.
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>

          <Divider />

          {/* Section 3 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              3. What We Do Not Use, Store, or Share
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • We do not sell, rent, share, or use merchant or customer data for advertising, profiling, or unrelated commercial purposes. All access is limited to functionality required by the ShopLens Shopify App.
                </Text>
                <Text variant="bodyMd" as="p">
                  • We do not collect or store your customers&apos; payment card or sensitive financial information.
                </Text>
                <Text variant="bodyMd" as="p">
                  • We do not use customer data for advertising, profiling, resale, or independent marketing purposes.
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>

          <Divider />

          {/* Section 4 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              4. Sharing Your Information
            </Text>
            <Text variant="bodyMd" as="p">
              We may share information only with:
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • <strong>Shopify:</strong> To comply with Shopify platform requirements, billing APIs, and authentication services.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Service Providers:</strong> Trusted third-party vendors including cloud hosting infrastructure providers, MongoDB database services, and error monitoring providers.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>Legal Requirements:</strong> When required by law, regulation, legal process, or governmental request.
                </Text>
              </BlockStack>
            </Box>
            <Text variant="bodySm" tone="subdued" as="p">
              All service providers are authorized to process information only as necessary to provide services on our behalf and are required to maintain appropriate confidentiality and security measures.
            </Text>
          </BlockStack>

          <Divider />

          {/* Section 5 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              5. Your Rights
            </Text>
            <Text variant="bodyMd" as="p">
              Depending on your location and applicable laws, you may have the right to access personal information we hold about you, request correction of inaccurate information, or request deletion of your information. For users in the EEA, UK, and similar jurisdictions, we process personal data under legitimate interests and contractual necessity required to provide the Service.
            </Text>
            <Text variant="bodyMd" as="p">
              To request deletion of your information, contact <strong>support@bitwiseinfotech.com</strong>. We will respond within a reasonable timeframe.
            </Text>
          </BlockStack>

          <Divider />

          {/* Section 6 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              6. Data Storage, Security &amp; Retention
            </Text>
            <Box paddingInlineStart="300">
              <BlockStack gap="150">
                <Text variant="bodyMd" as="p">
                  • We securely store application data using trusted cloud infrastructure, including MongoDB databases.
                </Text>
                <Text variant="bodyMd" as="p">
                  • Data is transmitted using encrypted HTTPS connections and access is restricted to authorized personnel.
                </Text>
                <Text variant="bodyMd" as="p">
                  • We implement commercially reasonable security measures to protect information from unauthorized access or disclosure.
                </Text>
                <Text variant="bodyMd" as="p">
                  • We retain your information while your shop is registered with the App and for up to 45 days after uninstallation for backup recovery, fraud prevention, dispute resolution, and legal compliance. Merchant data is deleted or anonymized after the retention period unless retention is required by law.
                </Text>
                <Text variant="bodyMd" as="p">
                  • <strong>ShopLens fully complies with Shopify&apos;s mandatory GDPR/CCPA webhooks:</strong> <code>app/uninstalled</code>, <code>shop/redact</code>, <code>customers/data_request</code>, and <code>customers/redact</code>.
                </Text>
              </BlockStack>
            </Box>
          </BlockStack>

          <Divider />

          {/* Section 7 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              7. Changes to This Privacy Policy
            </Text>
            <Text variant="bodyMd" as="p">
              We may update this Privacy Policy from time to time to reflect changes in our practices or App functionality. Continued use of the App constitutes acceptance of the revised policy.
            </Text>
          </BlockStack>

          <Divider />

          {/* Section 8 */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="bold">
              8. Contact Us
            </Text>
            <Text variant="bodyMd" as="p">
              If you have questions regarding this Privacy Policy, your store data, or would like to request explicit data deletion, please contact our support team:
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
