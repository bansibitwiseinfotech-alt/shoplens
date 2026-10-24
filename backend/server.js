import "dotenv/config";

import app from "./app.js";
import connectDB from "./config/db.js";
import { startScheduledSync } from "./services/scheduledSyncService.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    /*
     * Connect MongoDB first.
     */
    await connectDB();

    /*
     * Start Express server.
     */
    app.listen(PORT, () => {
      console.log(
        `🚀 ShopLens backend running on http://localhost:${PORT}`
      );

      /*
       * Start scheduled Shopify synchronization
       * after the backend is running.
       */
      startScheduledSync();
    });
  } catch (error) {
    console.error(
      "Failed to start server:",
      error.message
    );

    process.exit(1);
  }
};

startServer();