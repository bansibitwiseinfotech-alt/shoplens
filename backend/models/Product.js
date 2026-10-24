import mongoose from "mongoose";

const VariantSchema = new mongoose.Schema(
  {
    shopifyVariantId: {
      type: String,
      required: true,
    },

    title: String,
    sku: String,
    price: Number,
    inventoryQuantity: Number,
    inventoryItemId: String,
    inventoryLevels: [
      {
        inventoryLevelId: String,
        availableQuantity: Number,
      },
    ],
    selectedOptions: [
      {
        name: String,
        value: String,
      },
    ],
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
    },

    shopifyProductId: {
      type: String,
      required: true,
      index: true,
    },

    title: String,
    handle: String,
    description: String,
    vendor: String,
    productType: String,
    status: String,
    tags: [String],
    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,

    variants: [VariantSchema],

    images: [
      {
        id: String,
        url: String,
        altText: String,
      },
    ],

    lastSyncedAt: Date,
  },
  {
    timestamps: true,
    collection: "tbl_products",
    autoCreate: false,
    autoIndex: false,
  }
);

ProductSchema.index(
  { shop: 1, shopifyProductId: 1 },
  { unique: true }
);

export default mongoose.models.Product || mongoose.model("Product", ProductSchema);