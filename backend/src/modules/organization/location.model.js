import mongoose from "mongoose";
import { Department } from "./department.model.js";
import { Organization } from "./organization.model.js";
import {
  requireOrganizationOwnedReference,
  requireReference,
} from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

const optionalTrimmedString = (maximumLength) => ({
  type: String,
  trim: true,
  maxlength: maximumLength,
  set: (value) => {
    if (value == null) return undefined;
    const normalized = String(value).trim();
    return normalized || undefined;
  },
});

const locationSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required."],
      immutable: true,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department is required."],
    },
    code: {
      type: String,
      required: [true, "Location code is required."],
      trim: true,
      uppercase: true,
      minlength: [1, "Location code is required."],
      maxlength: [32, "Location code cannot exceed 32 characters."],
    },
    name: {
      type: String,
      required: [true, "Location name is required."],
      trim: true,
      minlength: [2, "Location name must contain at least 2 characters."],
      maxlength: [150, "Location name cannot exceed 150 characters."],
    },
    building: optionalTrimmedString([100, "Building cannot exceed 100 characters."]),
    room: optionalTrimmedString([100, "Room cannot exceed 100 characters."]),
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    strict: "throw",
    timestamps: true,
  },
);

locationSchema.index(
  { organization: 1, code: 1 },
  { unique: true, name: "location_organization_code_unique" },
);

locationSchema.pre("validate", async function validateReferences() {
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
    path: "department",
    Model: Department,
    id: this.department,
    organization: this.organization,
    label: "Department",
  });
});

export const Location =
  mongoose.models.Location || mongoose.model("Location", locationSchema);
