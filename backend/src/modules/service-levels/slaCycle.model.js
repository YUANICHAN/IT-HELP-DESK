import mongoose from "mongoose";

const { Schema } = mongoose;

const slaCycleSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    ticket: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, immutable: true },
    cycleNumber: { type: Number, required: true, min: 1, immutable: true },
    originalSubmittedAt: { type: Date, required: true, immutable: true },
    startedAt: { type: Date, required: true, immutable: true },
    endedAt: { type: Date, default: undefined },
    endReason: { type: String, enum: ["RESOLVED", "CANCELLED", "REJECTED"], default: undefined },
    firstResponseAt: { type: Date, default: undefined },
    configurationSnapshots: {
      service: { type: Schema.Types.Mixed, required: true, immutable: true },
      slaPolicy: { type: Schema.Types.Mixed, required: true, immutable: true },
      businessCalendar: { type: Schema.Types.Mixed, required: true, immutable: true },
    },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

slaCycleSchema.index(
  { organization: 1, ticket: 1, cycleNumber: 1 },
  { unique: true, name: "sla_cycle_ticket_number_unique" },
);
slaCycleSchema.index(
  { organization: 1, endedAt: 1 },
  { name: "sla_cycle_open_lookup" },
);

export const SlaCycle =
  mongoose.models.SlaCycle || mongoose.model("SlaCycle", slaCycleSchema);
