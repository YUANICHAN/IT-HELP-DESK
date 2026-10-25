import mongoose from "mongoose";
import { BusinessCalendar } from "./businessCalendar.model.js";
import { Organization } from "../organization/organization.model.js";
import {
  requireOrganizationOwnedReference,
  requireReference,
} from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

export const DEFAULT_SLA_TARGETS_SECONDS = Object.freeze({
  P1: Object.freeze({ responseSeconds: 1800, resolutionSeconds: 14400 }),
  P2: Object.freeze({ responseSeconds: 7200, resolutionSeconds: 28800 }),
  P3: Object.freeze({ responseSeconds: 14400, resolutionSeconds: 86400 }),
  P4: Object.freeze({ responseSeconds: 28800, resolutionSeconds: 144000 }),
});

function normalizeTargets(value) {
  const supplied = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_SLA_TARGETS_SECONDS).map(([priority, defaults]) => {
      const target = supplied[priority] || {};
      const responseSeconds = target.responseSeconds ??
        (target.responseMinutes == null ? defaults.responseSeconds : target.responseMinutes * 60);
      const resolutionSeconds = target.resolutionSeconds ??
        (target.resolutionMinutes == null ? defaults.resolutionSeconds : target.resolutionMinutes * 60);
      return [priority, { responseSeconds, resolutionSeconds }];
    }),
  );
}

const slaPolicySchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    businessCalendar: {
      type: Schema.Types.ObjectId,
      ref: "BusinessCalendar",
      required: true,
    },
    targets: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => structuredClone(DEFAULT_SLA_TARGETS_SECONDS),
      set: normalizeTargets,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    revision: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      validate: Number.isSafeInteger,
    },
  },
  { strict: "throw", timestamps: true },
);

slaPolicySchema.index(
  { organization: 1, name: 1 },
  { unique: true, name: "sla_policy_organization_name_unique" },
);

slaPolicySchema.pre("validate", async function validateCalendar() {
  for (const priority of ["P1", "P2", "P3", "P4"]) {
    const target = this.targets?.[priority];
    for (const field of ["responseSeconds", "resolutionSeconds"]) {
      if (!Number.isSafeInteger(target?.[field]) || target[field] < 1) {
        this.invalidate("targets", `${priority}.${field} must be a positive integer.`);
      }
    }
  }
  await requireReference({
    document: this,
    path: "organization",
    Model: Organization,
    id: this.organization,
    label: "Organization",
    select: { _id: 1 },
  });
  await requireOrganizationOwnedReference({
    document: this,
    path: "businessCalendar",
    Model: BusinessCalendar,
    id: this.businessCalendar,
    organization: this.organization,
    label: "Business calendar",
  });
});

export const SlaPolicy =
  mongoose.models.SlaPolicy || mongoose.model("SlaPolicy", slaPolicySchema);
