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
    ref: "Ticket",
    required: true,
    immutable: true
  },
  comment: {
    type: Schema.Types.ObjectId,
    ref: "TicketComment",
    default: null,
    immutable: true
  },
  uploader: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  visibility: {
    type: String,
    enum: ["PUBLIC", "INTERNAL"],
    required: true,
    immutable: true
  },
  originalName: {
    type: String,
    required: true,
    maxlength: 180,
    immutable: true
  },
  storageName: {
    type: String,
    required: true,
    immutable: true,
    select: false
  },
  mimeType: {
    type: String,
    enum: ["image/png", "image/jpeg", "application/pdf"],
    required: true,
    immutable: true
  },
  size: {
    type: Number,
    required: true,
    max: 5242880,
    immutable: true
  },
  sha256: {
    type: String,
    required: true,
    immutable: true,
    select: false
  },
  state: {
    type: String,
    enum: ["PENDING", "READY", "REJECTED", "DELETED"],
    default: "PENDING"
  },
  scanStatus: {
    type: String,
    enum: ["PENDING", "CLEAN", "INFECTED", "ERROR", "NOT_CONFIGURED"],
    required: true
  }
}, {
  strict: "throw",
  timestamps: true,
  versionKey: false
});
schema.index({
  organization: 1,
  ticket: 1,
  visibility: 1,
  createdAt: 1
});
schema.index({
  storageName: 1
}, {
  unique: true,
  name: "attachment_storage_name_unique"
});
schema.index({
  state: 1,
  updatedAt: 1
});
export const Attachment = mongoose.models.Attachment || mongoose.model("Attachment", schema);
