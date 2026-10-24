import { requestClientMetadata } from "../auth/session.service.js";
import { requireIdempotencyKey } from "../../shared/database/idempotency.js";
import {
  addComment,
  claimTicket,
  closeTicket,
  createTicket,
  getTicket,
  listComments,
  listEvents,
  listTickets,
  resolveTicket,
  startTicket,
} from "./ticket.service.js";
import {
  validateComment,
  validateCreateTicket,
  validateExpectedVersion,
  validateResolution,
  validateTicketQuery,
  validateTimelineQuery,
} from "./ticket.validation.js";

function authentication(req) {
  return req.auth;
}

function metadata(req) {
  return requestClientMetadata(req);
}

function sendIdempotent(res, result) {
  if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
  res.status(result.status).json({ data: { ticket: result.ticket } });
}

export async function create(req, res) {
  const result = await createTicket({
    authentication: authentication(req),
    input: validateCreateTicket(req.body),
    idempotencyKey: requireIdempotencyKey(req),
    metadata: metadata(req),
  });
  sendIdempotent(res, result);
}

export async function list(req, res) {
  const result = await listTickets({
    authentication: authentication(req),
    filters: validateTicketQuery(req.query),
  });
  res.status(200).json({ data: result });
}

export async function queue(req, res) {
  const result = await listTickets({
    authentication: authentication(req),
    filters: validateTicketQuery(req.query),
    queue: true,
  });
  res.status(200).json({ data: result });
}

export async function detail(req, res) {
  res.status(200).json({
    data: { ticket: await getTicket(authentication(req), req.params.ticketId) },
  });
}

export async function claim(req, res) {
  const result = await claimTicket({
    authentication: authentication(req),
    ticketId: req.params.ticketId,
    expectedVersion: validateExpectedVersion(req.body),
    idempotencyKey: requireIdempotencyKey(req),
    metadata: metadata(req),
  });
  sendIdempotent(res, result);
}

export async function start(req, res) {
  const ticket = await startTicket({
    authentication: authentication(req),
    ticketId: req.params.ticketId,
    expectedVersion: validateExpectedVersion(req.body),
    metadata: metadata(req),
  });
  res.status(200).json({ data: { ticket } });
}

export async function comments(req, res) {
  const result = await listComments(
    authentication(req),
    req.params.ticketId,
    validateTimelineQuery(req.query),
  );
  res.status(200).json({ data: result });
}

export async function comment(req, res) {
  const input = validateComment(req.body);
  const created = await addComment({
    authentication: authentication(req),
    ticketId: req.params.ticketId,
    body: input.body,
    metadata: metadata(req),
  });
  res.status(201).json({ data: { comment: created } });
}

export async function events(req, res) {
  const result = await listEvents(
    authentication(req),
    req.params.ticketId,
    validateTimelineQuery(req.query),
  );
  res.status(200).json({ data: result });
}

export async function resolve(req, res) {
  const input = validateResolution(req.body);
  const result = await resolveTicket({
    authentication: authentication(req),
    ticketId: req.params.ticketId,
    ...input,
    idempotencyKey: requireIdempotencyKey(req),
    metadata: metadata(req),
  });
  sendIdempotent(res, result);
}

export async function close(req, res) {
  const result = await closeTicket({
    authentication: authentication(req),
    ticketId: req.params.ticketId,
    expectedVersion: validateExpectedVersion(req.body),
    idempotencyKey: requireIdempotencyKey(req),
    metadata: metadata(req),
  });
  sendIdempotent(res, result);
}
