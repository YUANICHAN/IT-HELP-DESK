import {
  authenticationResponse,
  changePassword as changePasswordService,
  login as loginService,
  logout as logoutService,
  revokeSession as revokeSessionService,
  sessions as sessionsService,
} from "./auth.service.js";
import {
  clearSessionCookie,
  requestClientMetadata,
  setSessionCookie,
} from "./session.service.js";
import { clearLoginRateLimit } from "../../middleware/rateLimit.js";
import { requireExactObject, requireString } from "../../shared/http/request-validation.js";
import { PASSWORD_POLICY } from "../users/password.service.js";

export async function login(req, res) {
  requireExactObject(req.body, ["email", "password"], ["email", "password"]);
  const email = requireString(req.body.email, "Email", 320).trim();
  const password = requireString(
    req.body.password,
    "Password",
    PASSWORD_POLICY.maximumBytes,
  );

  const result = await loginService({
    email,
    password,
    metadata: requestClientMetadata(req),
  });

  clearLoginRateLimit(req);
  setSessionCookie(res, result.rawToken, result.absoluteExpiresAt);
  res.status(200).json({
    data: authenticationResponse(result.authentication),
  });
}

export async function logout(req, res) {
  await logoutService(req.auth, requestClientMetadata(req));
  clearSessionCookie(res);
  res.status(204).end();
}

export function me(req, res) {
  res.status(200).json({ data: authenticationResponse(req.auth) });
}

export async function listSessions(req, res) {
  const activeSessions = await sessionsService(req.auth);
  res.status(200).json({ data: { sessions: activeSessions } });
}

export async function revokeSession(req, res) {
  const revokedSession = await revokeSessionService(
    req.auth,
    req.params.sessionId,
    requestClientMetadata(req),
  );

  if (revokedSession._id.toString() === req.auth.session.id) {
    clearSessionCookie(res);
  }

  res.status(204).end();
}

export async function changePassword(req, res) {
  requireExactObject(
    req.body,
    ["currentPassword", "newPassword"],
    ["currentPassword", "newPassword"],
  );
  const currentPassword = requireString(
    req.body.currentPassword,
    "Current password",
    PASSWORD_POLICY.maximumBytes,
  );
  const newPassword = requireString(
    req.body.newPassword,
    "New password",
    PASSWORD_POLICY.maximumCharacters,
  );

  const result = await changePasswordService({
    authentication: req.auth,
    currentPassword,
    newPassword,
    metadata: requestClientMetadata(req),
  });

  setSessionCookie(res, result.rawToken, result.absoluteExpiresAt);
  res.status(200).json({
    data: authenticationResponse(result.authentication),
  });
}
