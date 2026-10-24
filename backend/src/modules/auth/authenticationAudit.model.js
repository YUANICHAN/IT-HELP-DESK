import mongoose from "mongoose";
import { sessionConfig } from "../../config/session.js";

const { Schema } = mongoose;

export const AUTHENTICATION_EVENT_TYPES = Object.freeze([
  "LOGIN",
  "LOGOUT",
  "SESSION_REVOKED",
  "PASSWORD_CHANGED",
  "AUTHENTICATION_REJECTED",
  "ACCESS_GRANT_CREATED",
  "ACCESS_GRANT_REVOKED",
  "TICKET_CREATED",
  "TICKET_CLAIMED",
  "TICKET_WORK_STARTED",
  "TICKET_PUBLIC_REPLY_ADDED",
  "TICKET_RESOLVED",
  "TICKET_CLOSED",
  "TICKET_UPDATED", "TICKET_TRIAGED", "TICKET_ASSIGNED", "TICKET_WAITING", "TICKET_RESUMED",
  "TICKET_CANCELLED", "TICKET_REOPENED", "TICKET_INTERNAL_NOTE_ADDED", "TICKET_WORKLOG_ADDED",
  "TICKET_ATTACHMENT_RESERVED", "TICKET_ATTACHMENT_READY", "TICKET_ATTACHMENT_REJECTED", "TICKET_ATTACHMENT_DELETED",
  "ASSET_CREATED", "ASSET_UPDATED", "ASSET_ASSIGNED", "ASSET_RETURNED", "ASSET_STATE_CHANGED",
]);

const authenticationAuditSchema = new Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: AUTHENTICATION_EVENT_TYPES,
      immutable: true,
    },
    outcome: {
      type: String,
      required: true,
      enum: ["SUCCESS", "FAILURE"],
      immutable: true,
    },
    reasonCode: {
      type: String,
      maxlength: 80,
      immutable: true,
      default: undefined,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      immutable: true,
      default: undefined,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      immutable: true,
      default: undefined,
    },
    session: {
      type: Schema.Types.ObjectId,
      ref: "Session",
      immutable: true,
      default: undefined,
    },
    targetUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      immutable: true,
      default: undefined,
    },
    accessGrant: {
      type: Schema.Types.ObjectId,
      ref: "AccessGrant",
      immutable: true,
      default: undefined,
    },
    capability: {
      type: String,
      maxlength: 80,
      immutable: true,
      default: undefined,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      immutable: true,
      default: null,
    },
    ticket: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      immutable: true,
      default: undefined,
    },
    ticketReference: {
      type: String,
      maxlength: 40,
      immutable: true,
      default: undefined,
    },
    asset: { type: Schema.Types.ObjectId, ref: "Asset", immutable: true, default: undefined },
    ipAddress: {
      type: String,
      maxlength: 64,
      immutable: true,
      default: undefined,
    },
    client: {
      browser: { type: String, maxlength: 80 },
      operatingSystem: { type: String, maxlength: 80 },
      deviceType: {
        type: String,
        enum: ["desktop", "mobile", "tablet", "unknown"],
      },
    },
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
    },
  },
  {
    strict: "throw",
    versionKey: false,
  },
);

authenticationAuditSchema.index(
  { occurredAt: 1 },
  {
    expireAfterSeconds: sessionConfig.auditRetentionSeconds,
    name: "authentication_audit_retention_ttl",
  },
);
authenticationAuditSchema.index(
  { organization: 1, ticket: 1, occurredAt: 1 },
  { name: "authentication_audit_ticket_timeline" },
);
authenticationAuditSchema.index(
  { user: 1, occurredAt: -1 },
  { name: "authentication_audit_user_timeline" },
);

export const AuthenticationAudit =
  mongoose.models.AuthenticationAudit ||
  mongoose.model("AuthenticationAudit", authenticationAuditSchema);
