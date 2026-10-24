import mongoose from "mongoose";

const { Schema } = mongoose;

export const TICKET_EVENT_TYPES = Object.freeze([
  "CREATED",
  "CLAIMED",
  "WORK_STARTED",
  "PUBLIC_REPLY_ADDED",
  "RESOLVED",
  "CLOSED",
]);

const ticketEventSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    ticket: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, immutable: true },
    type: { type: String, required: true, enum: TICKET_EVENT_TYPES, immutable: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    data: { type: Schema.Types.Mixed, required: true, default: () => ({}), immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { strict: "throw", versionKey: false },
);

ticketEventSchema.index(
  { organization: 1, ticket: 1, occurredAt: 1, _id: 1 },
  { name: "ticket_event_timeline" },
);

export const TicketEvent =
  mongoose.models.TicketEvent || mongoose.model("TicketEvent", ticketEventSchema);
