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
  ticket: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  cycleNumber: {
    type: Number,
    required: true,
    immutable: true
  },
  clock: {
    type: String,
    enum: ["RESOLUTION"],
    default: "RESOLUTION",
    immutable: true
  },
  startedAt: {
    type: Date,
    required: true,
    immutable: true
  },
  reason: { type: String, enum: ["WAITING_REQUESTER", "WAITING_APPROVAL"], default: "WAITING_REQUESTER", immutable: true },
  endedAt: {
    type: Date,
    default: null
  }
}, {
  strict: "throw",
  versionKey: false
});
schema.index({
  organization: 1,
  ticket: 1,
  cycleNumber: 1
}, {
  unique: true,
  partialFilterExpression: {
    endedAt: null
  },
  name: "one_active_resolution_pause"
});
export const SlaPause = mongoose.models.SlaPause || mongoose.model("SlaPause", schema);
