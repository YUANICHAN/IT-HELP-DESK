import mongoose from "mongoose";

const { Schema } = mongoose;

export const OUTBOX_STATUSES = Object.freeze([
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "FAILED",
  "SUPPRESSED",
]);

export const DELIVERY_CHANNELS = Object.freeze(["IN_APP", "EMAIL"]);

const outboxEventSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
    },
    sourceEvent: { type: Schema.Types.ObjectId, required: true, immutable: true },
    deduplicationKey: {
      type: String,
      required: true,
      maxlength: 220,
      immutable: true,
    },
    eventType: {
      type: String,
      required: true,
      maxlength: 80,
      immutable: true,
    },
    aggregateType: {
      type: String,
      required: true,
      enum: ["TICKET", "ASSET"],
      immutable: true,
    },
    aggregateId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    channel: {
      type: String,
      required: true,
      enum: DELIVERY_CHANNELS,
      default: "IN_APP",
      immutable: true,
    },
    accessKind: {
      type: String,
      required: true,
      enum: [
        "TICKET_PUBLIC",
        "TICKET_INTERNAL",
        "TICKET_APPROVER",
        "ASSET_MANAGER",
        "ASSET_CUSTODIAN",
      ],
      immutable: true,
    },
    visibility: {
      type: String,
      required: true,
      enum: ["PUBLIC", "INTERNAL", "ASSET_MANAGERS"],
      immutable: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: OUTBOX_STATUSES,
      default: "PENDING",
    },
    attempts: { type: Number, required: true, min: 0, max: 5, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    leaseToken: {
      type: String,
      maxlength: 80,
      select: false,
      default: undefined,
    },
    leaseExpiresAt: { type: Date, default: undefined },
    claimedBy: { type: String, maxlength: 160, default: undefined },
    claimedAt: { type: Date, default: undefined },
    lastErrorCode: { type: String, maxlength: 80, default: undefined },
    deliveredAt: { type: Date, default: undefined },
    suppressedAt: { type: Date, default: undefined },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

outboxEventSchema.index(
  { organization: 1, deduplicationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { deduplicationKey: { $type: "string" } },
    name: "outbox_organization_deduplication_unique",
  },
);
outboxEventSchema.index(
  { status: 1, nextAttemptAt: 1, leaseExpiresAt: 1, createdAt: 1 },
  { name: "outbox_delivery_claim" },
);
outboxEventSchema.index(
  { organization: 1, status: 1, createdAt: 1 },
  { name: "outbox_organization_health" },
);
outboxEventSchema.index(
  { recipient: 1, status: 1, createdAt: -1 },
  { name: "outbox_recipient_history" },
);

export const OutboxEvent =
  mongoose.models.OutboxEvent || mongoose.model("OutboxEvent", outboxEventSchema);
