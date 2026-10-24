import mongoose from "mongoose";
import { Organization } from "../organization/organization.model.js";
import { requireReference } from "../../shared/validation/organization-reference.js";

const { Schema } = mongoose;

const businessCalendarSchema = new Schema(
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
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "Asia/Manila",
      maxlength: 100,
    },
    weeklyWindows: {
      type: [Schema.Types.Mixed],
      required: true,
      default: () => [],
    },
    holidays: {
      type: [Schema.Types.Mixed],
      required: true,
      default: () => [],
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { strict: "throw", timestamps: true },
);

businessCalendarSchema.index(
  { organization: 1, name: 1 },
  { unique: true, name: "business_calendar_organization_name_unique" },
);

businessCalendarSchema.pre("validate", async function validateOrganization() {
  await requireReference({
    document: this,
    path: "organization",
    Model: Organization,
    id: this.organization,
    label: "Organization",
    select: { _id: 1 },
  });
});

export const BusinessCalendar =
  mongoose.models.BusinessCalendar ||
  mongoose.model("BusinessCalendar", businessCalendarSchema);
