import mongoose from "mongoose";
const {
  Schema
} = mongoose;
const schema = new Schema({
  organization: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  ticket: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  start: {
    type: Date,
    required: true,
    immutable: true
  },
  end: {
    type: Date,
    required: true,
    immutable: true
  },
  durationSeconds: {
    type: Number,
    required: true,
    min: 0,
    immutable: true
  },
  notes: {
    type: String,
    required: true,
    maxlength: 5000,
    immutable: true
  }
}, {
  strict: "throw",
  timestamps: {
    createdAt: true,
    updatedAt: false
  },
  versionKey: false
});
schema.index({
  organization: 1,
  ticket: 1,
  createdAt: 1,
  _id: 1
});
export const TicketWorklog = mongoose.models.TicketWorklog || mongoose.model("TicketWorklog", schema);
