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
  { user: 1, occurredAt: -1 },
  { name: "authentication_audit_user_timeline" },
);

export const AuthenticationAudit =
  mongoose.models.AuthenticationAudit ||
  mongoose.model("AuthenticationAudit", authenticationAuditSchema);
