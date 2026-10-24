/**
 * One-time script to sync all Shopify orders into tbl_merchandising_events.
 * Run: node run_sync.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Connect
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/db_shoplens');
console.log('[Sync] Connected to MongoDB');

// Run sync
const { syncMerchandisingFromOrders } = await import('./services/merchandisingSyncService.js');

const shop = 'promobile-hub.myshopify.com';
console.log(`[Sync] Starting sync for ${shop}...`);

try {
  const result = await syncMerchandisingFromOrders(shop);
  console.log('[Sync] ✅ Complete!', result);
} catch (err) {
  console.error('[Sync] ❌ Error:', err.message);
  if (err.stack) console.error(err.stack);
}

await mongoose.disconnect();
console.log('[Sync] Disconnected from MongoDB');
