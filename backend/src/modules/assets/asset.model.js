import mongoose from "mongoose";
const {
  Schema
} = mongoose;
export const ASSET_CATEGORIES = Object.freeze(["DESKTOP", "LAPTOP", "PRINTER", "MONITOR", "NETWORK", "UPS", "OTHER"]);
export const ASSET_STATUSES = Object.freeze(["AVAILABLE", "ASSIGNED", "UNDER_REPAIR", "LOST", "RETIRED"]);
export const ASSET_CONDITIONS = Object.freeze(["GOOD", "FAIR", "DAMAGED", "UNSERVICEABLE"]);
const schema = new Schema({
  organization: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  assetTag: {
    type: String,
    required: true,
    immutable: true,
    maxlength: 80,
    trim: true,
    uppercase: true
  },
  serialNumber: {
    type: String,
    default: null,
    maxlength: 120,
    set: v => typeof v === "string" ? v.trim().toUpperCase() || null : v
  },
  category: {
    type: String,
    enum: ASSET_CATEGORIES,
    required: true
  },
  manufacturer: {
    type: String,
    maxlength: 120,
    default: null
  },
  model: {
    type: String,
    maxlength: 120,
    default: null
  },
  department: {
    type: Schema.Types.ObjectId,
    ref: "Department",
    required: true
  },
  location: {
    type: Schema.Types.ObjectId,
    ref: "Location",
    default: null
  },
  shared: {
    type: Boolean,
    default: false,
    required: true
  },
  status: {
    type: String,
    enum: ASSET_STATUSES,
    default: "AVAILABLE",
    required: true
  },
  condition: {
    type: String,
    enum: ASSET_CONDITIONS,
    default: "GOOD",
    required: true
  },
  purchaseDate: {
    type: Date,
    default: null
  },
  warrantyEndDate: {
    type: Date,
    default: null
  },
  purchaseCost: {
    type: Schema.Types.Decimal128,
    default: null
  },
  currency: {
    type: String,
    match: /^[A-Z]{3}$/u,
    default: "PHP"
  },
  creator: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  version: {
    type: Number,
    default: 0,
    min: 0,
    required: true
  },
  linkRevision: {
    type: Number,
    default: 0
  },
  repairTicket: {
    type: Schema.Types.ObjectId,
    ref: "Ticket",
    default: null
  }
}, {
  strict: "throw",
  timestamps: true,
  versionKey: false
});
schema.index({
  organization: 1,
  assetTag: 1
}, {
  unique: true,
  name: "asset_tag_unique"
});
schema.index({
  organization: 1,
  serialNumber: 1
}, {
  unique: true,
  partialFilterExpression: {
    serialNumber: {
      $type: "string"
    }
  },
  name: "asset_serial_supplied_unique"
});
schema.index({
  organization: 1,
  department: 1,
  status: 1,
  category: 1
});
export const Asset = mongoose.models.Asset || mongoose.model("Asset", schema);
