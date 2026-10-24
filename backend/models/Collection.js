import mongoose from "mongoose";

const CollectionSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
    },

    shopifyCollectionId: {
      type: String,
      required: true,
      index: true,
    },

    title: String,
    handle: String,
    description: String,
    image: String,
    imageAltText: String,
    collectionType: {
      type: String,
      enum: ["flexible"],
    },
    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,

    productIds: [
      {
        type: String,
      },
    ],

    lastSyncedAt: Date,
  },
  {
    timestamps: true,
    collection: "tbl_collections",
  }
);

CollectionSchema.index(
  { shop: 1, shopifyCollectionId: 1 },
  { unique: true }
);

export default mongoose.models.Collection || mongoose.model("Collection", CollectionSchema);