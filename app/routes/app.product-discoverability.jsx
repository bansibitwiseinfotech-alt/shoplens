import { useLoaderData, useSearchParams } from "react-router";
import { Page, BlockStack, Box } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ProductDiscoverabilitySection } from "../../src/components/ProductDiscoverability/index.js";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    return {
      shop: session?.shop || "",
    };
  } catch (_) {
    return {
      shop: "",
    };
  }
};

export default function ProductDiscoverabilityRoute() {
  const { shop } = useLoaderData();
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get("productId") || "";

  return (
    <Page
      title="Product Discoverability"
      subtitle="Detect and fix products that shoppers have trouble finding in your store catalog."
      fullWidth
    >
      <Box
        paddingInline={{ xs: "200", sm: "400", md: "600" }}
        paddingBlockStart="100"
        paddingBlockEnd={{ xs: "300", sm: "400" }}
      >
        <BlockStack gap={{ xs: "300", sm: "400" }}>
          <ProductDiscoverabilitySection
            shop={shop}
            initialProductId={initialProductId}
          />
        </BlockStack>
      </Box>
    </Page>
  );
}
