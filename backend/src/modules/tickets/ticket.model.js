import mongoose from "mongoose";
import { TICKET_TYPES } from "../catalog/serviceItem.model.js";

const { Schema } = mongoose;

export const TICKET_STATUSES = Object.freeze([
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
]);
export const TICKET_URGENCIES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
export const TICKET_PRIORITIES = Object.freeze(["P2", "P3", "P4"]);
export const RESOLUTION_CODES = Object.freeze([
  "FIXED",
  "WORKAROUND",
  "FULFILLED",
  "NO_FAULT_FOUND",
]);

const resolutionSchema = new Schema(
  {
    summary: { type: String, required: true, minlength: 1, maxlength: 5000 },
    code: { type: String, required: true, enum: RESOLUTION_CODES },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    resolvedAt: { type: Date, required: true },
  },
  { _id: false, strict: "throw" },
);

const ticketSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
    },
    reference: { type: String, required: true, immutable: true },
    referenceYear: { type: Number, required: true, immutable: true },
    referenceSequence: { type: Number, required: true, immutable: true },
    requester: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    requesterDepartment: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      immutable: true,
    },
    serviceItem: {
      type: Schema.Types.ObjectId,
      ref: "ServiceItem",
      required: true,
      immutable: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      default: undefined,
      immutable: true,
    },
    type: { type: String, required: true, enum: TICKET_TYPES, immutable: true },
    approvalRequired: { type: Boolean, required: true, immutable: true },
    approvalStatus: {
      type: String,
      required: true,
      enum: ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"],
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 150,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 5000,
    },
    urgency: { type: String, required: true, enum: TICKET_URGENCIES },
    impact: { type: String, required: true, enum: ["MEDIUM"], immutable: true },
    priority: {
      type: String,
      required: true,
      enum: TICKET_PRIORITIES,
      immutable: true,
    },
    status: { type: String, required: true, enum: TICKET_STATUSES },
    assignee: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, required: true, immutable: true },
    firstResponseAt: { type: Date, default: undefined },
    resolution: { type: resolutionSchema, default: undefined },
    closedAt: { type: Date, default: undefined },
    closedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    configurationSnapshots: {
      service: { type: Schema.Types.Mixed, required: true },
      slaPolicy: { type: Schema.Types.Mixed, required: true },
      businessCalendar: { type: Schema.Types.Mixed, required: true },
    },
    version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: "Version must be an integer." },
    },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

ticketSchema.index(
  { organization: 1, reference: 1 },
  { unique: true, name: "ticket_organization_reference_unique" },
);
ticketSchema.index(
  { organization: 1, requester: 1, submittedAt: -1 },
  { name: "ticket_requester_collection" },
);
ticketSchema.index(
  { organization: 1, requesterDepartment: 1, status: 1, assignee: 1, submittedAt: -1 },
  { name: "ticket_department_queue" },
);
ticketSchema.index(
  { organization: 1, assignee: 1, status: 1, submittedAt: -1 },
  { name: "ticket_assignee_collection" },
);

export const Ticket =
  mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);
