import mongoose from "mongoose";

const { Schema } = mongoose;

const maintenanceJobSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 80, immutable: true },
    status: {
      type: String,
      required: true,
      enum: ["IDLE", "PROCESSING"],
      default: "IDLE",
    },
    nextRunAt: { type: Date, required: true, default: Date.now },
    leaseToken: { type: String, maxlength: 80, select: false, default: undefined },
    leaseExpiresAt: { type: Date, default: undefined },
    claimedBy: { type: String, maxlength: 160, default: undefined },
    lastStartedAt: { type: Date, default: undefined },
    lastCompletedAt: { type: Date, default: undefined },
    lastStatus: { type: String, enum: ["SUCCESS", "FAILED"], default: undefined },
    lastErrorCode: { type: String, maxlength: 80, default: undefined },
    lastSummary: { type: Schema.Types.Mixed, default: undefined },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

maintenanceJobSchema.index(
  { name: 1 },
  { unique: true, name: "maintenance_job_name_unique" },
);
maintenanceJobSchema.index(
  { status: 1, nextRunAt: 1, leaseExpiresAt: 1 },
  { name: "maintenance_job_claim" },
);

export const MaintenanceJob =
  mongoose.models.MaintenanceJob || mongoose.model("MaintenanceJob", maintenanceJobSchema);
