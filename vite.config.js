import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;
let hmrConfig;

if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  const frontendPort = parseInt(
    process.env.FRONTEND_PORT || process.env.PORT || "3000",
    10
  );
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: frontendPort,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [
      host,
      "localhost",
      "127.0.0.1",
      ".trycloudflare.com",
    ],
    cors: true,
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "src", "node_modules"],
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
      "@": path.resolve(__dirname, "./src"),
      "src": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: [
      "@shopify/app-bridge-react",
      "@shopify/polaris",
      "@shopify/polaris-icons",
    ],
  },
});
