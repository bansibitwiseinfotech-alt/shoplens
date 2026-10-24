/**
 * Diagnostic: Check which collections have products that appear in orders.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/db_shoplens');
const db = mongoose.connection.db;

// Collections with no events
const noEventCollectionIds = [
  "gid://shopify/Collection/296407400535", // Automated Collection
  "gid://shopify/Collection/296407433303", // Hydrogen
  "gid://shopify/Collection/296437973079", // sony
  "gid://shopify/Collection/296437809239", // gi
  "gid://shopify/Collection/296437612631", // realme
  "gid://shopify/Collection/298370891863", // Digital Goods VAT Tax
  "gid://shopify/Collection/298881122391", // Clearance
  "gid://shopify/Collection/296437547095", // oppo
];

const allCollections = await db.collection('tbl_collections').find({
  shopifyCollectionId: { $in: noEventCollectionIds }
}).toArray();

console.log('\n=== Collections with 0 events ===');
for (const col of allCollections) {
  console.log(`\n${col.title} (${col.shopifyCollectionId})`);
  console.log(`  Products: ${col.productIds?.length || 0}`);
  if (col.productIds?.length > 0) {
    console.log(`  Sample product IDs:`, col.productIds.slice(0, 3));
  }
}

// Check if any products from those collections appear in existing merchandising events
const allProductIds = allCollections.flatMap(c => c.productIds || []);
console.log('\n=== Total unique products in no-event collections:', new Set(allProductIds).size);

if (allProductIds.length > 0) {
  const eventsForProducts = await db.collection('tbl_merchandising_events').find({
    productId: { $in: allProductIds }
  }).limit(5).toArray();
  
  console.log('\n=== Events for products in no-event collections:', eventsForProducts.length, '(sample)');
  if (eventsForProducts.length > 0) {
    console.log('Sample event:', JSON.stringify(eventsForProducts[0], null, 2));
  }
}

// Check existing purchase events total by collection
const purchasesByCollection = await db.collection('tbl_merchandising_events').aggregate([
  { $match: { eventType: 'purchase' } },
  { $group: { _id: '$collectionId', count: { $sum: 1 }, totalRev: { $sum: '$revenue' } } },
  { $sort: { totalRev: -1 } }
]).toArray();

console.log('\n=== Purchase events by collection ===');
// Get collection names
for (const item of purchasesByCollection) {
  if (!item._id) { console.log(`  null collectionId: ${item.count} events, ₹${item.totalRev}`); continue; }
  const col = await db.collection('tbl_collections').findOne({ shopifyCollectionId: item._id });
  console.log(`  ${col?.title || item._id}: ${item.count} events, ₹${item.totalRev.toFixed(2)}`);
}

await mongoose.disconnect();
