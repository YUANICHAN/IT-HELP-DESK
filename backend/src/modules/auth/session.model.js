import mongoose from "mongoose";

const { Schema } = mongoose;

function removeSensitiveSessionFields(_document, returnedObject) {
  delete returnedObject.tokenDigest;
  delete returnedObject.ipAddress;
  return returnedObject;
}

const clientSchema = new Schema(
  {
    browser: {
      type: String,
      required: true,
      maxlength: 80,
    },
    operatingSystem: {
      type: String,
      required: true,
      maxlength: 80,
    },
    deviceType: {
      type: String,
      required: true,
      enum: ["desktop", "mobile", "tablet", "unknown"],
    },
  },
  { _id: false },
);

const sessionSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    tokenDigest: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      match: /^[a-f0-9]{64}$/u,
    },
    sessionVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },
    client: {
      type: clientSchema,
      required: true,
    },
    ipAddress: {
      type: String,
      maxlength: 64,
      select: false,
      default: undefined,
    },
    lastSeenAt: {
      type: Date,
      required: true,
    },
    idleExpiresAt: {
      type: Date,
      required: true,
    },
    absoluteExpiresAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    revokedAt: {
      type: Date,
      default: undefined,
    },
    revocationReason: {
      type: String,
      enum: [
        "LOGOUT",
        "USER_REVOKED",
        "PASSWORD_CHANGED",
        "ACCOUNT_DISABLED",
        "SESSION_VERSION_CHANGED",
        "EXPIRED",
      ],
      default: undefined,
    },
  },
  {
    strict: "throw",
    timestamps: true,
    toJSON: { transform: removeSensitiveSessionFields },
    toObject: { transform: removeSensitiveSessionFields },
  },
);

sessionSchema.index(
  { tokenDigest: 1 },
  { unique: true, name: "session_token_digest_unique" },
);
sessionSchema.index(
  { idleExpiresAt: 1 },
  { expireAfterSeconds: 0, name: "session_idle_expiration_ttl" },
);
sessionSchema.index(
  { absoluteExpiresAt: 1 },
  { expireAfterSeconds: 0, name: "session_absolute_expiration_ttl" },
);
sessionSchema.index(
  { user: 1, revokedAt: 1, absoluteExpiresAt: -1 },
  { name: "session_user_active_lookup" },
);

export const Session =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);
