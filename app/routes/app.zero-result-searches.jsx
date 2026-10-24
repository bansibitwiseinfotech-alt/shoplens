import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import ZeroResultSearch from "../../src/pages/ZeroResultSearch.jsx";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [
    { rel: "stylesheet", href: polarisStyles },
];

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

export default function ZeroResultSearchesRoute() {
    const data = useLoaderData();
    return <ZeroResultSearch shop={data?.shop} />;
}
                                  