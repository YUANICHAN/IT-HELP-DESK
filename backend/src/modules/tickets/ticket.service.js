import mongoose from "mongoose";
import { AccessGrant } from "../access/accessGrant.model.js";
import { recordRequiredAuditEvent } from "../auth/audit.service.js";
import { loadTicketConfiguration } from "../service-levels/configuration.service.js";
import { SlaCycle } from "../service-levels/slaCycle.model.js";
import { Location } from "../organization/location.model.js";
import { User } from "../users/user.model.js";
import { OutboxEvent } from "../outbox/outboxEvent.model.js";
import {
  assertIdempotencyInput,
  findIdempotencyRecord,
  requestDigest,
  saveIdempotencyRecord,
} from "../../shared/database/idempotency.js";
import {
  isDuplicateKeyError,
  runRequiredTransaction,
} from "../../shared/database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { Ticket } from "./ticket.model.js";
import { TicketComment } from "./ticketComment.model.js";
import { TicketCounter } from "./ticketCounter.model.js";
import { TicketEvent } from "./ticketEvent.model.js";
import {
  buildQueueAccessFilter,
  buildTicketAccessFilter,
  canUseSupportScope,
} from "./ticket.policy.js";
import {
  serializeComment,
  serializeEvent,
  serializeTicket,
} from "./ticket.serializer.js";

const PRIORITY_BY_URGENCY = Object.freeze({ HIGH: "P2", MEDIUM: "P3", LOW: "P4" });

function validObjectId(value) {
  return mongoose.isObjectIdOrHexString(value);
}

function notFound() {
  return new AppError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
}

function staleVersion() {
  return new AppError(
    409,
    "STALE_TICKET_VERSION",
    "The ticket changed since it was loaded. Refresh it and retry.",
  );
}

function invalidTransition(message) {
  return new AppError(409, "INVALID_TICKET_TRANSITION", message);
}

function populateTicket(query) {
  return query
    .populate("requester", "displayName")
    .populate("requesterDepartment", "code name")
    .populate("assignee", "displayName")
    .populate("location", "code name building room");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function filterFromQuery(filters) {
  const clauses = [];
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.type) clauses.push({ type: filters.type });
  if (filters.from || filters.to) {
    clauses.push({
      submittedAt: {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      },
    });
  }
  if (filters.search) {
    const pattern = new RegExp(escapeRegex(filters.search), "iu");
    clauses.push({ $or: [{ reference: pattern }, { title: pattern }] });
  }
  return clauses;
}

async function accessibleTicket(authentication, ticketId, mongoSession) {
  if (!validObjectId(ticketId)) throw notFound();
  let query = Ticket.findOne({
    $and: [{ _id: ticketId }, buildTicketAccessFilter(authentication)],
  });
  if (mongoSession) query = query.session(mongoSession);
  const ticket = await populateTicket(query);
  if (!ticket) throw notFound();
  return ticket;
}

async function activeActor(authentication, mongoSession) {
  const actor = await User.findOne({
    _id: authentication.user.id,
    organization: authentication.user.organizationId,
    accountStatus: "ACTIVE",
  })
    .session(mongoSession)
    .lean();
  if (!actor) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Valid authentication is required.");
  }
  return actor;
}

async function freshGrant(actor, capability, departmentId, mongoSession) {
  return Boolean(
    await AccessGrant.exists({
      organization: actor.organization,
      user: actor._id,
      capability,
      isActive: true,
      revokedAt: { $exists: false },
      $or: [{ department: departmentId }, { department: null }],
    }).session(mongoSession),
  );
}

async function requireFreshSupport(authentication, ticket, mongoSession) {
  const actor = await activeActor(authentication, mongoSession);
  if (
    actor.role !== "TECHNICIAN" ||
    !(await freshGrant(actor, "support", ticket.requesterDepartment, mongoSession))
  ) {
    throw new AppError(
      403,
      "SUPPORT_SCOPE_REQUIRED",
      "An active support grant for the ticket department is required.",
    );
  }
  return actor;
}

async function requireFreshCommentAccess(authentication, ticket, mongoSession) {
  const actor = await activeActor(authentication, mongoSession);
  if (ticket.requester.toString() === actor._id.toString()) return actor;

  const support =
    ticket.assignee?.toString() === actor._id.toString() &&
    (await freshGrant(actor, "support", ticket.requesterDepartment, mongoSession));
  const supervision = await freshGrant(
    actor,
    "department_supervise",
    ticket.requesterDepartment,
    mongoSession,
  );
  const triage = await freshGrant(
    actor,
    "ticket_triage",
    ticket.requesterDepartment,
    mongoSession,
  );
  if (!support && !supervision && !triage) throw notFound();
  return actor;
}

async function createEvent(document, mongoSession) {
  await TicketEvent.create([document], { session: mongoSession });
}

async function createOutbox(document, mongoSession) {
  await OutboxEvent.create([document], { session: mongoSession });
}

function auditDocument(eventType, authentication, ticket, metadata) {
  return {
    eventType,
    outcome: "SUCCESS",
    organization: authentication.user.organizationId,
    user: authentication.user.id,
    session: authentication.session.id,
    department: ticket.requesterDepartment,
    ticket: ticket._id,
    ticketReference: ticket.reference,
    ...metadata,
  };
}

function ticketOutbox(ticket, eventType, recipients, payload = {}) {
  return {
    organization: ticket.organization,
    eventType,
    aggregateType: "TICKET",
    aggregateId: ticket._id,
    recipients,
    payload: { ticketId: ticket._id.toString(), reference: ticket.reference, ...payload },
    status: "PENDING",
  };
}

function yearInTimezone(date, timezone) {
  return Number(
    new Intl.DateTimeFormat("en", { year: "numeric", timeZone: timezone }).format(date),
  );
}

async function nextReference(organization, year, mongoSession) {
  const counter = await TicketCounter.findOneAndUpdate(
    { organization, year },
    { $inc: { sequence: 1 }, $setOnInsert: { organization, year } },
    { upsert: true, returnDocument: "after", session: mongoSession },
  );
  return {
    sequence: counter.sequence,
    reference: `TKT-${year}-${String(counter.sequence).padStart(6, "0")}`,
  };
}

async function validateLocation(organizationId, departmentId, locationId, mongoSession) {
  if (!locationId) return null;
  if (!validObjectId(locationId)) {
    throw new AppError(400, "VALIDATION_ERROR", "Location ID is invalid.");
  }
  let query = Location.findOne({
    _id: locationId,
    organization: organizationId,
    department: departmentId,
    isActive: true,
  });
  if (mongoSession) query = query.session(mongoSession);
  const location = await query.lean();
  if (!location) {
    throw new AppError(
      422,
      "LOCATION_UNAVAILABLE",
      "Location must be active and belong to the requester's department.",
    );
  }
  return location;
}

async function replay(authentication, operation, key, digest) {
  const record = await findIdempotencyRecord({
    organization: authentication.user.organizationId,
    user: authentication.user.id,
    operation,
    key,
  });
  assertIdempotencyInput(record, digest);
  if (!record) return null;
  const ticket = await accessibleTicket(authentication, record.resourceId);
  return {
    ticket: serializeTicket(authentication, ticket),
    status: record.responseStatus,
    replayed: true,
  };
}

async function recoverConcurrentReplay(authentication, operation, key, digest, error) {
  if (!isDuplicateKeyError(error)) throw error;
  const recovered = await replay(authentication, operation, key, digest);
  if (!recovered) throw error;
  return recovered;
}

export async function createTicket({ authentication, input, idempotencyKey, metadata }) {
  const operation = "ticket:create";
  const digest = requestDigest(input);
  const prior = await replay(authentication, operation, idempotencyKey, digest);
  if (prior) return prior;

  const preflight = await loadTicketConfiguration({
    organizationId: authentication.user.organizationId,
    serviceItemId: input.serviceItemId,
  });
  if (preflight.serviceItem.requiresApproval) {
    throw new AppError(
      409,
      "APPROVAL_WORKFLOW_REQUIRED",
      "This service item requires approval. Approval-backed ticket creation is not available yet.",
    );
  }
  await validateLocation(
    authentication.user.organizationId,
    authentication.user.departmentId,
    input.locationId,
  );

  let ticketId;
  try {
    ticketId = await runRequiredTransaction(
      async (mongoSession) => {
        const actor = await activeActor(authentication, mongoSession);
        const configuration = await loadTicketConfiguration({
          organizationId: actor.organization,
          serviceItemId: input.serviceItemId,
          mongoSession,
        });
        if (configuration.serviceItem.requiresApproval) {
          throw new AppError(
            409,
            "APPROVAL_WORKFLOW_REQUIRED",
            "This service item requires approval. Approval-backed ticket creation is not available yet.",
          );
        }
        const location = await validateLocation(
          actor.organization,
          actor.department,
          input.locationId,
          mongoSession,
        );
        const submittedAt = new Date();
        const year = yearInTimezone(submittedAt, authentication.organization.timezone);
        const reference = await nextReference(actor.organization, year, mongoSession);
        const [ticket] = await Ticket.create(
          [
            {
              organization: actor.organization,
              reference: reference.reference,
              referenceYear: year,
              referenceSequence: reference.sequence,
              requester: actor._id,
              requesterDepartment: actor.department,
              serviceItem: configuration.serviceItem._id,
              location: location?._id,
              type: configuration.serviceItem.ticketType,
              approvalRequired: false,
              approvalStatus: "NOT_REQUIRED",
              title: input.title,
              description: input.description,
              urgency: input.urgency,
              impact: "MEDIUM",
              priority: PRIORITY_BY_URGENCY[input.urgency],
              status: "NEW",
              assignee: null,
              submittedAt,
              configurationSnapshots: configuration.snapshots,
              version: 0,
            },
          ],
          { session: mongoSession },
        );

        await SlaCycle.create(
          [
            {
              organization: actor.organization,
              ticket: ticket._id,
              cycleNumber: 1,
              originalSubmittedAt: submittedAt,
              startedAt: submittedAt,
              configurationSnapshots: configuration.snapshots,
            },
          ],
          { session: mongoSession },
        );
        await createEvent(
          {
            organization: actor.organization,
            ticket: ticket._id,
            type: "CREATED",
            actor: actor._id,
            data: { reference: ticket.reference, status: "NEW" },
            occurredAt: submittedAt,
          },
          mongoSession,
        );
        await recordRequiredAuditEvent(
          auditDocument("TICKET_CREATED", authentication, ticket, metadata),
          mongoSession,
        );
        await createOutbox(
          ticketOutbox(ticket, "TICKET_CREATED", {
            userIds: [],
            capability: "support",
            department: actor.department,
          }),
          mongoSession,
        );
        await saveIdempotencyRecord(
          {
            organization: actor.organization,
            user: actor._id,
            operation,
            key: idempotencyKey,
            digest,
            resourceId: ticket._id,
            responseStatus: 201,
          },
          mongoSession,
        );
        return ticket._id;
      },
      {
        unavailableMessage:
          "Ticket creation requires MongoDB to run as a replica set because the ticket, SLA cycle, history, audit, outbox, and idempotency record must commit atomically.",
      },
    );
  } catch (error) {
    return recoverConcurrentReplay(authentication, operation, idempotencyKey, digest, error);
  }

  const ticket = await accessibleTicket(authentication, ticketId);
  return { ticket: serializeTicket(authentication, ticket), status: 201, replayed: false };
}

export async function listTickets({ authentication, filters, queue = false }) {
  const access = queue
    ? buildQueueAccessFilter(authentication)
    : buildTicketAccessFilter(authentication);
  const query = { $and: [access, ...filterFromQuery(filters)] };
  const skip = (filters.page - 1) * filters.limit;
  const [tickets, total] = await Promise.all([
    populateTicket(
      Ticket.find(query).sort(filters.sort).skip(skip).limit(filters.limit),
    ),
    Ticket.countDocuments(query),
  ]);
  return {
    tickets: tickets.map((ticket) => serializeTicket(authentication, ticket)),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
    },
  };
}

export async function getTicket(authentication, ticketId) {
  return serializeTicket(authentication, await accessibleTicket(authentication, ticketId));
}

async function transitionPreflight(authentication, ticketId, expectedVersion) {
  const ticket = await accessibleTicket(authentication, ticketId);
  if (ticket.version !== expectedVersion) throw staleVersion();
  return ticket;
}

export async function claimTicket({
  authentication,
  ticketId,
  expectedVersion,
  idempotencyKey,
  metadata,
}) {
  const operation = `ticket:claim:${ticketId}`;
  const digest = requestDigest({ ticketId, expectedVersion });
  const ticket = await accessibleTicket(authentication, ticketId);
  const prior = await replay(authentication, operation, idempotencyKey, digest);
  if (prior) return prior;
  if (!canUseSupportScope(authentication, ticket.requesterDepartment._id)) {
    throw new AppError(403, "SUPPORT_SCOPE_REQUIRED", "An active support grant is required.");
  }
  if (ticket.version !== expectedVersion) throw staleVersion();
  if (ticket.assignee || !["NEW", "OPEN"].includes(ticket.status)) {
    throw invalidTransition("Only an unassigned NEW or OPEN ticket can be claimed.");
  }
  if (ticket.approvalStatus !== "NOT_REQUIRED") {
    throw invalidTransition("A ticket with an outstanding approval cannot be claimed.");
  }

  let updatedId;
  try {
    updatedId = await runRequiredTransaction(async (mongoSession) => {
      const current = await Ticket.findOne({
        _id: ticketId,
        organization: authentication.user.organizationId,
      }).session(mongoSession);
      if (!current) throw notFound();
      const actor = await requireFreshSupport(authentication, current, mongoSession);
      if (current.version !== expectedVersion) throw staleVersion();
      if (current.assignee || !["NEW", "OPEN"].includes(current.status)) {
        throw invalidTransition("Only an unassigned NEW or OPEN ticket can be claimed.");
      }
      if (current.approvalStatus !== "NOT_REQUIRED") {
        throw invalidTransition("A ticket with an outstanding approval cannot be claimed.");
      }
      const nextStatus = current.status === "NEW" ? "OPEN" : current.status;
      const updated = await Ticket.findOneAndUpdate(
        {
          _id: current._id,
          organization: current.organization,
          version: expectedVersion,
          assignee: null,
          status: current.status,
          approvalStatus: "NOT_REQUIRED",
        },
        { $set: { assignee: actor._id, status: nextStatus }, $inc: { version: 1 } },
        { returnDocument: "after", session: mongoSession },
      );
      if (!updated) throw staleVersion();
      const now = new Date();
      await createEvent(
        {
          organization: updated.organization,
          ticket: updated._id,
          type: "CLAIMED",
          actor: actor._id,
          data: { assigneeId: actor._id.toString(), status: nextStatus },
          occurredAt: now,
        },
        mongoSession,
      );
      await recordRequiredAuditEvent(
        auditDocument("TICKET_CLAIMED", authentication, updated, metadata),
        mongoSession,
      );
      await createOutbox(
        ticketOutbox(updated, "TICKET_CLAIMED", { userIds: [updated.requester] }),
        mongoSession,
      );
      await saveIdempotencyRecord(
        {
          organization: actor.organization,
          user: actor._id,
          operation,
          key: idempotencyKey,
          digest,
          resourceId: updated._id,
          responseStatus: 200,
        },
        mongoSession,
      );
      return updated._id;
    });
  } catch (error) {
    return recoverConcurrentReplay(authentication, operation, idempotencyKey, digest, error);
  }
  const updated = await accessibleTicket(authentication, updatedId);
  return { ticket: serializeTicket(authentication, updated), status: 200, replayed: false };
}

export async function startTicket({ authentication, ticketId, expectedVersion, metadata }) {
  const preflight = await transitionPreflight(authentication, ticketId, expectedVersion);
  if (
    !canUseSupportScope(authentication, preflight.requesterDepartment._id) ||
    preflight.assignee?._id.toString() !== authentication.user.id
  ) {
    throw new AppError(403, "FORBIDDEN", "Only the eligible assigned technician can start work.");
  }
  if (preflight.status !== "OPEN") {
    throw invalidTransition("Only an OPEN ticket can move to IN_PROGRESS.");
  }

  const updatedId = await runRequiredTransaction(async (mongoSession) => {
    const current = await Ticket.findOne({
      _id: ticketId,
      organization: authentication.user.organizationId,
    }).session(mongoSession);
    if (!current) throw notFound();
    const actor = await requireFreshSupport(authentication, current, mongoSession);
    if (current.version !== expectedVersion) throw staleVersion();
    if (current.assignee?.toString() !== actor._id.toString() || current.status !== "OPEN") {
      throw invalidTransition("Only the eligible assigned technician can start an OPEN ticket.");
    }
    const updated = await Ticket.findOneAndUpdate(
      { _id: current._id, version: expectedVersion, assignee: actor._id, status: "OPEN" },
      { $set: { status: "IN_PROGRESS" }, $inc: { version: 1 } },
      { returnDocument: "after", session: mongoSession },
    );
    if (!updated) throw staleVersion();
    const now = new Date();
    await createEvent(
      {
        organization: updated.organization,
        ticket: updated._id,
        type: "WORK_STARTED",
        actor: actor._id,
        data: { status: "IN_PROGRESS" },
        occurredAt: now,
      },
      mongoSession,
    );
    await recordRequiredAuditEvent(
      auditDocument("TICKET_WORK_STARTED", authentication, updated, metadata),
      mongoSession,
    );
    await createOutbox(
      ticketOutbox(updated, "TICKET_WORK_STARTED", { userIds: [updated.requester] }),
      mongoSession,
    );
    return updated._id;
  });
  return serializeTicket(authentication, await accessibleTicket(authentication, updatedId));
}

export async function addComment({ authentication, ticketId, body, metadata }) {
  const preflight = await accessibleTicket(authentication, ticketId);
  if (preflight.status === "CLOSED") {
    throw invalidTransition("Closed tickets do not accept comments.");
  }

  const result = await runRequiredTransaction(async (mongoSession) => {
    const current = await Ticket.findOne({
      _id: ticketId,
      organization: authentication.user.organizationId,
    }).session(mongoSession);
    if (!current) throw notFound();
    if (current.status === "CLOSED") {
      throw invalidTransition("Closed tickets do not accept comments.");
    }
    const actor = await requireFreshCommentAccess(authentication, current, mongoSession);
    const now = new Date();
    const [comment] = await TicketComment.create(
      [
        {
          organization: current.organization,
          ticket: current._id,
          author: actor._id,
          visibility: "PUBLIC",
          kind: "REPLY",
          body,
        },
      ],
      { session: mongoSession },
    );
    const isStaffResponse = current.requester.toString() !== actor._id.toString();
    const set = isStaffResponse && !current.firstResponseAt ? { firstResponseAt: now } : {};
    await Ticket.updateOne(
      { _id: current._id, version: current.version },
      { $set: set, $inc: { version: 1 } },
      { session: mongoSession },
    );
    await createEvent(
      {
        organization: current.organization,
        ticket: current._id,
        type: "PUBLIC_REPLY_ADDED",
        actor: actor._id,
        data: { commentId: comment._id.toString() },
        occurredAt: now,
      },
      mongoSession,
    );
    await recordRequiredAuditEvent(
      auditDocument("TICKET_PUBLIC_REPLY_ADDED", authentication, current, metadata),
      mongoSession,
    );
    const recipients = isStaffResponse
      ? { userIds: [current.requester] }
      : {
          userIds: current.assignee ? [current.assignee] : [],
          capability: "support",
          department: current.requesterDepartment,
        };
    await createOutbox(
      ticketOutbox(current, "TICKET_PUBLIC_REPLY_ADDED", recipients, {
        commentId: comment._id.toString(),
      }),
      mongoSession,
    );
    return comment._id;
  });

  const comment = await TicketComment.findById(result).populate("author", "displayName");
  return serializeComment(comment);
}

export async function listComments(authentication, ticketId, pagination) {
  const ticket = await accessibleTicket(authentication, ticketId);
  const filter = { organization: authentication.user.organizationId, ticket: ticket._id };
  const skip = (pagination.page - 1) * pagination.limit;
  const [comments, total] = await Promise.all([
    TicketComment.find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .skip(skip)
      .limit(pagination.limit)
      .populate("author", "displayName"),
    TicketComment.countDocuments(filter),
  ]);
  return {
    comments: comments.map(serializeComment),
    pagination: {
      ...pagination,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
    },
  };
}

export async function listEvents(authentication, ticketId, pagination) {
  const ticket = await accessibleTicket(authentication, ticketId);
  const filter = { organization: authentication.user.organizationId, ticket: ticket._id };
  const skip = (pagination.page - 1) * pagination.limit;
  const [events, total] = await Promise.all([
    TicketEvent.find(filter)
      .sort({ occurredAt: 1, _id: 1 })
      .skip(skip)
      .limit(pagination.limit)
      .populate("actor", "displayName"),
    TicketEvent.countDocuments(filter),
  ]);
  return {
    events: events.map(serializeEvent),
    pagination: {
      ...pagination,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
    },
  };
}

export async function resolveTicket({
  authentication,
  ticketId,
  expectedVersion,
  summary,
  resolutionCode,
  idempotencyKey,
  metadata,
}) {
  const operation = `ticket:resolve:${ticketId}`;
  const digest = requestDigest({ ticketId, expectedVersion, summary, resolutionCode });
  const ticket = await accessibleTicket(authentication, ticketId);
  const prior = await replay(authentication, operation, idempotencyKey, digest);
  if (prior) return prior;
  if (
    !canUseSupportScope(authentication, ticket.requesterDepartment._id) ||
    ticket.assignee?._id.toString() !== authentication.user.id
  ) {
    throw new AppError(403, "FORBIDDEN", "Only the eligible assigned technician can resolve this ticket.");
  }
  if (ticket.version !== expectedVersion) throw staleVersion();
  if (ticket.status !== "IN_PROGRESS") {
    throw invalidTransition("Only an IN_PROGRESS ticket can be resolved.");
  }

  let updatedId;
  try {
    updatedId = await runRequiredTransaction(async (mongoSession) => {
      const current = await Ticket.findOne({
        _id: ticketId,
        organization: authentication.user.organizationId,
      }).session(mongoSession);
      if (!current) throw notFound();
      const actor = await requireFreshSupport(authentication, current, mongoSession);
      if (current.version !== expectedVersion) throw staleVersion();
      if (
        current.assignee?.toString() !== actor._id.toString() ||
        current.status !== "IN_PROGRESS"
      ) {
        throw invalidTransition("Only the eligible assigned technician can resolve an IN_PROGRESS ticket.");
      }
      const now = new Date();
      const set = {
        status: "RESOLVED",
        resolution: { summary, code: resolutionCode, resolvedBy: actor._id, resolvedAt: now },
        ...(!current.firstResponseAt ? { firstResponseAt: now } : {}),
      };
      const updated = await Ticket.findOneAndUpdate(
        { _id: current._id, version: expectedVersion, assignee: actor._id, status: "IN_PROGRESS" },
        { $set: set, $inc: { version: 1 } },
        { returnDocument: "after", session: mongoSession },
      );
      if (!updated) throw staleVersion();
      const [comment] = await TicketComment.create(
        [
          {
            organization: updated.organization,
            ticket: updated._id,
            author: actor._id,
            visibility: "PUBLIC",
            kind: "RESOLUTION",
            body: summary,
          },
        ],
        { session: mongoSession },
      );
      const cycleResult = await SlaCycle.updateOne(
        { organization: updated.organization, ticket: updated._id, cycleNumber: 1, endedAt: { $exists: false } },
        { $set: { endedAt: now, endReason: "RESOLVED" } },
        { session: mongoSession },
      );
      if (cycleResult.matchedCount !== 1) {
        throw new Error("The active SLA cycle is missing or already ended.");
      }
      await createEvent(
        {
          organization: updated.organization,
          ticket: updated._id,
          type: "RESOLVED",
          actor: actor._id,
          data: { resolutionCode, commentId: comment._id.toString(), status: "RESOLVED" },
          occurredAt: now,
        },
        mongoSession,
      );
      await recordRequiredAuditEvent(
        auditDocument("TICKET_RESOLVED", authentication, updated, metadata),
        mongoSession,
      );
      await createOutbox(
        ticketOutbox(updated, "TICKET_RESOLVED", { userIds: [updated.requester] }),
        mongoSession,
      );
      await saveIdempotencyRecord(
        {
          organization: actor.organization,
          user: actor._id,
          operation,
          key: idempotencyKey,
          digest,
          resourceId: updated._id,
          responseStatus: 200,
        },
        mongoSession,
      );
      return updated._id;
    });
  } catch (error) {
    return recoverConcurrentReplay(authentication, operation, idempotencyKey, digest, error);
  }
  const updated = await accessibleTicket(authentication, updatedId);
  return { ticket: serializeTicket(authentication, updated), status: 200, replayed: false };
}

export async function closeTicket({
  authentication,
  ticketId,
  expectedVersion,
  idempotencyKey,
  metadata,
}) {
  const operation = `ticket:close:${ticketId}`;
  const digest = requestDigest({ ticketId, expectedVersion });
  const ticket = await accessibleTicket(authentication, ticketId);
  const prior = await replay(authentication, operation, idempotencyKey, digest);
  if (prior) return prior;
  if (ticket.requester._id.toString() !== authentication.user.id) {
    throw new AppError(403, "FORBIDDEN", "Only the requester can confirm closure.");
  }
  if (ticket.version !== expectedVersion) throw staleVersion();
  if (ticket.status !== "RESOLVED") {
    throw invalidTransition("Only a RESOLVED ticket can be closed.");
  }

  let updatedId;
  try {
    updatedId = await runRequiredTransaction(async (mongoSession) => {
      const actor = await activeActor(authentication, mongoSession);
      const current = await Ticket.findOne({
        _id: ticketId,
        organization: actor.organization,
      }).session(mongoSession);
      if (!current) throw notFound();
      if (current.requester.toString() !== actor._id.toString()) {
        throw new AppError(403, "FORBIDDEN", "Only the requester can confirm closure.");
      }
      if (current.version !== expectedVersion) throw staleVersion();
      if (current.status !== "RESOLVED") {
        throw invalidTransition("Only a RESOLVED ticket can be closed.");
      }
      const now = new Date();
      const updated = await Ticket.findOneAndUpdate(
        { _id: current._id, version: expectedVersion, requester: actor._id, status: "RESOLVED" },
        {
          $set: { status: "CLOSED", closedAt: now, closedBy: actor._id },
          $inc: { version: 1 },
        },
        { returnDocument: "after", session: mongoSession },
      );
      if (!updated) throw staleVersion();
      await createEvent(
        {
          organization: updated.organization,
          ticket: updated._id,
          type: "CLOSED",
          actor: actor._id,
          data: { status: "CLOSED" },
          occurredAt: now,
        },
        mongoSession,
      );
      await recordRequiredAuditEvent(
        auditDocument("TICKET_CLOSED", authentication, updated, metadata),
        mongoSession,
      );
      await createOutbox(
        ticketOutbox(updated, "TICKET_CLOSED", {
          userIds: updated.assignee ? [updated.assignee] : [],
        }),
        mongoSession,
      );
      await saveIdempotencyRecord(
        {
          organization: actor.organization,
          user: actor._id,
          operation,
          key: idempotencyKey,
          digest,
          resourceId: updated._id,
          responseStatus: 200,
        },
        mongoSession,
      );
      return updated._id;
    });
  } catch (error) {
    return recoverConcurrentReplay(authentication, operation, idempotencyKey, digest, error);
  }
  const updated = await accessibleTicket(authentication, updatedId);
  return { ticket: serializeTicket(authentication, updated), status: 200, replayed: false };
}
