import { createHash } from "node:crypto";
import { sessionConfig } from "../config/session.js";
import { AppError } from "../shared/errors/app-error.js";
import { recordAuthenticationEvent } from "../modules/auth/audit.service.js";
import { requestClientMetadata } from "../modules/auth/session.service.js";

const loginAttempts = new Map();
let lastCleanupAt = 0;

function rateLimitKeys(req) {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "missing";
  const emailKey = createHash("sha256").update(email).digest("base64url");
  const address = req.socket?.remoteAddress || "unknown";
  return {
    pair: `pair:${address}:${emailKey}`,
    address: `address:${address}`,
  };
}

function cleanupExpiredEntries(now) {
  if (now - lastCleanupAt < sessionConfig.loginWindowMilliseconds) return;

  for (const [key, entry] of loginAttempts) {
    if (entry.resetAt <= now) loginAttempts.delete(key);
  }

  lastCleanupAt = now;
}

export async function loginRateLimit(req, res, next) {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const keys = rateLimitKeys(req);
  const limits = [
    { key: keys.pair, maximum: sessionConfig.loginMaxAttempts },
    { key: keys.address, maximum: sessionConfig.loginMaxAttempts * 5 },
  ];
  const entries = limits.map(({ key, maximum }) => {
    const current = loginAttempts.get(key);
    const entry =
      current && current.resetAt > now
        ? current
        : {
            count: 0,
            resetAt: now + sessionConfig.loginWindowMilliseconds,
          };
    return { key, maximum, entry };
  });
  const blockedEntry = entries.find(
    ({ maximum, entry }) => entry.count >= maximum,
  );

  req.loginRateLimitKeys = keys;

  if (blockedEntry) {
    const retryAfter = Math.max(
      1,
      Math.ceil((blockedEntry.entry.resetAt - now) / 1000),
    );
    res.setHeader("Retry-After", String(retryAfter));

    const metadata = requestClientMetadata(req);
    await recordAuthenticationEvent({
      eventType: "LOGIN",
      outcome: "FAILURE",
      reasonCode: "RATE_LIMITED",
      ...metadata,
    });

    return next(
      new AppError(
        429,
        "LOGIN_RATE_LIMITED",
        "Too many login attempts. Try again later.",
      ),
    );
  }

  for (const { key, entry } of entries) {
    entry.count += 1;
    loginAttempts.set(key, entry);
  }
  return next();
}

export function clearLoginRateLimit(req) {
  if (req.loginRateLimitKeys) {
    loginAttempts.delete(req.loginRateLimitKeys.pair);
    loginAttempts.delete(req.loginRateLimitKeys.address);
  }
}

export function resetAllLoginRateLimits() {
  loginAttempts.clear();
  lastCleanupAt = 0;
}
