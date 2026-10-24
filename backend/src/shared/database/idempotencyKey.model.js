import mongoose from "mongoose";

const { Schema } = mongoose;

const idempotencyKeySchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    operation: { type: String, required: true, maxlength: 120, immutable: true },
    key: { type: String, required: true, maxlength: 128, immutable: true },
    requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true },
    resourceType: { type: String, required: true, enum: ["TICKET"], immutable: true },
    resourceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    responseStatus: { type: Number, required: true, min: 200, max: 299, immutable: true },
  },
  { strict: "throw", timestamps: true, versionKey: false },
);

idempotencyKeySchema.index(
  { organization: 1, user: 1, operation: 1, key: 1 },
  { unique: true, name: "idempotency_key_scope_unique" },
);
idempotencyKeySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 86_400, name: "idempotency_key_retention_ttl" },
);

export const IdempotencyKey =
  mongoose.models.IdempotencyKey ||
  mongoose.model("IdempotencyKey", idempotencyKeySchema);
