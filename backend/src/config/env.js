import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
});

const port = Number(process.env.PORT || 5000);
const mongodbUri = process.env.MONGODB_URI?.trim();
const nodeEnv = process.env.NODE_ENV || "development";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

if (!mongodbUri) {
  throw new Error("MONGODB_URI is missing from backend/.env.");
}

function integerEnvironmentValue(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] || fallback);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function booleanEnvironmentValue(name, fallback) {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) return fallback;
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;

  throw new Error(`${name} must be true or false.`);
}

function normalizedOrigin(value, name) {
  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`${name} contains an invalid HTTP origin.`);
  }
}

const cookieName =
  process.env.AUTH_COOKIE_NAME?.trim() || "it_help_desk_session";

if (!/^[A-Za-z0-9_-]{1,64}$/u.test(cookieName)) {
  throw new Error("AUTH_COOKIE_NAME contains unsupported characters.");
}

const cookieSecure = booleanEnvironmentValue(
  "AUTH_COOKIE_SECURE",
  nodeEnv === "production",
);
const cookieSameSite = (
  process.env.AUTH_COOKIE_SAME_SITE?.trim() || "lax"
).toLowerCase();

if (!["lax", "strict", "none"].includes(cookieSameSite)) {
  throw new Error("AUTH_COOKIE_SAME_SITE must be lax, strict, or none.");
}

if (cookieSameSite === "none" && !cookieSecure) {
  throw new Error("AUTH_COOKIE_SECURE must be true when SameSite is none.");
}

if (nodeEnv === "production" && !cookieSecure) {
  throw new Error("AUTH_COOKIE_SECURE must be true in production.");
}

const idleMinutes = integerEnvironmentValue(
  "AUTH_SESSION_IDLE_MINUTES",
  30,
  1,
  1440,
);
const absoluteHours = integerEnvironmentValue(
  "AUTH_SESSION_ABSOLUTE_HOURS",
  168,
  1,
  8760,
);

if (idleMinutes * 60 > absoluteHours * 60 * 60) {
  throw new Error(
    "AUTH_SESSION_IDLE_MINUTES cannot exceed the absolute session lifetime.",
  );
}

const configuredOrigins = process.env.AUTH_ALLOWED_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = (
  configuredOrigins?.length
    ? configuredOrigins
    : [`http://${process.env.HOST || "127.0.0.1"}:${port}`]
).map((origin) => normalizedOrigin(origin, "AUTH_ALLOWED_ORIGINS"));

const configuredCsrfSecret = process.env.AUTH_CSRF_SECRET?.trim();

if (
  configuredCsrfSecret &&
  (configuredCsrfSecret.length < 32 ||
    configuredCsrfSecret === "replace-with-at-least-32-random-characters")
) {
  throw new Error(
    "AUTH_CSRF_SECRET must contain at least 32 non-placeholder characters.",
  );
}

if (nodeEnv === "production" && !configuredCsrfSecret) {
  throw new Error("AUTH_CSRF_SECRET is required in production.");
}

const csrfSecret =
  configuredCsrfSecret || randomBytes(32).toString("base64url");

export const env = Object.freeze({
  nodeEnv,
  host: process.env.HOST || "127.0.0.1",
  port,
  mongodbUri,
  auth: Object.freeze({
    cookieName,
    cookieSecure,
    cookieSameSite,
    allowedOrigins: Object.freeze([...new Set(allowedOrigins)]),
    csrfSecret,
    sessionIdleMinutes: idleMinutes,
    sessionAbsoluteHours: absoluteHours,
    loginWindowMinutes: integerEnvironmentValue(
      "AUTH_LOGIN_WINDOW_MINUTES",
      15,
      1,
      60,
    ),
    loginMaxAttempts: integerEnvironmentValue(
      "AUTH_LOGIN_MAX_ATTEMPTS",
      5,
      1,
      100,
    ),
    auditRetentionDays: integerEnvironmentValue(
      "AUTH_AUDIT_RETENTION_DAYS",
      180,
      1,
      3650,
    ),
  }),
});
