import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Button,
  Banner,
  BlockStack,
  Box,
  InlineStack,
} from "@shopify/polaris";
import LoadingState from "../../components/auth/LoadingState.jsx";
import ConnectionStatus from "../../components/auth/ConnectionStatus.jsx";
import {
  normalizeShop,
  isValidShopDomain,
  testConnection,
  checkAuthStatus,
  initiateInstall,
} from "../../services/authApi.js";

/**
 * Main Authentication & Shopify Connection Page.
 * Coordinates OAuth initiation, authentication verification, loading states, and error handling.
 */
export const Authentication = () => {
  const [shopInput, setShopInput] = useState("");
  const [activeShop, setActiveShop] = useState("");
  const [storeData, setStoreData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Loading states
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState({
    title: "Checking authentication...",
    message: "Verifying your Shopify store connection status.",
  });

  // Error states
  const [errorMessage, setErrorMessage] = useState("");
  const [successBanner, setSuccessBanner] = useState("");

  // Extract shop from URL query on initial mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopFromQuery = params.get("shop");
    const errorFromQuery = params.get("error");

    if (errorFromQuery) {
      if (errorFromQuery === "invalid_shop") {
        setErrorMessage("Invalid Shopify store domain.");
      } else if (errorFromQuery === "state_mismatch") {
        setErrorMessage("Authentication session expired. Please restart the connection.");
      } else {
        setErrorMessage("Shopify authentication failed. Please try connecting your store again.");
      }
    }

    if (shopFromQuery) {
      const normalized = normalizeShop(shopFromQuery);
      setShopInput(normalized);
      setActiveShop(normalized);
    } else {
      setIsLoadingAuth(false);
    }
  }, []);

  // Verify connection when activeShop changes
  const verifyConnection = useCallback(async (shopToVerify) => {
    if (!shopToVerify || !isValidShopDomain(shopToVerify)) {
      setIsLoadingAuth(false);
      return;
    }

    setIsLoadingAuth(true);
    setLoadingMessage({
      title: "Loading store information...",
      message: "Fetching store details from Shopify Admin GraphQL API.",
    });
    setErrorMessage("");

    try {
      // First verify status in MongoDB
      const statusRes = await checkAuthStatus(shopToVerify);

      if (statusRes.authenticated) {
        // Now test live connection via GraphQL
        const testRes = await testConnection(shopToVerify);

        if (testRes.success && testRes.connected && testRes.shop) {
          setStoreData(testRes.shop);
          setIsConnected(true);
        } else {
          setIsConnected(false);
          setErrorMessage(testRes.message || "Shopify authentication failed. Please try connecting your store again.");
        }
      } else {
        setIsConnected(false);
      }
    } catch (err) {
      setErrorMessage("Unable to connect to ShopLens services. Please try again later.");
      setIsConnected(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (activeShop) {
      verifyConnection(activeShop);
    }
  }, [activeShop, verifyConnection]);

  // Handle "Connect Shop" click
  const handleConnectShop = () => {
    setErrorMessage("");
    const normalized = normalizeShop(shopInput);

    if (!normalized || !isValidShopDomain(normalized)) {
      setErrorMessage("Invalid Shopify store domain.");
      return;
    }

    setIsConnecting(true);
    setLoadingMessage({
      title: "Connecting ShopLens...",
      message: "Please wait while we connect your Shopify store.",
    });

    try {
      // Backend handles OAuth exchange
      initiateInstall(normalized);
    } catch (err) {
      setIsConnecting(false);
      setErrorMessage("Unable to connect to Shopify. Please try again.");
    }
  };

  // Handle "Test Connection" button click
  const handleTestConnection = async () => {
    if (!activeShop) return;
    setIsTesting(true);
    setErrorMessage("");
    setSuccessBanner("");

    try {
      const result = await testConnection(activeShop);
      if (result.success && result.connected && result.shop) {
        setStoreData(result.shop);
        setIsConnected(true);
        setSuccessBanner("Shopify connection successfully verified via GraphQL API.");
      } else {
        setErrorMessage(result.message || "Unable to connect to Shopify. Please try again.");
      }
    } catch (err) {
      setErrorMessage("Unable to connect to ShopLens services. Please try again later.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleReconnect = () => {
    setIsConnected(false);
    setStoreData(null);
  };

  return (
    <Page title="ShopLens" subtitle="Store Intelligence & Product Discovery">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {errorMessage && (
              <Banner
                title="Authentication Notice"
                tone="critical"
                onDismiss={() => setErrorMessage("")}
              >
                <p>{errorMessage}</p>
              </Banner>
            )}

            {successBanner && (
              <Banner
                title="Connection Verified"
                tone="success"
                onDismiss={() => setSuccessBanner("")}
              >
                <p>{successBanner}</p>
              </Banner>
            )}

            {/* Loading States */}
            {(isLoadingAuth || isConnecting) && (
              <LoadingState
                title={loadingMessage.title}
                message={loadingMessage.message}
              />
            )}

            {/* Authenticated State */}
            {!isLoadingAuth && !isConnecting && isConnected && storeData && (
              <ConnectionStatus
                store={storeData}
                isConnected={isConnected}
                onTestConnection={handleTestConnection}
                onReconnect={handleReconnect}
                isTesting={isTesting}
              />
            )}

            {/* Unauthenticated / Connect Screen */}
            {!isLoadingAuth && !isConnecting && !isConnected && (
              <Card>
                <Box padding="600">
                  <BlockStack gap="500">
                    <BlockStack gap="200">
                      <Text variant="headingLg" as="h1">
                        Connect your Shopify store
                      </Text>
                      <Text variant="bodyMd" tone="subdued" as="p">
                        Connect your store to enable ShopLens real-time intelligence, product discovery, and order analytics.
                      </Text>
                    </BlockStack>

                    <BlockStack gap="400">
                      <TextField
                        label="Shopify store domain"
                        value={shopInput}
                        onChange={setShopInput}
                        placeholder="your-store.myshopify.com"
                        autoComplete="off"
                        helpText="Enter your myshopify.com domain (e.g. store.myshopify.com)"
                      />

                      <InlineStack align="start">
                        <Button
                          variant="primary"
                          size="large"
                          onClick={handleConnectShop}
                        >
                          Connect Shop
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Authentication;
