import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Product from './models/Product.js';
import { fetchAllStoreProducts } from './services/productSyncService.js';

async function syncProductsToDb() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/db_shoplens');
  const shop = 'promobile-hub.myshopify.com';
  
  console.log('Fetching products from Shopify GraphQL for', shop);
  const products = await fetchAllStoreProducts(shop);
  console.log(`Fetched ${products.length} products`);

  const ops = products.map((p) => ({
    updateOne: {
      filter: { shop, shopifyProductId: p.shopifyProductId },
      update: {
        $set: {
          shop,
          shopifyProductId: p.shopifyProductId,
          title: p.title,
          handle: p.handle,
          description: p.description,
          vendor: p.vendor,
          productType: p.productType,
          status: p.status,
          tags: p.tags,
          variants: p.variants,
          images: p.images,
          shopifyCreatedAt: p.shopifyCreatedAt ? new Date(p.shopifyCreatedAt) : null,
          shopifyUpdatedAt: p.shopifyUpdatedAt ? new Date(p.shopifyUpdatedAt) : null,
          lastSyncedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const res = await Product.bulkWrite(ops);
  console.log('Bulk write result:', res.upsertedCount, 'upserted,', res.modifiedCount, 'modified');

  const count = await Product.countDocuments({ shop });
  console.log('Total products in MongoDB:', count);

  await mongoose.disconnect();
}

syncProductsToDb().catch(console.error);
