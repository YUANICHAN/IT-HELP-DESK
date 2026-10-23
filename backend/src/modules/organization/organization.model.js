import mongoose from "mongoose";

const { Schema } = mongoose;

export const ORGANIZATION_TYPES = Object.freeze(["COMPANY", "GOVERNMENT"]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const organizationSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Organization name is required."],
      trim: true,
      minlength: [2, "Organization name must contain at least 2 characters."],
      maxlength: [200, "Organization name cannot exceed 200 characters."],
    },
    organizationType: {
      type: String,
      required: [true, "Organization type is required."],
      enum: {
        values: ORGANIZATION_TYPES,
        message: "Organization type must be COMPANY or GOVERNMENT.",
      },
    },
    timezone: {
      type: String,
      required: [true, "Timezone is required."],
      trim: true,
      default: "Asia/Manila",
      validate: {
        validator: isValidTimezone,
        message: "Timezone must be a valid IANA timezone.",
      },
    },
    supportEmail: {
      type: String,
      required: [true, "Support email is required."],
      trim: true,
      lowercase: true,
      maxlength: [320, "Support email cannot exceed 320 characters."],
      match: [EMAIL_PATTERN, "Support email must be a valid email address."],
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

export const Organization =
  mongoose.models.Organization ||
  mongoose.model("Organization", organizationSchema);
