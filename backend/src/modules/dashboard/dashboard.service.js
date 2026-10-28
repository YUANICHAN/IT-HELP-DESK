import mongoose from "mongoose";
import { Approval } from "../approvals/approval.model.js";
import { Asset } from "../assets/asset.model.js";
import { AssetAssignment } from "../assets/assetAssignment.model.js";
import { administratorHealth } from "../health/health.service.js";
import { Department } from "../organization/department.model.js";
import { Organization } from "../organization/organization.model.js";
import { ServiceItem } from "../catalog/serviceItem.model.js";
import { ticketSlaCycles } from "../service-levels/slaClock.service.js";
import { Ticket } from "../tickets/ticket.model.js";
import { TicketEvent } from "../tickets/ticketEvent.model.js";
import {
  buildCapabilityTicketFilter,
  buildQueueAccessFilter,
} from "../tickets/ticket.policy.js";
import { User } from "../users/user.model.js";
import {
  aggregateSafeFilter,
  withDepartment,
} from "../reporting/reporting.access.js";
import {
  OPEN_BACKLOG_STATUSES,
  assetAccountability,
  recurringEquipment,
  reportingContext,
  slaMetrics,
  ticketSnapshot,
} from "../reporting/reporting.service.js";

function period(field, filters) {
  return { [field]: { $gte: filters.from, $lt: filters.to } };
}

async function safeRecentUpdates(ticketFilter, limit = 10) {
  const rows = await TicketEvent.aggregate([
    { $match: aggregateSafeFilter({
      organization: (() => {
        const find = (value) => value?.organization ||
          ["$and", "$or"].flatMap((key) => value?.[key] || []).map(find).find(Boolean);
        return find(ticketFilter);
      })(),
      visibility: "PUBLIC",
    }) },
    {
      $lookup: {
        from: Ticket.collection.name,
        let: { ticketId: "$ticket" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$ticketId"] } } },
          { $match: aggregateSafeFilter(ticketFilter) },
          { $project: { reference: 1 } },
        ],
        as: "ticketRecord",
      },
    },
    { $unwind: "$ticketRecord" },
    { $sort: { occurredAt: -1, _id: -1 } },
    { $limit: limit },
    { $project: {
      _id: 1,
      type: 1,
      occurredAt: 1,
      ticket: 1,
      reference: "$ticketRecord.reference",
    } },
  ]);
  return rows.map((row) => ({
    id: row._id.toString(),
    type: row.type,
    ticketId: row.ticket.toString(),
    reference: row.reference,
    occurredAt: row.occurredAt.toISOString(),
  }));
}

async function assignedEquipment(auth, departmentId) {
  const rows = await AssetAssignment.aggregate([
    { $match: aggregateSafeFilter({
      organization: auth.user.organizationId,
      custodian: auth.user.id,
      returnedAt: null,
    }) },
    {
      $lookup: {
        from: Asset.collection.name,
        let: { assetId: "$asset" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$assetId"] } } },
          ...(departmentId ? [{ $match: { department: departmentId } }] : []),
          { $project: { assetTag: 1, category: 1, model: 1, status: 1 } },
        ],
        as: "assetRecord",
      },
    },
    { $unwind: "$assetRecord" },
    { $sort: { assignedAt: -1, _id: -1 } },
    { $limit: 25 },
  ]);
  return rows.map((row) => ({
    assetId: row.asset.toString(),
    assetTag: row.assetRecord.assetTag,
    category: row.assetRecord.category,
    model: row.assetRecord.model || null,
    status: row.assetRecord.status,
    assignedAt: row.assignedAt.toISOString(),
  }));
}

async function personalSection(auth, departmentId, filters) {
  const own = withDepartment({
    organization: auth.user.organizationId,
    requester: auth.user.id,
  }, departmentId);
  const [snapshot, waiting, recentResolutions, equipment, updates] = await Promise.all([
    ticketSnapshot(own),
    Ticket.countDocuments({ $and: [own, { status: "WAITING_REQUESTER" }] }),
    Ticket.find({
      $and: [own, { "resolution.resolvedAt": { $gte: filters.from, $lt: filters.to } }],
    }).select("reference title status resolution.resolvedAt").sort({ "resolution.resolvedAt": -1, _id: -1 }).limit(10).lean(),
    assignedEquipment(auth, departmentId),
    safeRecentUpdates(own),
  ]);
  return {
    activeTickets: snapshot.openBacklog,
    waitingForMyReply: waiting,
    awaitingConfirmation: snapshot.awaitingConfirmation,
    recentResolutions: recentResolutions.map((ticket) => ({
      id: ticket._id.toString(),
      reference: ticket.reference,
      title: ticket.title,
      status: ticket.status,
      resolvedAt: ticket.resolution.resolvedAt.toISOString(),
    })),
    assignedEquipment: equipment,
    recentUpdates: updates,
  };
}

async function workList(ticketFilter, asOf) {
  const tickets = await Ticket.find(ticketFilter)
    .select("organization reference title priority status requesterDepartment submittedAt slaCycleNumber")
    .sort({ priority: 1, submittedAt: 1, _id: 1 })
    .limit(10)
    .lean();
  const records = [];
  for (const ticket of tickets) {
    const cycles = await ticketSlaCycles(ticket, asOf);
    const cycle = cycles.find((row) => row.cycleNumber === ticket.slaCycleNumber);
    records.push({
      id: ticket._id.toString(),
      reference: ticket.reference,
      title: ticket.title,
      priority: ticket.priority,
      status: ticket.status,
      responseDueAt: cycle?.response?.dueAt?.toISOString?.() || null,
      resolutionDueAt: cycle?.resolution?.dueAt?.toISOString?.() || null,
      resolutionDueAtAuthoritative: cycle?.resolution?.dueAtAuthoritative ?? null,
    });
  }
  records.sort((left, right) =>
    left.priority.localeCompare(right.priority) ||
    String(left.resolutionDueAt || left.responseDueAt || "9999").localeCompare(
      String(right.resolutionDueAt || right.responseDueAt || "9999"),
    ));
  return records;
}

async function technicianSection(auth, departmentId, filters, asOf) {
  const support = withDepartment(
    buildCapabilityTicketFilter(auth, "support"),
    departmentId,
  );
  const assigned = {
    $and: [
      support,
      { assignee: auth.user.id, status: { $in: OPEN_BACKLOG_STATUSES } },
    ],
  };
  const queue = withDepartment(buildQueueAccessFilter(auth), departmentId);
  const [assignedCount, queueCount, resolvedInPeriod, indicators, assignedWork] =
    await Promise.all([
      Ticket.countDocuments(assigned),
      Ticket.countDocuments(queue),
      Ticket.countDocuments({
        $and: [
          support,
          { assignee: auth.user.id },
          period("resolution.resolvedAt", filters),
        ],
      }),
      slaMetrics(assigned, filters, asOf),
      workList(assigned, asOf),
    ]);
  return {
    assignedActive: assignedCount,
    eligibleUnassigned: queueCount,
    resolvedByMeInPeriod: resolvedInPeriod,
    assignedWork,
    serviceIndicators: indicators.currentOverdueWorkload,
  };
}

async function approvalCount(auth, scope) {
  const userId = new mongoose.Types.ObjectId(auth.user.id);
  const orgId = new mongoose.Types.ObjectId(auth.user.organizationId);
  const [result] = await Approval.aggregate([
    { $match: { organization: orgId, approver: userId, status: "PENDING" } },
    {
      $lookup: {
        from: Ticket.collection.name,
        let: { ticketId: "$ticket" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$ticketId"] } } },
          { $match: aggregateSafeFilter(scope) },
          { $match: { status: "WAITING_APPROVAL", approvalStatus: "PENDING" } },
          { $project: { currentApprovalRound: 1 } },
        ],
        as: "ticketRecord",
      },
    },
    { $unwind: "$ticketRecord" },
    { $match: { $expr: { $eq: ["$round", "$ticketRecord.currentApprovalRound"] } } },
    { $count: "count" },
  ]);
  return result?.count || 0;
}

async function workload(ticketFilter) {
  const rows = await Ticket.aggregate([
    { $match: aggregateSafeFilter({
      $and: [ticketFilter, { status: { $in: OPEN_BACKLOG_STATUSES } }],
    }) },
    { $group: { _id: "$assignee", count: { $sum: 1 } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "assignee",
      },
    },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 50 },
  ]);
  return rows.map((row) => ({
    assigneeId: row._id?.toString() || null,
    displayName: row.assignee[0]?.displayName || "Unassigned",
    activeTickets: row.count,
  }));
}

async function supervisorSections(auth, departmentId, filters, asOf) {
  const result = {};
  const supervision = withDepartment(
    buildCapabilityTicketFilter(auth, "department_supervise"),
    departmentId,
  );
  const hasSupervision = auth.permissions.some((grant) => grant.capability === "department_supervise");
  if (hasSupervision) {
    const [backlog, approvals, aging, recurring] = await Promise.all([
      ticketSnapshot(supervision),
      approvalCount(auth, supervision),
      Ticket.countDocuments({
        $and: [
          supervision,
          { status: { $in: OPEN_BACKLOG_STATUSES } },
          { submittedAt: { $lt: new Date(asOf.getTime() - 7 * 86_400_000) } },
        ],
      }),
      recurringEquipment(auth, supervision, departmentId, filters),
    ]);
    result.departmentSupervision = {
      backlog,
      approvalsAssignedToMe: approvals,
      agingOverSevenCalendarDays: aging,
      agingUnit: "calendar_days",
      recurringEquipmentIssues: recurring,
    };
  }
  const triage = withDepartment(
    buildCapabilityTicketFilter(auth, "ticket_triage"),
    departmentId,
  );
  const hasTriage = auth.permissions.some((grant) => grant.capability === "ticket_triage");
  if (hasTriage) {
    const [backlog, serviceLevels, distribution, dueWork] = await Promise.all([
      ticketSnapshot(triage),
      slaMetrics(triage, filters, asOf),
      workload(triage),
      workList({ $and: [triage, { status: { $in: OPEN_BACKLOG_STATUSES } }] }, asOf),
    ]);
    result.triage = {
      backlog,
      dueWork,
      breachedWork: serviceLevels.currentOverdueWorkload,
      workloadDistribution: distribution,
      responseSummary: serviceLevels.firstResponse,
      resolutionSummary: serviceLevels.resolutionTime,
      resolutionTargetAttainment: serviceLevels.resolutionTargetAttainment,
    };
  }
  return result;
}

async function administratorSection(auth) {
  const orgId = auth.user.organizationId;
  const [health, accountRows, inactiveDepartments, approvalServices, departmentsWithoutApprover, organization] =
    await Promise.all([
      administratorHealth(orgId),
      User.aggregate([
        { $match: { organization: new mongoose.Types.ObjectId(orgId) } },
        { $group: { _id: "$accountStatus", count: { $sum: 1 } } },
      ]),
      Department.countDocuments({ organization: orgId, isActive: false }),
      ServiceItem.countDocuments({ organization: orgId, isActive: true, requiresApproval: true }),
      Department.countDocuments({
        organization: orgId,
        isActive: true,
        designatedApprover: { $exists: false },
      }),
      Organization.findById(orgId).select("backupApprover").lean(),
    ]);
  return {
    health,
    accounts: Object.fromEntries(accountRows.map((row) => [row._id, row.count])),
    configurationIssues: {
      inactiveDepartments,
      approvalRequiredServices: approvalServices,
      departmentsWithoutDesignatedApprover: departmentsWithoutApprover,
      organizationBackupApproverConfigured: Boolean(organization?.backupApprover),
    },
  };
}

export async function dashboard(authentication, filters, asOf) {
  const context = await reportingContext(authentication, filters, asOf);
  const { auth, departmentId } = context;
  const sections = {};
  if (auth.user.role === "ADMINISTRATOR") {
    sections.administration = await administratorSection(auth);
  } else {
    sections.personal = await personalSection(auth, departmentId, filters);
    if (auth.user.role === "TECHNICIAN") {
      sections.technician = await technicianSection(auth, departmentId, filters, asOf);
    }
    if (auth.user.role === "SUPERVISOR") {
      Object.assign(sections, await supervisorSections(auth, departmentId, filters, asOf));
    }
  }
  return {
    generatedAt: asOf.toISOString(),
    timezone: authentication.organization.timezone,
    period: {
      startInclusive: filters.from.toISOString(),
      endExclusive: filters.to.toISOString(),
    },
    appliedFilters: { departmentId: departmentId?.toString() || null },
    units: { durations: "seconds", serviceDurations: "business_seconds" },
    sections,
  };
}
