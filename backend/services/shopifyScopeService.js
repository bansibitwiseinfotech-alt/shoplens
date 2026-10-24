import { shopifyGraphQL } from "./shopifyGraphqlService.js";
import { parseShopifyScopes } from "../utils/shopifyScopes.js";

const CURRENT_SCOPES_QUERY = `
  query CurrentGrantedScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

export const fetchCurrentGrantedScopes = async (shop, accessToken) => {
  const data = await shopifyGraphQL({
    shop,
    accessToken,
    query: CURRENT_SCOPES_QUERY,
  });

  const accessScopes = data.currentAppInstallation?.accessScopes;
  if (
    !Array.isArray(accessScopes) ||
    accessScopes.some(
      (scope) => typeof scope?.handle !== "string" || !scope.handle
    )
  ) {
    throw new Error("Shopify did not return the current app installation scopes.");
  }

  return parseShopifyScopes(
    accessScopes.map((scope) => scope?.handle).filter(Boolean).join(",")
  );
};

export { CURRENT_SCOPES_QUERY };
