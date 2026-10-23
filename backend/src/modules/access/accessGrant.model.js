import mongoose from "mongoose";
import { Department } from "../organization/department.model.js";
import { Organization } from "../organization/organization.model.js";
import { User } from "../users/user.model.js";
import {
  requireOrganizationOwnedReference,
  requireReference,
} from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

export const ACCESS_CAPABILITIES = Object.freeze([
  "support",
  "department_supervise",
  "ticket_triage",
  "asset_manage",
]);

export const CAPABILITY_RULES = Object.freeze({
  support: {
    roles: ["TECHNICIAN"],
    departmentRequired: true,
  },
  department_supervise: {
    roles: ["SUPERVISOR"],
    departmentRequired: true,
  },
  ticket_triage: {
    roles: ["SUPERVISOR"],
    departmentRequired: false,
  },
  asset_manage: {
    roles: ["TECHNICIAN", "SUPERVISOR"],
    departmentRequired: false,
  },
});

function removeInternalFields(_document, returnedObject) {
  delete returnedObject.scopeKey;
  delete returnedObject.isActive;
  return returnedObject;
}

const accessGrantSchema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required."],
      immutable: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required."],
      immutable: true,
    },
    capability: {
      type: String,
      required: [true, "Capability is required."],
      enum: {
        values: ACCESS_CAPABILITIES,
        message: "Capability is not supported.",
      },
      immutable: true,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      immutable: true,
    },
    scopeKey: {
      type: String,
      required: true,
      select: false,
      immutable: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      select: false,
      default: true,
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Granting actor is required."],
      immutable: true,
    },
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: undefined,
    },
    revokedAt: {
      type: Date,
      default: undefined,
      set: (value) => (value == null ? undefined : value),
    },
  },
  {
    strict: "throw",
    timestamps: true,
    toJSON: { transform: removeInternalFields },
    toObject: { transform: removeInternalFields },
  },
);

accessGrantSchema.index(
  { organization: 1, user: 1, capability: 1, scopeKey: 1 },
  {
    unique: true,
    name: "access_grant_active_scope_unique",
    partialFilterExpression: { isActive: true },
  },
);

accessGrantSchema.pre("validate", async function validateAccessGrant() {
  this.scopeKey = this.department
    ? `DEPARTMENT:${this.department.toString()}`
    : "ORGANIZATION";
  this.isActive = !this.revokedAt;

  const rule = CAPABILITY_RULES[this.capability];

  if (rule?.departmentRequired && !this.department) {
    this.invalidate(
      "department",
      `${this.capability} requires a department scope.`,
    );
  }

  if (Boolean(this.revokedAt) !== Boolean(this.revokedBy)) {
    const path = this.revokedAt ? "revokedBy" : "revokedAt";
    this.invalidate(
      path,
      "Revoking actor and revocation timestamp must be supplied together.",
    );
  }

  await requireReference({
    document: this,
    path: "organization",
    Model: Organization,
    id: this.organization,
    label: "Organization",
    select: { _id: 1 },
  });

  const grantedUser = await requireOrganizationOwnedReference({
    document: this,
    path: "user",
    Model: User,
    id: this.user,
    organization: this.organization,
    label: "Granted user",
    select: { role: 1, accountStatus: 1 },
  });

  if (grantedUser && grantedUser.accountStatus !== "ACTIVE") {
    this.invalidate("user", "Granted user must have an active account.");
  }

  if (grantedUser && rule && !rule.roles.includes(grantedUser.role)) {
    this.invalidate(
      "user",
      `${this.capability} cannot be granted to the user's role.`,
    );
  }

  if (this.department) {
    const scopedDepartment = await requireOrganizationOwnedReference({
      document: this,
      path: "department",
      Model: Department,
      id: this.department,
      organization: this.organization,
      label: "Department",
      select: { isActive: 1 },
    });

    if (scopedDepartment && !scopedDepartment.isActive) {
      this.invalidate("department", "Department scope must be active.");
    }
  }

  await requireOrganizationOwnedReference({
    document: this,
    path: "grantedBy",
    Model: User,
    id: this.grantedBy,
    organization: this.organization,
    label: "Granting actor",
  });

  if (this.revokedBy) {
    await requireOrganizationOwnedReference({
      document: this,
      path: "revokedBy",
      Model: User,
      id: this.revokedBy,
      organization: this.organization,
      label: "Revoking actor",
    });
  }
});

export const AccessGrant =
  mongoose.models.AccessGrant ||
  mongoose.model("AccessGrant", accessGrantSchema);
