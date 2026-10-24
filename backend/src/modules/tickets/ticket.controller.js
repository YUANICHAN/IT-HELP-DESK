import { runTicketCommand, listWorklogs } from "./ticketOperations.service.js";
import { validateTicketCommand } from "./ticketOperations.validation.js";
import { requestClientMetadata } from "../auth/session.service.js";
import { requireIdempotencyKey } from "../../shared/database/idempotency.js";
import {
  createTicket,
  getTicket,
  listComments,
  listEvents,
  listTickets,
} from "./ticket.service.js";
import {
  validateCreateTicket,
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

export async function comments(req, res) {
  const result = await listComments(
    authentication(req),
    req.params.ticketId,
    validateTimelineQuery(req.query),
  );
  res.status(200).json({ data: result });
}

export async function events(req, res) {
  const result = await listEvents(
    authentication(req),
    req.params.ticketId,
    validateTimelineQuery(req.query),
  );
  res.status(200).json({ data: result });
}


export const command = action => async (req, res) => {
  const result = await runTicketCommand({ authentication: req.auth, ticketId: req.params.ticketId, action, input: validateTicketCommand(action, req.body), idempotencyKey: requireIdempotencyKey(req), metadata: metadata(req) });
  if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
  res.status(result.status).json({ data: result.data });
};
export async function worklogs(req, res) {
  res.json({ data: await listWorklogs(req.auth, req.params.ticketId, validateTimelineQuery(req.query)) });
}
