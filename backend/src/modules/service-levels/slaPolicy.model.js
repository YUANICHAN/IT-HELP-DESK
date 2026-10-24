import mongoose from "mongoose";
import { BusinessCalendar } from "./businessCalendar.model.js";
import { Organization } from "../organization/organization.model.js";
import {
  requireOrganizationOwnedReference,
  requireReference,
} from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

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
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { strict: "throw", timestamps: true },
);

slaPolicySchema.index(
  { organization: 1, name: 1 },
  { unique: true, name: "sla_policy_organization_name_unique" },
);

slaPolicySchema.pre("validate", async function validateCalendar() {
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
