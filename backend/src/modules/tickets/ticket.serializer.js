import { viewerKind } from "./ticket.policy.js";

function idOf(value) {
  return (value?._id || value)?.toString();
}

function safePerson(value) {
  if (!value) return null;
  return {
    id: idOf(value),
    ...(value.displayName ? { displayName: value.displayName } : {}),
  };
}

function safeDepartment(value) {
  if (!value) return null;
  return {
    id: idOf(value),
    ...(value.code ? { code: value.code } : {}),
    ...(value.name ? { name: value.name } : {}),
  };
}

function safeLocation(value) {
  if (!value) return null;
  return {
    id: idOf(value),
    ...(value.code ? { code: value.code } : {}),
    ...(value.name ? { name: value.name } : {}),
    ...(value.building ? { building: value.building } : {}),
    ...(value.room ? { room: value.room } : {}),
  };
}

export function serializeTicket(authentication, ticket) {
  const kind = viewerKind(authentication, ticket);
  const service = ticket.configurationSnapshots.service;
  return {
    id: idOf(ticket),
    reference: ticket.reference,
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
    urgency: ticket.urgency,
    impact: ticket.impact,
    priority: ticket.priority,
    status: ticket.status,
    approvalRequired: ticket.approvalRequired,
    approvalStatus: ticket.approvalStatus,
    requester: safePerson(ticket.requester),
    requesterDepartment: safeDepartment(ticket.requesterDepartment),
    assignee: safePerson(ticket.assignee),
    location: safeLocation(ticket.location),
    service: {
      id: idOf(ticket.serviceItem),
      code: service.code,
      name: service.name,
    },
    submittedAt: ticket.submittedAt,
    firstResponseAt: ticket.firstResponseAt || null,
    resolution: ticket.resolution
      ? {
          summary: ticket.resolution.summary,
          code: ticket.resolution.code,
          resolvedBy: idOf(ticket.resolution.resolvedBy),
          resolvedAt: ticket.resolution.resolvedAt,
        }
      : null,
    closedAt: ticket.closedAt || null,
    version: ticket.version,
    viewer: kind,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export function serializeComment(comment) {
  return {
    id: idOf(comment),
    author: safePerson(comment.author),
    visibility: "PUBLIC",
    kind: comment.kind,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}

export function serializeEvent(event) {
  return {
    id: idOf(event),
    type: event.type,
    actor: safePerson(event.actor),
    data: event.data,
    occurredAt: event.occurredAt,
  };
}
