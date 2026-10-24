import crypto from "crypto";
import { Buffer } from "buffer";
import Store from "../models/Store.js";
import {
    APP_REQUIRED_SHOPIFY_SCOPES,
    getMissingShopifyScopes,
    parseShopifyScopes,
} from "../utils/shopifyScopes.js";

export const handleAppUninstalled = async (req, res) => {
    try {
        const hmacHeader = req.headers["x-shopify-hmac-sha256"];

        if (!hmacHeader) {
            return res.status(401).json({
                success: false,
                message: "Missing Shopify webhook signature.",
            });
        }

        const secret = process.env.SHOPIFY_API_SECRET;

        if (!secret) {
            console.error("SHOPIFY_API_SECRET is missing.");
            return res.status(500).json({
                success: false,
                message: "Webhook configuration is incomplete.",
            });
        }

        const rawBody = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(JSON.stringify(req.body));

        const digest = crypto
            .createHmac("sha256", secret)
            .update(rawBody)
            .digest("base64");

        const received = Buffer.from(hmacHeader, "utf8");
        const expected = Buffer.from(digest, "utf8");

        if (
            received.length !== expected.length ||
            !crypto.timingSafeEqual(received, expected)
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid Shopify webhook signature.",
            });
        }

        const shop = req.headers["x-shopify-shop-domain"]?.toLowerCase().trim();

        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shopify shop domain is missing.",
            });
        }

        const store = await Store.findOneAndUpdate(
            { shop },
            {
                installed: false,
                uninstalledAt: new Date(),
                accessToken: "",
                refreshToken: "",
                syncStatus: "idle",
                syncLockUntil: null,
                syncLockId: null,
            },
            { returnDocument: "after" }
        );

        if (!store) {
            return res.status(404).json({
                success: false,
                message: "Store not found.",
            });
        }

        console.log(`ShopLens app uninstalled: ${shop}`);

        return res.status(200).json({
            success: true,
            message: "Shop uninstall processed successfully.",
            shop,
        });
    } catch (error) {
        console.error("App uninstall webhook error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to process Shopify uninstall webhook.",
        });
    }
};

export const handleAppScopesUpdate = async (req, res) => {
    try {
        const hmacHeader = req.headers["x-shopify-hmac-sha256"];
        const secret = process.env.SHOPIFY_API_SECRET;

        if (!hmacHeader) {
            return res.status(401).json({
                success: false,
                message: "Missing Shopify webhook signature.",
            });
        }

        if (!secret) {
            console.error("SHOPIFY_API_SECRET is missing.");
            return res.status(500).json({
                success: false,
                message: "Webhook configuration is incomplete.",
            });
        }

        if (!Buffer.isBuffer(req.body)) {
            return res.status(400).json({
                success: false,
                message: "Webhook body must be raw JSON.",
            });
        }

        const digest = crypto
            .createHmac("sha256", secret)
            .update(req.body)
            .digest("base64");
        const received = Buffer.from(hmacHeader, "utf8");
        const expected = Buffer.from(digest, "utf8");

        if (
            received.length !== expected.length ||
            !crypto.timingSafeEqual(received, expected)
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid Shopify webhook signature.",
            });
        }

        let payload;
        try {
            payload = JSON.parse(req.body.toString("utf8"));
        } catch {
            return res.status(400).json({
                success: false,
                message: "Webhook body contains invalid JSON.",
            });
        }

        const shop = String(req.headers["x-shopify-shop-domain"] || "")
            .toLowerCase()
            .trim();
        const currentScopes = payload?.current;

        if (
            !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
            !Array.isArray(currentScopes) ||
            currentScopes.some((scope) => typeof scope !== "string")
        ) {
            return res.status(400).json({
                success: false,
                message: "Webhook shop or granted scopes are invalid.",
            });
        }

        const normalizedScopes = parseShopifyScopes(currentScopes.join(","));
        const missingScopes = getMissingShopifyScopes(
            normalizedScopes.join(","),
            APP_REQUIRED_SHOPIFY_SCOPES
        );
        const syncError = missingScopes.length
            ? `Shopify access is missing required permissions: ${missingScopes.join(", ")}. Reauthorize the app and approve the requested permissions.`
            : null;

        const store = await Store.findOneAndUpdate(
            { shop, installed: true },
            {
                $set: {
                    scope: normalizedScopes.join(","),
                    reauthorizationRequired: missingScopes.length > 0,
                    syncError,
                },
            },
            { returnDocument: "after" }
        );

        if (!store) {
            return res.status(404).json({
                success: false,
                message: "Installed store not found.",
            });
        }

        console.log(`Updated Shopify scopes for ${shop}.`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Shopify scopes update webhook failed:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to update Shopify scopes.",
        });
    }
};