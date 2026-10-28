import mongoose from "mongoose";

const { Schema } = mongoose;

const workerHeartbeatSchema = new Schema(
  {
    workerId: { type: String, required: true, maxlength: 180, immutable: true },
    startedAt: { type: Date, required: true, immutable: true },
    lastSeenAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["STARTING", "RUNNING", "STOPPING", "STOPPED", "FAILED"],
    },
    release: { type: String, required: true, maxlength: 120, immutable: true },
    lastDeliveryErrorCode: { type: String, maxlength: 80, default: undefined },
    lastCleanupErrorCode: { type: String, maxlength: 80, default: undefined },
    lastSlaErrorCode: { type: String, maxlength: 80, default: undefined },
    lastDeliveryRunAt: { type: Date, default: undefined },
    lastDeliveryStatus: { type: String, enum: ["SUCCESS", "FAILED"], default: undefined },
    lastSlaRunAt: { type: Date, default: undefined },
    lastSlaStatus: { type: String, enum: ["SUCCESS", "FAILED"], default: undefined },
    lastCleanupRunAt: { type: Date, default: undefined },
    lastCleanupStatus: { type: String, enum: ["SUCCESS", "FAILED"], default: undefined },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

workerHeartbeatSchema.index(
  { workerId: 1 },
  { unique: true, name: "worker_heartbeat_identity_unique" },
);
workerHeartbeatSchema.index(
  { lastSeenAt: -1 },
  { name: "worker_heartbeat_freshness" },
);

export const WorkerHeartbeat =
  mongoose.models.WorkerHeartbeat ||
  mongoose.model("WorkerHeartbeat", workerHeartbeatSchema);
