import mongoose from "mongoose";

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    outbox: {
      type: Schema.Types.ObjectId,
      ref: "OutboxEvent",
      required: true,
      immutable: true,
    },
    eventType: { type: String, required: true, maxlength: 80, immutable: true },
    aggregateType: {
      type: String,
      required: true,
      enum: ["TICKET", "ASSET"],
      immutable: true,
    },
    aggregateId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    accessKind: { type: String, required: true, maxlength: 40, immutable: true },
    visibility: {
      type: String,
      required: true,
      enum: ["PUBLIC", "INTERNAL", "ASSET_MANAGERS"],
      immutable: true,
    },
    title: { type: String, required: true, maxlength: 180, immutable: true },
    linkPath: { type: String, maxlength: 240, immutable: true, default: undefined },
    metadata: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
      immutable: true,
    },
    deliveredAt: { type: Date, required: true, immutable: true },
    readAt: { type: Date, default: undefined },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

notificationSchema.index(
  { outbox: 1 },
  { unique: true, name: "notification_outbox_unique" },
);
notificationSchema.index(
  { organization: 1, recipient: 1, createdAt: -1, _id: -1 },
  { name: "notification_recipient_timeline" },
);
notificationSchema.index(
  { organization: 1, recipient: 1, readAt: 1, createdAt: -1 },
  { name: "notification_recipient_read_state" },
);

export const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
