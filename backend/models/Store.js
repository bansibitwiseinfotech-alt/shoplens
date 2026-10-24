import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: [true, "Shop domain is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    accessToken: {
      type: String,
      required: [true, "Access token is required"],
    },

    refreshToken: {
      type: String,
      default: "",
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },

    scope: {
      type: String,
      default: "",
    },

    installed: {
      type: Boolean,
      default: true,
    },

    installedAt: {
      type: Date,
      default: Date.now,
    },

    uninstalledAt: {
      type: Date,
      default: null,
    },

    syncStatus: {
      type: String,
      enum: ["idle", "syncing", "success", "failed"],
      default: "idle",
    },

    syncError: {
      type: String,
      default: null,
    },

    reauthorizationRequired: {
      type: Boolean,
      default: false,
    },

    syncLockUntil: {
      type: Date,
      default: null,
    },

    syncLockId: {
      type: String,
      default: null,
    },

    lastSyncAt: {
      type: Date,
      default: null,
    },

    syncStats: {
      products: {
        totalFetched: {
          type: Number,
          default: 0,
        },
        created: {
          type: Number,
          default: 0,
        },
        updated: {
          type: Number,
          default: 0,
        },
        failed: {
          type: Number,
          default: 0,
        },
      },

      collections: {
        totalFetched: {
          type: Number,
          default: 0,
        },
        created: {
          type: Number,
          default: 0,
        },
        updated: {
          type: Number,
          default: 0,
        },
        failed: {
          type: Number,
          default: 0,
        },
      },

      orders: {
        totalFetched: {
          type: Number,
          default: 0,
        },
        created: {
          type: Number,
          default: 0,
        },
        updated: {
          type: Number,
          default: 0,
        },
        failed: {
          type: Number,
          default: 0,
        },
      },

      customers: {
        totalFetched: {
          type: Number,
          default: 0,
        },
        created: {
          type: Number,
          default: 0,
        },
        updated: {
          type: Number,
          default: 0,
        },
        failed: {
          type: Number,
          default: 0,
        },
      },
    },
  },
  {
    timestamps: true,
    collection: "tbl_stores",
  }
);

// Safely return store data without exposing sensitive tokens.
storeSchema.methods.toSafeObject = function () {
  const obj = this.toObject();

  delete obj.accessToken;
  delete obj.refreshToken;

  return obj;
};

// Remove sensitive tokens from JSON responses.
storeSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.accessToken;
    delete ret.refreshToken;

    return ret;
  },
});

const Store =
  mongoose.models.Store ||
  mongoose.model("Store", storeSchema);

export default Store;
