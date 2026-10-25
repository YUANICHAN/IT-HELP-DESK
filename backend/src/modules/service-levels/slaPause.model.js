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
  startedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  endedAt: {
    type: Date,
    default: null
  },
  endedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
  endReason: {
    type: String,
    enum: ["APPROVED", "REJECTED", "REQUESTER_REPLIED", "RESUMED", "CANCELLED", "UNASSIGNED"],
    default: undefined
  }
}, {
  strict: "throw",
  timestamps: true,
  versionKey: false
});
schema.pre("validate", function validateEndPair() {
  if (Boolean(this.endedAt) !== Boolean(this.endedBy)) {
    this.invalidate("endedBy", "Pause end time and ending actor must be stored together.");
  }
  if (this.endedAt && this.startedAt && this.endedAt < this.startedAt) {
    this.invalidate("endedAt", "A pause cannot end before it starts.");
  }
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
