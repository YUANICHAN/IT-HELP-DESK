import mongoose from "mongoose";
import { Ticket } from "../tickets/ticket.model.js";
import { User } from "../users/user.model.js";
import { requireOrganizationOwnedReference } from "../../shared/validation/organization-reference.js";
import { same } from "../../shared/validation/commands.js";
const {
  Schema
} = mongoose;
export const APPROVAL_STATUSES = Object.freeze(["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"]);
const schema = new Schema({
  organization: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    immutable: true
  },
  ticket: {
    type: Schema.Types.ObjectId,
    ref: "Ticket",
    required: true,
    immutable: true
  },
  round: {
    type: Number,
    required: true,
    min: 1,
    immutable: true,
    validate: Number.isSafeInteger
  },
  approver: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  status: {
    type: String,
    enum: APPROVAL_STATUSES,
    required: true,
    default: "PENDING"
  },
  requestedAt: {
    type: Date,
    required: true,
    immutable: true
  },
  decidedAt: {
    type: Date,
    default: null
  },
  decidedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  decisionNote: {
    type: String,
    maxlength: 2000,
    default: null
  },
  supersededAt: {
    type: Date,
    default: null
  },
  supersededBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  supersededReason: {
    type: String,
    maxlength: 5000,
    default: null
  }
}, {
  strict: "throw",
  timestamps: true,
  versionKey: false
});
schema.index({
  organization: 1,
  ticket: 1,
  round: 1
}, {
  unique: true,
  name: "approval_ticket_round_unique"
});
schema.index({
  organization: 1,
  ticket: 1
}, {
  unique: true,
  partialFilterExpression: {
    status: "PENDING"
  },
  name: "approval_one_pending_per_ticket"
});
schema.index({
  organization: 1,
  approver: 1,
  status: 1,
  requestedAt: -1
}, {
  name: "approval_inbox"
});
schema.pre("validate", async function () {
  const ticket = await requireOrganizationOwnedReference({
    document: this,
    path: "ticket",
    Model: Ticket,
    id: this.ticket,
    organization: this.organization,
    label: "Ticket",
    select: {
      requester: 1,
      type: 1,
      approvalRequired: 1
    }
  });
  for (const field of ["approver", "decidedBy", "supersededBy"]) {
    await requireOrganizationOwnedReference({
      document: this,
      path: field,
      Model: User,
      id: this[field],
      organization: this.organization,
      label: "Approval actor"
    });
  }
  if (ticket && same(ticket.requester, this.approver)) this.invalidate("approver", "Requester cannot approve their own request.");
  if (ticket && (ticket.type !== "REQUEST" || !ticket.approvalRequired)) this.invalidate("ticket", "Approval requires an approval-required request.");
});
export const Approval = mongoose.models.Approval || mongoose.model("Approval", schema);
