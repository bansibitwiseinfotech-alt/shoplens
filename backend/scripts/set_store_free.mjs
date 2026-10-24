import "dotenv/config";
import connectDB from "../config/db.js";
import Subscription from "../models/Subscription.js";
import MonthlyUsage from "../models/MonthlyUsage.js";

async function run() {
  await connectDB();
  const shop = "promobile-hub.myshopify.com";

  const sub = await Subscription.findOneAndUpdate(
    { shop },
    {
      $set: {
        plan: "free",
        interval: "monthly",
        status: "ACTIVE",
        price: 0,
        currency: "USD",
        shopifySubscriptionId: null,
        shopifyConfirmationUrl: null,
        activatedAt: new Date(),
        cancelledAt: null,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  await MonthlyUsage.getCurrentUsage(shop, "free");

  console.log(`Successfully reset ${shop} to ${sub.plan} plan (${sub.status})!`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
