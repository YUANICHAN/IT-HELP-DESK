import { sessionConfig } from "../config/session.js";
import { AppError } from "../shared/errors/app-error.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originAllowed(origin) {
  return sessionConfig.allowedOrigins.includes(origin);
}

export function credentialedCors(req, res, next) {
  const origin = req.get("origin");

  if (!origin) return next();

  if (!originAllowed(origin)) {
    return next(
      new AppError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "The request origin is not allowed.",
      ),
    );
  }

  res.vary("Origin");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-CSRF-Token",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS",
  );

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Max-Age", "600");
    return res.status(204).end();
  }

  return next();
}

export function validateOrigin(req, _res, next) {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");

  if (origin && !originAllowed(origin)) {
    return next(
      new AppError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "The request origin is not allowed.",
      ),
    );
  }

  if (!origin && fetchSite === "cross-site") {
    return next(
      new AppError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "Cross-site browser requests are not allowed.",
      ),
    );
  }

  return next();
}
