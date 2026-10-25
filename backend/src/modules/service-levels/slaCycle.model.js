import mongoose from "mongoose";

const { Schema } = mongoose;

const priorityChangeSchema = new Schema(
  {
    previousPriority: { type: String, required: true, enum: ["P1", "P2", "P3", "P4"] },
    newPriority: { type: String, required: true, enum: ["P1", "P2", "P3", "P4"] },
    previousResponseBudgetSeconds: { type: Number, required: true, min: 1 },
    newResponseBudgetSeconds: { type: Number, required: true, min: 1 },
    previousResolutionBudgetSeconds: { type: Number, required: true, min: 1 },
    newResolutionBudgetSeconds: { type: Number, required: true, min: 1 },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, maxlength: 500 },
    changedAt: { type: Date, required: true },
  },
  { _id: false, strict: "throw" },
);

const slaCycleSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    ticket: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, immutable: true },
    cycleNumber: { type: Number, required: true, min: 1, immutable: true },
    originalSubmittedAt: { type: Date, required: true, immutable: true },
    startedAt: { type: Date, required: true, immutable: true },
    isOpen: { type: Boolean, required: true, default: true },
    endedAt: { type: Date, default: undefined },
    endReason: { type: String, enum: ["RESOLVED", "CANCELLED", "REJECTED"], default: undefined },
    priority: { type: String, enum: ["P1", "P2", "P3", "P4"], default: undefined },
    responseBudgetSeconds: { type: Number, min: 1, default: undefined },
    resolutionBudgetSeconds: { type: Number, min: 1, default: undefined },
    firstResponseAt: { type: Date, default: undefined },
    responseElapsedSeconds: { type: Number, min: 0, default: undefined },
    responseBudgetAtCompletionSeconds: { type: Number, min: 1, default: undefined },
    resolutionElapsedSeconds: { type: Number, min: 0, default: undefined },
    resolutionPausedSeconds: { type: Number, min: 0, default: undefined },
    resolutionBudgetAtCompletionSeconds: { type: Number, min: 1, default: undefined },
    cachedResponseDueAt: { type: Date, default: undefined },
    cachedResolutionDueAt: { type: Date, default: undefined },
    responseEvaluationComplete: { type: Boolean, required: true, default: false },
    resolutionEvaluationComplete: { type: Boolean, required: true, default: false },
    clockRevision: { type: Number, required: true, default: 0, min: 0 },
    priorityChanges: { type: [priorityChangeSchema], default: () => [] },
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
  { organization: 1, ticket: 1 },
  {
    unique: true,
    partialFilterExpression: { isOpen: true },
    name: "sla_cycle_one_unfinished_per_ticket",
  },
);
slaCycleSchema.index(
  { organization: 1, endedAt: 1 },
  { name: "sla_cycle_open_lookup" },
);
slaCycleSchema.index(
  {
    responseEvaluationComplete: 1,
    resolutionEvaluationComplete: 1,
    cachedResponseDueAt: 1,
    cachedResolutionDueAt: 1,
  },
  { name: "sla_cycle_evaluator_candidates" },
);

export const SlaCycle =
  mongoose.models.SlaCycle || mongoose.model("SlaCycle", slaCycleSchema);
