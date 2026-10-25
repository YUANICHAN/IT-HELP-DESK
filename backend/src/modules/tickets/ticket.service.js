import { currentAccess } from "../access/currentAccess.service.js";
import { linkTicketAssets } from "../assets/assetSelection.service.js";
import { loadAccessibleTicket, recordTicketChange } from "./ticketOperations.service.js";
import { configuredApprover } from "../approvals/approval.policy.js";
import { createApproval } from "../approvals/approvalLifecycle.service.js";
import {
  cycleCreationFields,
  openResolutionPause,
} from "../service-levels/slaLifecycle.service.js";
import mongoose from "mongoose";
import { recordRequiredAuditEvent } from "../auth/audit.service.js";
import { loadTicketConfiguration } from "../service-levels/configuration.service.js";
import { SlaCycle } from "../service-levels/slaCycle.model.js";
import { ticketSlaCycles } from "../service-levels/slaClock.service.js";
import { requesterSafeCycle } from "../service-levels/serviceLevel.serializer.js";
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
  canViewInternal,
  PRIORITY_MATRIX,
} from "./ticket.policy.js";
import {
  serializeComment,
  serializeEvent,
  serializeTicket,
} from "./ticket.serializer.js";
import { clockNow } from "../../shared/time/clock.js";

function validObjectId(value) {
  return mongoose.isObjectIdOrHexString(value);
}

function notFound() {
  return new AppError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
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
  await currentAccess(authentication, mongoSession);
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
  authentication = await currentAccess(authentication);
  const operation = "ticket:create";
  const digest = requestDigest(input);
  const prior = await replay(authentication, operation, idempotencyKey, digest);
  if (prior) return prior;

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
        const approver = await configuredApprover(actor, configuration.serviceItem, mongoSession);
        const approvalRequired = configuration.serviceItem.requiresApproval;
        const location = await validateLocation(
          actor.organization,
          actor.department,
          input.locationId,
          mongoSession,
        );
        const fresh = await currentAccess(authentication, mongoSession);
        const assetSnapshots = await linkTicketAssets(fresh, configuration.serviceItem, input.assetIds || [], input.primaryAssetId, input.locationId, mongoSession);
        if (input.followUpOfId) await loadAccessibleTicket(fresh, input.followUpOfId, mongoSession);
        const submittedAt = clockNow();
        const year = yearInTimezone(submittedAt, authentication.organization.timezone);
        const reference = await nextReference(actor.organization, year, mongoSession);
        const priority = PRIORITY_MATRIX.MEDIUM[input.urgency];
        const [ticket] = await Ticket.create(
          [
            {
              organization: actor.organization,
              assetSnapshots,
              followUpOf: input.followUpOfId || null,
              reference: reference.reference,
              referenceYear: year,
              referenceSequence: reference.sequence,
              requester: actor._id,
              requesterDepartment: actor.department,
              serviceItem: configuration.serviceItem._id,
              location: location?._id,
              type: configuration.serviceItem.ticketType,
              approvalRequired,
              approvalStatus: approvalRequired ? "PENDING" : "NOT_REQUIRED",
              currentApprovalRound: approvalRequired ? 1 : 0,
              title: input.title,
              description: input.description,
              urgency: input.urgency,
              impact: "MEDIUM",
              priority,
              status: approvalRequired ? "WAITING_APPROVAL" : "NEW",
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
              ...cycleCreationFields(configuration.snapshots, priority, submittedAt),
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
            data: { reference: ticket.reference, status: ticket.status },
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
            userIds: approvalRequired ? [ticket.requester] : [],
            capability: approvalRequired ? "ticket_triage" : "support",
            department: actor.department,
          }),
          mongoSession,
        );
        if (approvalRequired) {
          const approval = await createApproval(ticket, approver, submittedAt, mongoSession);
          await openResolutionPause(
            ticket,
            "WAITING_APPROVAL",
            submittedAt,
            actor._id,
            mongoSession,
          );
          await recordTicketChange({ auth: fresh, ticket, type: "APPROVAL_REQUESTED",
            data: { approvalId: approval.id, round: approval.round },
            recipients: { userIds: [approver, ticket.requester], capability: "ticket_triage", department: ticket.requesterDepartment },
            metadata, session: mongoSession });
        }
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
  const ticket = await accessibleTicket(authentication, ticketId);
  const cycles = await ticketSlaCycles(ticket);
  return {
    ...serializeTicket(authentication, ticket),
    slaCycles: canViewInternal(authentication, ticket)
      ? cycles
      : cycles.map(requesterSafeCycle),
  };
}

export async function listComments(authentication, ticketId, pagination) {
  const ticket = await accessibleTicket(authentication, ticketId);
  const filter = { organization: authentication.user.organizationId, ticket: ticket._id, ...(canViewInternal(authentication, ticket) ? {} : { visibility: { $in: ["PUBLIC", null] } }) };
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
  const filter = { organization: authentication.user.organizationId, ticket: ticket._id, ...(canViewInternal(authentication, ticket) ? {} : { visibility: { $in: ["PUBLIC", null] } }) };
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
