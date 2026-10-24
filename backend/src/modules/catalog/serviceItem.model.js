import mongoose from "mongoose";
import { Organization } from "../organization/organization.model.js";
import { SlaPolicy } from "../service-levels/slaPolicy.model.js";
import {
  requireOrganizationOwnedReference,
  requireReference,
} from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

export const TICKET_TYPES = Object.freeze(["INCIDENT", "REQUEST"]);

const serviceItemSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 40,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: undefined,
    },
    ticketType: {
      type: String,
      required: true,
      enum: TICKET_TYPES,
      immutable: true,
    },
    requiresApproval: {
      type: Boolean,
      required: true,
      default: false,
    },
    slaPolicy: {
      type: Schema.Types.ObjectId,
      ref: "SlaPolicy",
      required: true,
    },
    configuration: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
    },
    assetPolicy: { type: String, enum: ["NONE", "OWN_ONLY", "OWN_OR_SHARED_DEPARTMENT"], default: "NONE" },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { strict: "throw", timestamps: true },
);

serviceItemSchema.index(
  { organization: 1, code: 1 },
  { unique: true, name: "service_item_organization_code_unique" },
);

serviceItemSchema.pre("validate", async function validateReferences() {
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
    path: "slaPolicy",
    Model: SlaPolicy,
    id: this.slaPolicy,
    organization: this.organization,
    label: "SLA policy",
  });
});
serviceItemSchema.index(
  { organization: 1, isActive: 1, name: 1 },
  { name: "service_item_active_catalog" },
);

export const ServiceItem =
  mongoose.models.ServiceItem || mongoose.model("ServiceItem", serviceItemSchema);
