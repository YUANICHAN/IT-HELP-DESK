import mongoose from "mongoose";

const { Schema } = mongoose;

const slaBreachSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    ticket: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, immutable: true },
    cycle: { type: Schema.Types.ObjectId, ref: "SlaCycle", required: true, immutable: true },
    cycleNumber: { type: Number, required: true, min: 1, immutable: true },
    metric: { type: String, required: true, enum: ["RESPONSE", "RESOLUTION"], immutable: true },
    dueAt: { type: Date, required: true, immutable: true },
    detectedAt: { type: Date, required: true, immutable: true },
    priority: { type: String, required: true, enum: ["P1", "P2", "P3", "P4"], immutable: true },
    budgetSeconds: { type: Number, required: true, min: 1, immutable: true },
    elapsedSeconds: { type: Number, required: true, min: 0, immutable: true },
    clockRevision: { type: Number, required: true, min: 0, immutable: true },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

slaBreachSchema.index(
  { organization: 1, cycle: 1, metric: 1 },
  { unique: true, name: "sla_breach_cycle_metric_unique" },
);
slaBreachSchema.index(
  { organization: 1, ticket: 1, detectedAt: 1 },
  { name: "sla_breach_ticket_history" },
);

export const SlaBreach =
  mongoose.models.SlaBreach || mongoose.model("SlaBreach", slaBreachSchema);
