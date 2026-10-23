import { env } from "./env.js";

export const sessionConfig = Object.freeze({
  cookie: Object.freeze({
    name: env.auth.cookieName,
    path: "/api/v1",
    httpOnly: true,
    secure: env.auth.cookieSecure,
    sameSite: env.auth.cookieSameSite,
  }),
  allowedOrigins: env.auth.allowedOrigins,
  csrfSecret: env.auth.csrfSecret,
  idleMilliseconds: env.auth.sessionIdleMinutes * 60 * 1000,
  absoluteMilliseconds: env.auth.sessionAbsoluteHours * 60 * 60 * 1000,
  loginWindowMilliseconds: env.auth.loginWindowMinutes * 60 * 1000,
  loginMaxAttempts: env.auth.loginMaxAttempts,
  auditRetentionSeconds: env.auth.auditRetentionDays * 24 * 60 * 60,
});
