import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import productSyncRoutes from "./routes/productSyncRoutes.js";
import searchIntelligenceRoutes from "./routes/searchIntelligenceRoutes.js";
import syncRoutes from "./routes/syncRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import zeroResultSearchRoutes from "./routes/zeroResultSearch.routes.js";
import searchIntentRoutes from "./routes/searchIntentRoutes.js";
import productDiscoverabilityRoutes from "./routes/productDiscoverabilityRoutes.js";
import collectionMerchandisingRoutes from "./routes/collectionMerchandisingRoutes.js";
import trendingSearchRoutes from "./routes/trendingSearchRoutes.js";
import customerDiscoveryRoutes from "./routes/customerDiscoveryRoutes.js";
import missedSalesOpportunityRoutes from "./routes/missedSalesOpportunityRoutes.js";
import merchandisingRuleRoutes from "./routes/merchandisingRuleRoutes.js";

import merchandisingSimulatorRoutes from "./routes/merchandisingSimulator.routes.js";
import recommendationRoutes from "./routes/recommendation.routes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";

const app = express();

// Security and utility middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Shopify-Shop-Domain",
      "x-shopify-shop-domain",
      "shopify-shop-domain",
      "x-support-token",
      "X-Support-Token",
      "x-staff-token",
      "X-Staff-Token",
      "x-shoplens-internal-signature",
      "X-ShopLens-Internal-Signature",
      "Origin",
      "Accept",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(cookieParser());

// IMPORTANT:
// Shopify webhooks must receive the raw body
// before express.json() parses it.
app.use("/api/webhooks", webhookRoutes);

app.use(
  express.json({
    verify(req, res, buffer) {
      req.rawBody = Buffer.from(buffer);
    },
  })
);
app.use(express.text({ type: ["text/*"] }));
app.use((req, res, next) => {
  if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Request body contains invalid JSON.",
      });
    }
  }
  next();
});

app.use(morgan("dev"));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ShopLens backend is running.",
  });
});


// Sync routes
app.use("/api/sync", syncRoutes);

// Shopify authentication & connection routes
app.use("/api/auth", authRoutes);

// Product sync routes
app.use("/api/sync", productSyncRoutes);

// Search intelligence routes
app.use("/api/search-intelligence", searchIntelligenceRoutes);

// Product discoverability routes
app.use(
  "/api/product-discoverability",
  productDiscoverabilityRoutes
);
app.use(
  "/api/customer-discovery",
  customerDiscoveryRoutes
);
app.use(
  "/api/merchandising",
  collectionMerchandisingRoutes
);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/merchandising", merchandisingRuleRoutes);
app.use(
  "/api/trending-searches",
  trendingSearchRoutes
);

app.use(
  "/api/merchandising-simulator",
  merchandisingSimulatorRoutes
);

app.use(
  "/api/missed-sales-opportunities",
  missedSalesOpportunityRoutes
);

// Search intent routes
app.use("/api/search-intents", searchIntentRoutes);
// Billing routes
app.use("/api/billing", billingRoutes);
// Zero-result search routes
app.use("/api", zeroResultSearchRoutes);
// Dashboard routes
app.use("/api/dashboard", dashboardRoutes);
// Support routes
app.use("/api/support", supportRoutes);
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Request body contains invalid JSON.",
    });
  }

  console.error("Unhandled error:", {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    type: err?.type,
    stack: err?.stack,
  });

  return res.status(err.statusCode || 500).json({
    success: false,
    message:
      err.message || "Unable to connect to ShopLens services. Please try again later.",
  });
});

export default app;