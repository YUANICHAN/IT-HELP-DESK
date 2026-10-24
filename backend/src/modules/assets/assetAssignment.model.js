import mongoose from "mongoose";
const {
  Schema
} = mongoose;
const schema = new Schema({
  organization: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  asset: {
    type: Schema.Types.ObjectId,
    ref: "Asset",
    required: true,
    immutable: true
  },
  custodian: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  departmentSnapshot: {
    type: Schema.Types.Mixed,
    required: true,
    immutable: true
  },
  locationSnapshot: {
    type: Schema.Types.Mixed,
    default: null,
    immutable: true
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  assignedAt: {
    type: Date,
    required: true,
    immutable: true
  },
  returnedAt: {
    type: Date,
    default: null
  },
  returnedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  returnCondition: {
    type: String,
    enum: ["GOOD", "FAIR", "DAMAGED", "UNSERVICEABLE"],
    default: null
  },
  returnNotes: {
    type: String,
    maxlength: 5000,
    default: null
  }
}, {
  strict: "throw",
  versionKey: false
});
schema.index({
  organization: 1,
  asset: 1
}, {
  unique: true,
  partialFilterExpression: {
    returnedAt: null
  },
  name: "one_active_asset_custodian"
});
schema.index({
  organization: 1,
  custodian: 1,
  returnedAt: 1,
  asset: 1
});
schema.index({
  organization: 1,
  asset: 1,
  assignedAt: -1
});
export const AssetAssignment = mongoose.models.AssetAssignment || mongoose.model("AssetAssignment", schema);
