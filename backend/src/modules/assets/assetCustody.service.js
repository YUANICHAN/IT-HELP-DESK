import { AppError } from "../../shared/errors/app-error.js";
import { User } from "../users/user.model.js";
import { Ticket } from "../tickets/ticket.model.js";
import { buildTicketAccessFilter } from "../tickets/ticket.policy.js";
import { AssetAssignment } from "./assetAssignment.model.js";
import { idOf } from "../../shared/validation/commands.js";
export function assetConflict(message) {
  throw new AppError(409, "ASSET_STATE_CONFLICT", message);
}
export async function activeCustody(asset, session = null) {
  return AssetAssignment.findOne({
    organization: asset.organization,
    asset: asset._id,
    returnedAt: null
  }).session(session);
}
export function assertCustodyInvariant(asset, custody) {
  if (asset.status === "ASSIGNED" && !custody || ["AVAILABLE", "RETIRED"].includes(asset.status) && custody) assetConflict("Asset custody is inconsistent; repair the data before continuing.");
}
async function endCustody(custody, auth, condition, notes, now, session) {
  const result = await AssetAssignment.updateOne({
    _id: custody._id,
    organization: custody.organization,
    returnedAt: null
  }, {
    $set: {
      returnedAt: now,
      returnedBy: auth.user.id,
      returnCondition: condition,
      returnNotes: notes || null
    }
  }, {
    session,
    runValidators: true
  });
  if (result.modifiedCount !== 1) assetConflict("Custody changed concurrently.");
}
export async function mutateCustody({
  action,
  input,
  asset,
  auth,
  department,
  location,
  session
}) {
  const custody = await activeCustody(asset, session),
    now = new Date();
  assertCustodyInvariant(asset, custody);
  const set = {},
    data = {};
  if (asset.status === "RETIRED") assetConflict("Retired assets cannot be changed.");
  if (action === "assign") {
    if (asset.status !== "AVAILABLE" || custody || !["GOOD", "FAIR"].includes(asset.condition)) assetConflict("Only usable AVAILABLE equipment can be assigned.");
    const employee = await User.findOne({
      _id: input.custodianId,
      organization: asset.organization,
      department: asset.department,
      role: "EMPLOYEE",
      accountStatus: "ACTIVE"
    }).session(session);
    if (!employee) throw new AppError(422, "CUSTODIAN_UNAVAILABLE", "Custodian must be an active employee in the asset's department.");
    const [assignment] = await AssetAssignment.create([{
      organization: asset.organization,
      asset: asset._id,
      custodian: employee._id,
      departmentSnapshot: {
        id: idOf(department),
        code: department.code,
        name: department.name
      },
      locationSnapshot: location ? {
        id: idOf(location),
        code: location.code,
        name: location.name
      } : null,
      assignedBy: auth.user.id,
      assignedAt: now,
      returnedAt: null
    }], {
      session
    });
    set.status = "ASSIGNED";
    set.location = location?._id || null;
    data.assignmentId = idOf(assignment);
  } else if (action === "return") {
    if (!custody) assetConflict("No current custody exists.");
    if (asset.status !== "ASSIGNED" || !["GOOD", "FAIR"].includes(asset.condition) || !["GOOD", "FAIR"].includes(input.condition)) assetConflict("A normal return requires ASSIGNED equipment in GOOD or FAIR condition. Resolve loss/repair through lifecycle commands first.");
    await endCustody(custody, auth, input.condition, input.notes, now, session);
    set.status = "AVAILABLE";
    set.condition = input.condition;
    data.assignmentId = idOf(custody);
  } else if (action === "state") {
    data.action = input.action;
    data.reason = input.reason;
    if (input.reference) data.reference = input.reference;
    if (input.action === "SEND_FOR_REPAIR") {
      if (!["AVAILABLE", "ASSIGNED"].includes(asset.status)) assetConflict("Only available or assigned equipment can enter repair.");
      const ticket = await Ticket.findOne({
        $and: [buildTicketAccessFilter(auth), {
          _id: input.ticketId,
          "assetSnapshots.assetId": idOf(asset),
          status: {
            $in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_REQUESTER", "WAITING_VENDOR"]
          }
        }]
      }).session(session);
      if (!ticket) throw new AppError(404, "TICKET_NOT_FOUND", "An accessible active ticket linked to this asset is required.");
      // Serialize against terminal transitions of the linked ticket without changing its public version.
      await Ticket.updateOne({
        _id: ticket._id,
        version: ticket.version
      }, {
        $inc: {
          assetLinkRevision: 1
        }
      }, {
        session,
        timestamps: false
      });
      set.status = "UNDER_REPAIR";
      set.repairTicket = ticket._id;
      if (input.condition) set.condition = input.condition;
      data.ticketId = idOf(ticket);
    } else if (input.action === "COMPLETE_REPAIR") {
      if (asset.status !== "UNDER_REPAIR" || !["GOOD", "FAIR"].includes(input.condition)) assetConflict("Repair completion requires usable equipment under repair.");
      set.status = custody ? "ASSIGNED" : "AVAILABLE";
      set.condition = input.condition;
      set.repairTicket = null;
    } else if (input.action === "MARK_LOST") {
      if (!["AVAILABLE", "ASSIGNED", "UNDER_REPAIR"].includes(asset.status)) assetConflict("This asset cannot be marked lost.");
      set.status = "LOST";
    } else if (input.action === "RECOVER") {
      if (asset.status !== "LOST" || !["GOOD", "FAIR"].includes(input.condition)) assetConflict("Recovery requires LOST equipment in usable condition.");
      set.status = custody ? "ASSIGNED" : "AVAILABLE";
      set.condition = input.condition;
      set.repairTicket = null;
    } else if (input.action === "RETIRE") {
      if (custody) await endCustody(custody, auth, input.condition || asset.condition, `${input.reason} (${input.reference})`.slice(0, 5000), now, session);
      set.status = "RETIRED";
      set.repairTicket = null;
      if (input.condition) set.condition = input.condition;
    }
  }
  return {
    set,
    data
  };
}
