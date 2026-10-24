import mongoose from "mongoose";

const { Schema } = mongoose;

const outboxEventSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    eventType: { type: String, required: true, maxlength: 80, immutable: true },
    aggregateType: { type: String, required: true, enum: ["TICKET", "ASSET"], immutable: true },
    visibility: { type: String, enum: ["PUBLIC", "INTERNAL", "ASSET_MANAGERS"], default: "PUBLIC", immutable: true },
    requiresAuthorization: { type: Boolean, default: true, immutable: true },
    aggregateId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    recipients: {
      userIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
      capability: { type: String, maxlength: 80, default: undefined },
      department: { type: Schema.Types.ObjectId, ref: "Department", default: undefined },
    },
    payload: { type: Schema.Types.Mixed, required: true, default: () => ({}), immutable: true },
    status: { type: String, required: true, enum: ["PENDING", "PROCESSING", "PROCESSED", "FAILED"], default: "PENDING" },
    availableAt: { type: Date, required: true, default: Date.now },
    processedAt: { type: Date, default: undefined },
    attempts: { type: Number, required: true, min: 0, default: 0 },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

outboxEventSchema.index(
  { status: 1, availableAt: 1, _id: 1 },
  { name: "outbox_pending_work" },
);

export const OutboxEvent =
  mongoose.models.OutboxEvent || mongoose.model("OutboxEvent", outboxEventSchema);
