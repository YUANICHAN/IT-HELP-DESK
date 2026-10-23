import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import mongoose from "mongoose";
import { sessionConfig } from "../../config/session.js";
import { Session } from "./session.model.js";

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function boundedString(value, maximumLength) {
  if (!value) return undefined;
  return String(value).slice(0, maximumLength);
}

function describeUserAgent(userAgent = "") {
  let browser = "Unknown browser";
  let operatingSystem = "Unknown operating system";
  let deviceType = "unknown";

  if (/Edg\//u.test(userAgent)) browser = "Microsoft Edge";
  else if (/Chrome\//u.test(userAgent)) browser = "Google Chrome";
  else if (/Firefox\//u.test(userAgent)) browser = "Mozilla Firefox";
  else if (/Safari\//u.test(userAgent)) browser = "Safari";

  if (/Windows/u.test(userAgent)) operatingSystem = "Windows";
  else if (/Android/u.test(userAgent)) operatingSystem = "Android";
  else if (/iPhone|iPad|iOS/u.test(userAgent)) operatingSystem = "iOS";
  else if (/Mac OS X|Macintosh/u.test(userAgent)) operatingSystem = "macOS";
  else if (/Linux/u.test(userAgent)) operatingSystem = "Linux";

  if (/iPad|Tablet/u.test(userAgent)) deviceType = "tablet";
  else if (/Mobile|Android|iPhone/u.test(userAgent)) deviceType = "mobile";
  else if (userAgent) deviceType = "desktop";

  return { browser, operatingSystem, deviceType };
}

export function requestClientMetadata(req) {
  const forwardedAddress = req.socket?.remoteAddress;

  return {
    client: describeUserAgent(req.get("user-agent")),
    ipAddress: boundedString(
      forwardedAddress?.replace(/^::ffff:/u, ""),
      64,
    ),
  };
}

export function digestSessionToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function csrfTokenForSession(token) {
  return createHmac("sha256", sessionConfig.csrfSecret)
    .update(`csrf:${token}`, "utf8")
    .digest("base64url");
}

export function secureStringsEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");

  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function sessionTokenFromRequest(req) {
  const cookieHeader = req.get("cookie");
  if (!cookieHeader) return null;

  const matches = cookieHeader
    .split(";")
    .map((part) => part.trim().split(/=(.*)/su))
    .filter(([name]) => name === sessionConfig.cookie.name);

  if (matches.length !== 1) return null;

  try {
    const token = decodeURIComponent(matches[0][1] || "");
    return SESSION_TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

export async function createSession({ user, metadata, mongoSession }) {
  const now = new Date();
  const absoluteExpiresAt = new Date(
    now.getTime() + sessionConfig.absoluteMilliseconds,
  );
  const idleExpiresAt = new Date(
    Math.min(
      now.getTime() + sessionConfig.idleMilliseconds,
      absoluteExpiresAt.getTime(),
    ),
  );
  const rawToken = randomBytes(32).toString("base64url");
  const sessionDocument = {
    organization: user.organization,
    user: user._id,
    tokenDigest: digestSessionToken(rawToken),
    sessionVersion: user.sessionVersion,
    client: metadata.client,
    ipAddress: metadata.ipAddress,
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
  };

  const [createdSession] = await Session.create(
    [sessionDocument],
    mongoSession ? { session: mongoSession } : undefined,
  );

  return {
    document: createdSession,
    rawToken,
    csrfToken: csrfTokenForSession(rawToken),
  };
}

function cookieAttributes() {
  const attributes = [
    `Path=${sessionConfig.cookie.path}`,
    "HttpOnly",
    `SameSite=${
      sessionConfig.cookie.sameSite[0].toUpperCase() +
      sessionConfig.cookie.sameSite.slice(1)
    }`,
    "Priority=High",
  ];

  if (sessionConfig.cookie.secure) attributes.push("Secure");
  return attributes;
}

export function setSessionCookie(res, rawToken, absoluteExpiresAt) {
  const maximumAge = Math.max(
    0,
    Math.floor((absoluteExpiresAt.getTime() - Date.now()) / 1000),
  );
  const cookie = [
    `${sessionConfig.cookie.name}=${encodeURIComponent(rawToken)}`,
    ...cookieAttributes(),
    `Max-Age=${maximumAge}`,
    `Expires=${absoluteExpiresAt.toUTCString()}`,
  ].join("; ");

  res.append("Set-Cookie", cookie);
}

export function clearSessionCookie(res) {
  const cookie = [
    `${sessionConfig.cookie.name}=`,
    ...cookieAttributes(),
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");

  res.append("Set-Cookie", cookie);
}

export function safeSession(session, currentSessionId) {
  return {
    id: session._id.toString(),
    client: {
      browser: session.client.browser,
      operatingSystem: session.client.operatingSystem,
      deviceType: session.client.deviceType,
    },
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
    isCurrent: session._id.toString() === currentSessionId.toString(),
  };
}

export async function listActiveSessions(user, currentSessionId) {
  const now = new Date();
  const sessions = await Session.find({
    user: user.id,
    organization: user.organizationId,
    sessionVersion: user.sessionVersion,
    revokedAt: { $exists: false },
    idleExpiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  }).sort({ lastSeenAt: -1 });

  return sessions.map((session) => safeSession(session, currentSessionId));
}

export async function revokeOwnedSession({ userId, sessionId, reason }) {
  if (!mongoose.isObjectIdOrHexString(sessionId)) return null;

  return Session.findOneAndUpdate(
    {
      _id: sessionId,
      user: userId,
      revokedAt: { $exists: false },
    },
    {
      $set: {
        revokedAt: new Date(),
        revocationReason: reason,
      },
    },
    { returnDocument: "after" },
  );
}

