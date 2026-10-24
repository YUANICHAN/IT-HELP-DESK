import { AuthenticationAudit } from "./authenticationAudit.model.js";

function auditDocument(event) {
  return {
    eventType: event.eventType,
    outcome: event.outcome,
    reasonCode: event.reasonCode,
    organization: event.organization,
    user: event.user,
    session: event.session,
    targetUser: event.targetUser,
    accessGrant: event.accessGrant,
    capability: event.capability,
    department: event.department,
    ticket: event.ticket,
    ticketReference: event.ticketReference,
    asset: event.asset,
    ipAddress: event.ipAddress,
    client: event.client,
    occurredAt: new Date(),
  };
}

export async function recordAuthenticationEvent(event) {
  try {
    await AuthenticationAudit.create(auditDocument(event));
  } catch {
    console.error("Authentication audit event could not be recorded.");
  }
}

export async function recordRequiredAuditEvent(event, mongoSession) {
  await AuthenticationAudit.create([auditDocument(event)], {
    session: mongoSession,
  });
}
