import mongoose from "mongoose";
import SearchEvent from "./models/searchEvent.model.js";

async function main() {
  await mongoose.connect("mongodb+srv://bansibitwiseinfotech_db_user:DCAtSrqhWNhFc72e@cluster0.mhmgckf.mongodb.net/db_shoplens?appName=Cluster0");
  const counts = await SearchEvent.aggregate([
    { $group: { _id: "$query", count: { $sum: 1 }, latest: { $max: "$occurredAt" }, earliest: { $min: "$occurredAt" } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  console.log("Top searches in DB:", counts);
  await mongoose.disconnect();
}

main().catch(console.error);
