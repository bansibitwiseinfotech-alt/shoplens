import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function diagnose() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const events = db.collection('tbl_search_events');
  const shop = 'promobile-hub.myshopify.com';

  console.log('=== 1. EVENTS SUMMARY BY EVENT TYPE ===');
  const typeAgg = await events.aggregate([
    { $match: { shop } },
    { $group: { _id: { eventType: '$eventType', eventName: '$eventName' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log(typeAgg);

  console.log('\n=== 2. EVENTS WITH NON-NULL PRODUCT ID ===');
  const withPid = await events.find({ shop, productId: { $ne: null } }).toArray();
  console.log('Count:', withPid.length);
  for (const ev of withPid) {
    console.log({
      eventType: ev.eventType,
      eventName: ev.eventName,
      productId: ev.productId,
      metadata: ev.metadata,
      query: ev.query
    });
  }

  console.log('\n=== 3. SEARCH EVENTS AND METADATA ===');
  const searches = await events.find({ shop, eventType: 'search' }).limit(5).toArray();
  for (const s of searches) {
    console.log({
      query: s.query,
      metadata: s.metadata,
      productId: s.productId
    });
  }

  console.log('\n=== 4. TBL_COLLECTIONS ===');
  const collectionsColl = db.collection('tbl_collections');
  const collections = await collectionsColl.find({ shop }).toArray();
  console.log('Collections count for shop:', collections.length);
  for (const c of collections.slice(0, 5)) {
    console.log({
      title: c.title,
      productIdsCount: Array.isArray(c.productIds) ? c.productIds.length : 0,
      sampleProductIds: Array.isArray(c.productIds) ? c.productIds.slice(0, 3) : []
    });
  }

  console.log('\n=== 5. CHECK EVENTS MATCHING IPHONE 17 PRO ===');
  const evs = await events.find({
    shop,
    $or: [
      { productId: /7634929811543/ },
      { 'metadata.returnedProductIds': /7634929811543/ },
      { 'metadata.lineItems.productId': /7634929811543/ },
      { 'metadata.productTitle': /iPhone 17 Pro/ }
    ]
  }).toArray();
  console.log('Events matching iPhone 17 Pro:', evs.length);
  for (const e of evs) {
    console.log(e.eventType, e.eventName, e.productId, e.query, JSON.stringify(e.metadata));
  }
  process.exit(0);
}

diagnose().catch(err => {
  console.error(err);
  process.exit(1);
});
