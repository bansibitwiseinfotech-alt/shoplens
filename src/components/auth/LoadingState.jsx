import { BlockStack, Box, Card, Spinner, Text } from "@shopify/polaris";

/**
 * Loading state component displaying clear status messages during asynchronous actions.
 * 
 * @param {Object} props
 * @param {string} [props.title="Connecting ShopLens..."] - Loading heading
 * @param {string} [props.message="Please wait while we connect your Shopify store."] - Informative message
 */
export const LoadingState = ({
  title = "Connecting ShopLens...",
  message = "Please wait while we connect your Shopify store.",
}) => {
  return (
    <Card>
      <Box padding="800">
        <BlockStack align="center" inlineAlign="center" gap="400">
          <Spinner accessibilityLabel={title} size="large" />
          <BlockStack align="center" inlineAlign="center" gap="200">
            <Text variant="headingMd" as="h2" alignment="center">
              {title}
            </Text>
            <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
              {message}
            </Text>
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
  );
};

export default LoadingState;
