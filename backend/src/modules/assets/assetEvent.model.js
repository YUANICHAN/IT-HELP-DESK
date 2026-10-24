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
    required: true,
    immutable: true
  },
  actor: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  type: {
    type: String,
    enum: ["CREATED", "UPDATED", "ASSIGNED", "RETURNED", "STATE_CHANGED"],
    required: true,
    immutable: true
  },
  data: {
    type: Schema.Types.Mixed,
    default: () => ({}),
    immutable: true
  },
  occurredAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  strict: "throw",
  versionKey: false
});
schema.index({
  organization: 1,
  asset: 1,
  occurredAt: -1,
  _id: -1
});
export const AssetEvent = mongoose.models.AssetEvent || mongoose.model("AssetEvent", schema);
