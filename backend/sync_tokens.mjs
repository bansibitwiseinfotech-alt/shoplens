import dotenv from 'dotenv';
dotenv.config({ path: 'd:/shoplens/backend/.env' });
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Store = (await import('./models/Store.js')).default;
  const shop = process.env.SHOPIFY_STORE_DOMAIN || 'promobile-hub.myshopify.com';
  const access_token = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const refresh_token = process.env.SHOPIFY_REFRESH_TOKEN || '';
  const now = Date.now();

  await Store.updateOne(
    { shop },
    {
      $set: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(now + 3599 * 1000),
        refreshTokenExpiresAt: new Date(now + 7775999 * 1000),
        installed: true
      }
    }
  );
  console.log('MongoDB Store updated!');
 
  const prismaModule = await import('../app/db.server.js');
  const prisma = prismaModule.default;
  await prisma.session.update({
    where: { id: 'offline_' + shop },
    data: {
      accessToken: access_token,
      refreshToken: refresh_token,    
      expires: new Date(now + 3599 * 1000),
      refreshTokenExpires: new Date(now + 7775999 * 1000)
    }
  });
  console.log('Prisma session updated!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
