import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = 'promobile-hub.myshopify.com';

  const prods = await mongoose.connection.collection('tbl_products').find({
    shop,
    title: { $regex: /Apple Silicone Case/i }
  }).toArray();

  console.log('Products matching Apple Silicone Case:', prods.map(p => ({
    id: p.shopifyProductId,
    title: p.title,
    handle: p.handle
  })));

  process.exit(0);
}
check().catch(console.error);
