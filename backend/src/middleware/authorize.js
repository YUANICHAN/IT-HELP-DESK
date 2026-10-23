import { AppError } from "../shared/errors/app-error.js";

export function requireRole(...allowedRoles) {
  const acceptedRoles = new Set(allowedRoles);

  return function authorizeRole(req, _res, next) {
    if (!req.auth || !acceptedRoles.has(req.auth.user.role)) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          "You do not have permission to perform this operation.",
        ),
      );
    }

    return next();
  };
}
