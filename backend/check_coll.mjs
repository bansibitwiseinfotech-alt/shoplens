import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';
  const pid = 'gid://shopify/Product/7635360055383';

  const merchEvents = await mongoose.connection.collection('tbl_merchandising_events').find({
    shop,
    productId: pid
  }).limit(5).toArray();

  console.log('Sample merch events for 7635360055383:', JSON.stringify(merchEvents, null, 2));

  // What collection were these in?
  const collIds = await mongoose.connection.collection('tbl_merchandising_events').distinct('collectionId', { shop, productId: pid });
  console.log('Collections for this product:', collIds);

  for (const cid of collIds) {
    const collViews = await mongoose.connection.collection('tbl_merchandising_events').countDocuments({
      shop,
      collectionId: cid,
      eventType: 'collection_view'
    });
    console.log('Collection', cid, 'views in merch:', collViews);
  }

  process.exit(0);
}
check().catch(console.error);
