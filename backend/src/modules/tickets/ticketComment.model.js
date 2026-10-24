import mongoose from "mongoose";

const { Schema } = mongoose;

const ticketCommentSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    ticket: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, immutable: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    visibility: { type: String, required: true, enum: ["PUBLIC"], default: "PUBLIC", immutable: true },
    kind: { type: String, required: true, enum: ["REPLY", "RESOLUTION"], default: "REPLY", immutable: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000, immutable: true },
  },
  { strict: "throw", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

ticketCommentSchema.index(
  { organization: 1, ticket: 1, createdAt: 1, _id: 1 },
  { name: "ticket_public_conversation" },
);

export const TicketComment =
  mongoose.models.TicketComment ||
  mongoose.model("TicketComment", ticketCommentSchema);
