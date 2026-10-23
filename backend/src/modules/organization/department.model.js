import mongoose from "mongoose";
import { Organization } from "./organization.model.js";
import {
  objectIdsEqual,
  requireOrganizationOwnedReference,
  requireReference,
} from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

const departmentSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required."],
      immutable: true,
    },
    code: {
      type: String,
      required: [true, "Department code is required."],
      trim: true,
      uppercase: true,
      minlength: [1, "Department code is required."],
      maxlength: [32, "Department code cannot exceed 32 characters."],
    },
    name: {
      type: String,
      required: [true, "Department name is required."],
      trim: true,
      minlength: [2, "Department name must contain at least 2 characters."],
      maxlength: [150, "Department name cannot exceed 150 characters."],
    },
    designatedApprover: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: undefined,
    },
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

departmentSchema.index(
  { organization: 1, code: 1 },
  { unique: true, name: "department_organization_code_unique" },
);

departmentSchema.pre("validate", async function validateReferences() {
  await requireReference({
    document: this,
    path: "organization",
    Model: Organization,
    id: this.organization,
    label: "Organization",
    select: { _id: 1 },
  });

  if (!this.designatedApprover) return;

  const { User } = await import("../users/user.model.js");
  const approver = await requireOrganizationOwnedReference({
    document: this,
    path: "designatedApprover",
    Model: User,
    id: this.designatedApprover,
    organization: this.organization,
    label: "Designated approver",
    select: { department: 1 },
  });

  if (approver && !objectIdsEqual(approver.department, this._id)) {
    this.invalidate(
      "designatedApprover",
      "Designated approver must belong to this department.",
    );
  }
});

export const Department =
  mongoose.models.Department || mongoose.model("Department", departmentSchema);
