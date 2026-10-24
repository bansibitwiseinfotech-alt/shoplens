import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  Box,
  Divider,
} from "@shopify/polaris";

/**
 * Displays live Shopify connection status and store details retrieved from the backend API.
 * 
 * @param {Object} props
 * @param {Object} props.store - Store information from backend/Shopify API
 * @param {string} props.store.name - Real store name
 * @param {string} props.store.myshopifyDomain - Real myshopify domain
 * @param {string} props.store.currencyCode - Store currency (e.g., INR, USD)
 * @param {boolean} props.isConnected - Whether the store is active and verified
 * @param {Function} props.onTestConnection - Function to re-test connection via GraphQL
 * @param {Function} props.onReconnect - Function to trigger re-authentication if needed
 * @param {boolean} props.isTesting - Whether a test connection call is in flight
 */
export const ConnectionStatus = ({
  store,
  isConnected = true,
  onTestConnection,
  onReconnect,
  isTesting = false,
}) => {
  const storeName = store?.name || "Unknown Store";
  const shopDomain = store?.myshopifyDomain || store?.shop || "N/A";
  const currency = store?.currencyCode || "N/A";
  const statusLabel = isConnected ? "Connected" : "Disconnected";

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">
              Shopify Store
            </Text>
            <Text variant="bodySm" tone="subdued" as="p">
              Real-time synchronization status with Shopify Admin GraphQL API
            </Text>
          </BlockStack>
          <Badge tone={isConnected ? "success" : "critical"}>
            {statusLabel}
          </Badge>
        </InlineStack>

        {isConnected && (
          <Banner title="Shopify Store Connected" tone="success">
            <p>
              Your store <strong>{shopDomain}</strong> is successfully connected to ShopLens.
            </p>
          </Banner>
        )}

        <Divider />

        <Box paddingBlock="200">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                Store Name
              </Text>
              <Text variant="bodyMd" as="span">
                {storeName}
              </Text>
            </InlineStack>

            <InlineStack align="space-between">
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                Shop Domain
              </Text>
              <Text variant="bodyMd" as="span">
                {shopDomain}
              </Text>
            </InlineStack>

            <InlineStack align="space-between">
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                Currency
              </Text>
              <Text variant="bodyMd" as="span">
                {currency}
              </Text>
            </InlineStack>

            <InlineStack align="space-between">
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                Status
              </Text>
              <Badge tone={isConnected ? "success" : "critical"}>
                {statusLabel}
              </Badge>
            </InlineStack>
          </BlockStack>
        </Box>

        <Divider />

        <InlineStack align="end" gap="300">
          {onReconnect && (
            <Button onClick={onReconnect} variant="plain" tone="critical">
              Reconnect Store
            </Button>
          )}
          {onTestConnection && (
            <Button
              onClick={onTestConnection}
              loading={isTesting}
              variant="primary"
            >
              Test Connection
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
};

export default ConnectionStatus;
