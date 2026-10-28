import mongoose from "mongoose";
import { currentAccess } from "../access/currentAccess.service.js";
import { Asset } from "../assets/asset.model.js";
import { AssetAssignment } from "../assets/assetAssignment.model.js";
import { AssetEvent } from "../assets/assetEvent.model.js";
import { assetAccessFilter } from "../assets/asset.policy.js";
import { SlaBreach } from "../service-levels/slaBreach.model.js";
import { measureCycle } from "../service-levels/slaClock.service.js";
import { SlaCycle } from "../service-levels/slaCycle.model.js";
import { SlaPause } from "../service-levels/slaPause.model.js";
import { Ticket } from "../tickets/ticket.model.js";
import { TicketEvent } from "../tickets/ticketEvent.model.js";
import { TicketWorklog } from "../tickets/ticketWorklog.model.js";
import {
  buildInternalTicketAccessFilter,
  buildTicketAccessFilter,
} from "../tickets/ticket.policy.js";
import { clockNow } from "../../shared/time/clock.js";
import {
  aggregateSafeFilter,
  authorizeDepartmentFilter,
  withDepartment,
} from "./reporting.access.js";

export const OPEN_BACKLOG_STATUSES = Object.freeze([
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_APPROVAL",
  "WAITING_REQUESTER",
  "WAITING_VENDOR",
]);

function periodMatch(field, filters) {
  return { [field]: { $gte: filters.from, $lt: filters.to } };
}

function namedCounts(rows) {
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

function organizationFromFilter(filter) {
  if (filter?.organization) return filter.organization;
  for (const operator of ["$and", "$or"]) {
    for (const nested of filter?.[operator] || []) {
      const organization = organizationFromFilter(nested);
      if (organization) return organization;
    }
  }
  return null;
}

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return Math.round(
    sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower),
  );
}

function distribution(values) {
  return {
    measured: values.length,
    medianSeconds: percentile(values, 0.5),
    p90Seconds: percentile(values, 0.9),
    unit: "business_seconds",
    percentileMethod: "linear_interpolation_sorted_sample",
  };
}

async function ticketSnapshot(ticketFilter) {
  const [result] = await Ticket.aggregate([
    { $match: aggregateSafeFilter(ticketFilter) },
    {
      $facet: {
        open: [
          { $match: { status: { $in: OPEN_BACKLOG_STATUSES } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
        awaitingConfirmation: [
          { $match: { status: "RESOLVED" } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
        status: [
          { $match: { status: { $in: [...OPEN_BACKLOG_STATUSES, "RESOLVED"] } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        priority: [
          { $match: { status: { $in: OPEN_BACKLOG_STATUSES } } },
          { $group: { _id: "$priority", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);
  return {
    openBacklog: result.open[0]?.count || 0,
    awaitingConfirmation: result.awaitingConfirmation[0]?.count || 0,
    byStatus: namedCounts(result.status),
    openByPriority: namedCounts(result.priority),
  };
}

async function processCycleBatch(batch, asOf, consume) {
  const keys = batch.map((cycle) => ({
    ticket: cycle.ticket,
    cycleNumber: cycle.cycleNumber,
  }));
  const ticketIds = [...new Set(batch.map((cycle) => cycle.ticket.toString()))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const cycleIds = batch.map((cycle) => cycle._id);
  const [pauses, breaches] = await Promise.all([
    SlaPause.find({
      ticket: { $in: ticketIds },
      $or: keys,
    }).lean(),
    SlaBreach.find({ cycle: { $in: cycleIds } }).lean(),
  ]);
  const pausesByCycle = new Map();
  for (const pause of pauses) {
    const key = `${pause.ticket}:${pause.cycleNumber}`;
    if (!pausesByCycle.has(key)) pausesByCycle.set(key, []);
    pausesByCycle.get(key).push(pause);
  }
  const breachesByCycle = new Map();
  for (const breach of breaches) {
    const key = breach.cycle.toString();
    if (!breachesByCycle.has(key)) breachesByCycle.set(key, []);
    breachesByCycle.get(key).push(breach);
  }
  for (const cycle of batch) {
    try {
      const measured = measureCycle(
        cycle,
        pausesByCycle.get(`${cycle.ticket}:${cycle.cycleNumber}`) || [],
        breachesByCycle.get(cycle._id.toString()) || [],
        asOf,
      );
      consume(measured, cycle);
    } catch (error) {
      if (error.code !== "SLA_RECONCILIATION_REQUIRED") throw error;
      consume(null, cycle);
    }
  }
}

async function forEachAccessibleCycle({ ticketFilter, cycleMatch, asOf, consume }) {
  const cursor = SlaCycle.aggregate([
    {
      $match: aggregateSafeFilter({
        organization: organizationFromFilter(ticketFilter),
        ...cycleMatch,
      }),
    },
    {
      $lookup: {
        from: Ticket.collection.name,
        let: { ticketId: "$ticket" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$ticketId"] } } },
          { $match: aggregateSafeFilter(ticketFilter) },
          { $project: { _id: 1 } },
        ],
        as: "permittedTicket",
      },
    },
    { $match: { "permittedTicket.0": { $exists: true } } },
    { $unset: "permittedTicket" },
    { $sort: { _id: 1 } },
  ]).cursor({ batchSize: 250 });
  let batch = [];
  for await (const cycle of cursor) {
    batch.push(cycle);
    if (batch.length === 250) {
      await processCycleBatch(batch, asOf, consume);
      batch = [];
    }
  }
  if (batch.length) await processCycleBatch(batch, asOf, consume);
}

async function slaMetrics(ticketFilter, filters, asOf) {
  const firstResponseValues = [];
  const responseCohort = await Ticket.countDocuments({
    $and: [ticketFilter, periodMatch("submittedAt", filters)],
  });
  let responseCycles = 0;
  let unanswered = 0;
  let reconciliationRequired = 0;
  const unresolvedTicketsFromSubmittedCohort = await Ticket.countDocuments({
    $and: [
      ticketFilter,
      periodMatch("submittedAt", filters),
      { status: { $in: OPEN_BACKLOG_STATUSES } },
    ],
  });
  await forEachAccessibleCycle({
    ticketFilter: {
      $and: [ticketFilter, periodMatch("submittedAt", filters)],
    },
    cycleMatch: { cycleNumber: 1 },
    asOf,
    consume(measured) {
      responseCycles += 1;
      if (!measured) reconciliationRequired += 1;
      else if (measured.response.completedAt) {
        firstResponseValues.push(measured.response.elapsedBusinessSeconds);
      } else unanswered += 1;
    },
  });
  const missingInitialCycles = Math.max(0, responseCohort - responseCycles);
  reconciliationRequired += missingInitialCycles;

  const resolutionValues = [];
  let attainmentNumerator = 0;
  let attainmentDenominator = 0;
  let cancelled = 0;
  let rejected = 0;
  await forEachAccessibleCycle({
    ticketFilter,
    cycleMatch: {
      endedAt: { $gte: filters.from, $lt: filters.to },
      endReason: { $in: ["RESOLVED", "CANCELLED", "REJECTED"] },
    },
    asOf,
    consume(measured, cycle) {
      if (!measured) {
        reconciliationRequired += 1;
        return;
      }
      if (cycle.endReason === "CANCELLED") cancelled += 1;
      else if (cycle.endReason === "REJECTED") rejected += 1;
      else {
        attainmentDenominator += 1;
        resolutionValues.push(measured.resolution.elapsedBusinessSeconds);
        if (measured.resolution.status === "MET") attainmentNumerator += 1;
      }
    },
  });

  const overdue = {
    tickets: new Set(),
    response: 0,
    resolution: 0,
    historicalBreachEvidence: 0,
    pausedResolution: 0,
  };
  await forEachAccessibleCycle({
    ticketFilter: {
      $and: [ticketFilter, { status: { $in: OPEN_BACKLOG_STATUSES } }],
    },
    cycleMatch: { isOpen: true },
    asOf,
    consume(measured, cycle) {
      if (!measured) {
        reconciliationRequired += 1;
        return;
      }
      const lateResponse = measured.response.status === "BREACHED";
      const lateResolution = measured.resolution.status === "BREACHED";
      if (lateResponse) overdue.response += 1;
      if (lateResolution) overdue.resolution += 1;
      if (lateResponse || lateResolution) overdue.tickets.add(cycle.ticket.toString());
      if (measured.resolution.status === "PAUSED") overdue.pausedResolution += 1;
      if (measured.response.historicalBreach || measured.resolution.historicalBreach) {
        overdue.historicalBreachEvidence += 1;
      }
    },
  });

  return {
    firstResponse: {
      cohort: "tickets_submitted_in_period_initial_cycle",
      sampleSize: responseCohort,
      answered: firstResponseValues.length,
      unanswered,
      unreconciled: missingInitialCycles,
      ...distribution(firstResponseValues),
    },
    resolutionTime: {
      cohort: "eligible_resolved_cycles_ending_in_period",
      unresolvedTicketsFromSubmittedCohort,
      ...distribution(resolutionValues),
    },
    resolutionTargetAttainment: {
      cohort: "eligible_resolved_cycles_ending_in_period",
      numerator: attainmentNumerator,
      denominator: attainmentDenominator,
      percentage: attainmentDenominator
        ? Math.round((attainmentNumerator / attainmentDenominator) * 10_000) / 100
        : null,
      excludedOutcomes: { cancelled, rejected },
      unit: "percent",
    },
    currentOverdueWorkload: {
      asOf: asOf.toISOString(),
      distinctTickets: overdue.tickets.size,
      responseMetrics: overdue.response,
      resolutionMetrics: overdue.resolution,
      pausedResolutionMetrics: overdue.pausedResolution,
      historicalBreachEvidence: overdue.historicalBreachEvidence,
    },
    reconciliationRequired,
  };
}

async function reopeningMetrics(ticketFilter, filters) {
  const [result] = await TicketEvent.aggregate([
    {
      $match: aggregateSafeFilter({
        organization: organizationFromFilter(ticketFilter),
        type: "REOPENED",
        occurredAt: { $gte: filters.from, $lt: filters.to },
      }),
    },
    {
      $lookup: {
        from: Ticket.collection.name,
        let: { ticketId: "$ticket" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$ticketId"] } } },
          { $match: aggregateSafeFilter(ticketFilter) },
          { $project: { _id: 1 } },
        ],
        as: "permittedTicket",
      },
    },
    { $match: { "permittedTicket.0": { $exists: true } } },
    {
      $group: {
        _id: null,
        events: { $sum: 1 },
        tickets: { $addToSet: "$ticket" },
      },
    },
  ]);
  return {
    events: result?.events || 0,
    distinctTickets: result?.tickets?.length || 0,
  };
}

async function workEffort(auth, departmentId, filters) {
  const available = (auth.permissions || []).some((grant) =>
    ["support", "ticket_triage"].includes(grant.capability));
  if (!available) {
    return { available: false, totalSeconds: null, entries: null, unit: "seconds" };
  }
  const internal = withDepartment(buildInternalTicketAccessFilter(auth), departmentId);
  const [result] = await TicketWorklog.aggregate([
    {
      $match: aggregateSafeFilter({
        organization: auth.user.organizationId,
        start: { $gte: filters.from, $lt: filters.to },
      }),
    },
    {
      $lookup: {
        from: Ticket.collection.name,
        let: { ticketId: "$ticket" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$ticketId"] } } },
          { $match: aggregateSafeFilter(internal) },
          { $project: { _id: 1 } },
        ],
        as: "permittedTicket",
      },
    },
    { $match: { "permittedTicket.0": { $exists: true } } },
    { $group: { _id: null, totalSeconds: { $sum: "$durationSeconds" }, entries: { $sum: 1 } } },
  ]);
  return {
    available: true,
    totalSeconds: result?.totalSeconds || 0,
    entries: result?.entries || 0,
    unit: "seconds",
  };
}

async function recurringEquipment(auth, ticketFilter, departmentId, filters) {
  const assetFilter = await assetAccessFilter(auth);
  const scopedAssetFilter = departmentId
    ? { $and: [assetFilter, { department: departmentId }] }
    : assetFilter;
  const rows = await AssetEvent.aggregate([
    {
      $match: aggregateSafeFilter({
        organization: auth.user.organizationId,
        type: "STATE_CHANGED",
        "data.action": "SEND_FOR_REPAIR",
        occurredAt: { $gte: filters.from, $lt: filters.to },
      }),
    },
    {
      $lookup: {
        from: Asset.collection.name,
        let: { assetId: "$asset" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$assetId"] } } },
          { $match: aggregateSafeFilter(scopedAssetFilter) },
          { $project: { assetTag: 1, category: 1 } },
        ],
        as: "assetRecord",
      },
    },
    { $unwind: "$assetRecord" },
    {
      $lookup: {
        from: Ticket.collection.name,
        let: {
          ticketId: {
            $convert: { input: "$data.ticketId", to: "objectId", onError: null, onNull: null },
          },
        },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$ticketId"] } } },
          { $match: aggregateSafeFilter(ticketFilter) },
          { $project: { _id: 1 } },
        ],
        as: "permittedTicket",
      },
    },
    { $match: { "permittedTicket.0": { $exists: true } } },
    {
      $group: {
        _id: "$asset",
        assetTag: { $first: "$assetRecord.assetTag" },
        category: { $first: "$assetRecord.category" },
        repairEvents: { $sum: 1 },
      },
    },
    { $sort: { repairEvents: -1, assetTag: 1, _id: 1 } },
    { $limit: 25 },
  ]);
  return {
    definition: "permitted_SEND_FOR_REPAIR_asset_events_in_period",
    repairEvents: rows.reduce((total, row) => total + row.repairEvents, 0),
    recurringAssets: rows.filter((row) => row.repairEvents > 1).length,
    assets: rows.map((row) => ({
      assetId: row._id.toString(),
      assetTag: row.assetTag,
      category: row.category,
      repairEvents: row.repairEvents,
    })),
  };
}

async function assetAccountability(auth, departmentId) {
  const access = await assetAccessFilter(auth);
  const filter = departmentId
    ? { $and: [access, { department: departmentId }] }
    : access;
  const [result] = await Asset.aggregate([
    { $match: aggregateSafeFilter(filter) },
    {
      $lookup: {
        from: AssetAssignment.collection.name,
        let: { assetId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$asset", "$$assetId"] },
            { $eq: ["$returnedAt", null] },
          ] } } },
          { $project: { _id: 1 } },
        ],
        as: "activeAssignments",
      },
    },
    { $set: { activeAssignmentCount: { $size: "$activeAssignments" } } },
    {
      $group: {
        _id: null,
        totalAssets: { $sum: 1 },
        activeAssignments: { $sum: "$activeAssignmentCount" },
        sharedUnassigned: { $sum: { $cond: [
          { $and: ["$shared", { $eq: ["$activeAssignmentCount", 0] }] }, 1, 0,
        ] } },
        explicitUnassigned: { $sum: { $cond: [
          { $and: [
            { $eq: ["$shared", false] },
            { $eq: ["$activeAssignmentCount", 0] },
            { $in: ["$status", ["AVAILABLE", "UNDER_REPAIR", "LOST", "RETIRED"]] },
          ] }, 1, 0,
        ] } },
        exceptions: { $sum: { $cond: [
          { $or: [
            { $gt: ["$activeAssignmentCount", 1] },
            { $and: [{ $eq: ["$status", "ASSIGNED"] }, { $ne: ["$activeAssignmentCount", 1] }] },
            { $and: [{ $in: ["$status", ["AVAILABLE", "RETIRED"]] }, { $ne: ["$activeAssignmentCount", 0] }] },
          ] }, 1, 0,
        ] } },
      },
    },
  ]);
  return {
    totalAssets: result?.totalAssets || 0,
    activeAssignments: result?.activeAssignments || 0,
    sharedUnassigned: result?.sharedUnassigned || 0,
    explicitUnassigned: result?.explicitUnassigned || 0,
    exceptions: result?.exceptions || 0,
  };
}

export async function reportingContext(authentication, filters, asOf = clockNow()) {
  const auth = await currentAccess(authentication);
  const departmentId = await authorizeDepartmentFilter(auth, filters.departmentId);
  const ticketFilter = withDepartment(buildTicketAccessFilter(auth), departmentId);
  return { auth, departmentId, ticketFilter, asOf };
}

export async function overviewReport(authentication, filters, asOf = clockNow()) {
  const context = await reportingContext(authentication, filters, asOf);
  const { auth, departmentId, ticketFilter } = context;
  const [backlog, sla, reopenings, effort, recurring, accountability] = await Promise.all([
    ticketSnapshot(ticketFilter),
    slaMetrics(ticketFilter, filters, asOf),
    reopeningMetrics(ticketFilter, filters),
    workEffort(auth, departmentId, filters),
    recurringEquipment(auth, ticketFilter, departmentId, filters),
    assetAccountability(auth, departmentId),
  ]);
  return {
    generatedAt: asOf.toISOString(),
    timezone: authentication.organization.timezone,
    period: {
      startInclusive: filters.from.toISOString(),
      endExclusive: filters.to.toISOString(),
    },
    appliedFilters: {
      departmentId: departmentId?.toString() || null,
    },
    cohortDefinitions: {
      backlog: "current_snapshot",
      completed: "cycle_end_in_period",
      submitted: "ticket_submission_in_period",
    },
    backlog,
    serviceLevels: sla,
    reopenings,
    workEffort: effort,
    recurringEquipmentIssues: recurring,
    assetAccountability: accountability,
  };
}

export { ticketSnapshot, slaMetrics, recurringEquipment, assetAccountability };
