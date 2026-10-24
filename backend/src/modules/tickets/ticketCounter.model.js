import mongoose from "mongoose";

const { Schema } = mongoose;

const ticketCounterSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
    },
    year: { type: Number, required: true, immutable: true },
    sequence: { type: Number, required: true, min: 0, default: 0 },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

ticketCounterSchema.index(
  { organization: 1, year: 1 },
  { unique: true, name: "ticket_counter_organization_year_unique" },
);

export const TicketCounter =
  mongoose.models.TicketCounter ||
  mongoose.model("TicketCounter", ticketCounterSchema);
