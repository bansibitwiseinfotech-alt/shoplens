import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/db_shoplens');
const db = mongoose.connection.db;

// Events by collection
const byCollection = await db.collection('tbl_merchandising_events').aggregate([
  { $group: { _id: { collectionId: '$collectionId', eventType: '$eventType' }, count: { $sum: 1 }, totalRevenue: { $sum: '$revenue' } } }
]).toArray();
console.log('=== Events by collection ===');
console.log(JSON.stringify(byCollection, null, 2));

// Date range
const dateRange = await db.collection('tbl_merchandising_events').aggregate([
  { $group: { _id: null, minDate: { $min: '$occurredAt' }, maxDate: { $max: '$occurredAt' } } }
]).toArray();
console.log('\n=== Date range ===');
console.log(JSON.stringify(dateRange));

// Collections
const collections = await db.collection('tbl_collections').find({}, { projection: { shopifyCollectionId: 1, title: 1 } }).toArray();
console.log('\n=== Collections ===');
console.log(JSON.stringify(collections.map(c => ({ id: c.shopifyCollectionId, title: c.title }))));

// Also check which collections have events vs not
const eventCollectionIds = [...new Set(byCollection.map(e => e._id.collectionId))];
const allCollectionIds = collections.map(c => c.shopifyCollectionId);
const noEventCollections = allCollectionIds.filter(id => !eventCollectionIds.includes(id));
console.log('\n=== Collections with NO events ===');
console.log(JSON.stringify(noEventCollections));
console.log('\n=== Collections WITH events (IDs) ===');
console.log(JSON.stringify(eventCollectionIds));

// Check what the real Shopify orders look like
const ordersCount = await db.collection('tbl_orders').countDocuments().catch(() => 0);
console.log('\n=== Orders count ===', ordersCount);
if (ordersCount > 0) {
  const orderSample = await db.collection('tbl_orders').find({}).limit(2).toArray();
  console.log('Order sample keys:', JSON.stringify(orderSample.map(o => Object.keys(o))));
}

await mongoose.disconnect();
