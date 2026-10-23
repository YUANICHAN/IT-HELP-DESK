import mongoose from "mongoose";
import { Department } from "../organization/department.model.js";
import { Organization } from "../organization/organization.model.js";
import {
  requireOrganizationOwnedReference,
  requireReference,
} from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

export const USER_ROLES = Object.freeze([
  "EMPLOYEE",
  "TECHNICIAN",
  "SUPERVISOR",
  "ADMINISTRATOR",
]);

export const ACCOUNT_STATUSES = Object.freeze([
  "INVITED",
  "ACTIVE",
  "DISABLED",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ARGON2ID_HASH_PATTERN =
  /^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/;

function optionalTrimmedValue(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function removePasswordHash(_document, returnedObject) {
  delete returnedObject.passwordHash;
  return returnedObject;
}

const userSchema = new Schema(
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
    displayName: {
      type: String,
      required: [true, "Display name is required."],
      trim: true,
      minlength: [2, "Display name must contain at least 2 characters."],
      maxlength: [150, "Display name cannot exceed 150 characters."],
    },
    email: {
      type: String,
      required: [true, "Email is required."],
      trim: true,
      lowercase: true,
      maxlength: [320, "Email cannot exceed 320 characters."],
      match: [EMAIL_PATTERN, "Email must be a valid email address."],
    },
    employeeNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [64, "Employee number cannot exceed 64 characters."],
      default: undefined,
      set: optionalTrimmedValue,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [32, "Phone cannot exceed 32 characters."],
      default: undefined,
      set: optionalTrimmedValue,
    },
    passwordHash: {
      type: String,
      select: false,
      default: undefined,
      validate: {
        validator: (value) => value == null || ARGON2ID_HASH_PATTERN.test(value),
        message: "Password hash must be a valid Argon2id encoded hash.",
      },
    },
    role: {
      type: String,
      required: [true, "Role is required."],
      enum: {
        values: USER_ROLES,
        message: "Role is not supported.",
      },
      default: "EMPLOYEE",
    },
    accountStatus: {
      type: String,
      required: [true, "Account status is required."],
      enum: {
        values: ACCOUNT_STATUSES,
        message: "Account status is not supported.",
      },
      default: "INVITED",
    },
    mustChangePassword: {
      type: Boolean,
      required: true,
      default: true,
    },
    sessionVersion: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Session version cannot be negative."],
      validate: {
        validator: Number.isSafeInteger,
        message: "Session version must be an integer.",
      },
    },
    lastLoginAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    strict: "throw",
    timestamps: true,
    toJSON: { transform: removePasswordHash },
    toObject: { transform: removePasswordHash },
  },
);

userSchema.index(
  { organization: 1, email: 1 },
  { unique: true, name: "user_organization_email_unique" },
);

userSchema.index({ email: 1 }, { name: "user_email_login_lookup" });

userSchema.index(
  { organization: 1, employeeNumber: 1 },
  {
    unique: true,
    name: "user_organization_employee_number_unique",
    partialFilterExpression: { employeeNumber: { $type: "string" } },
  },
);

userSchema.pre("validate", async function validateUser() {
  if (this.accountStatus === "ACTIVE" && !this.passwordHash) {
    let storedHashExists = false;

    if (
      !this.isNew &&
      !this.isModified("passwordHash") &&
      !this.isSelected("passwordHash")
    ) {
      let query = this.constructor.exists({
        _id: this._id,
        passwordHash: { $type: "string" },
      });
      const session = this.$session?.();
      if (session) query = query.session(session);
      storedHashExists = Boolean(await query);
    }

    if (!storedHashExists) {
      this.invalidate(
        "passwordHash",
        "An active local account requires a password hash.",
      );
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
    path: "department",
    Model: Department,
    id: this.department,
    organization: this.organization,
    label: "Department",
  });
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);
