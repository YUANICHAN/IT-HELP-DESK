import { AppError } from "../shared/errors/app-error.js";
import { secureStringsEqual } from "../modules/auth/session.service.js";

export function csrfProtection(req, _res, next) {
  const suppliedToken = req.get("x-csrf-token");
  const expectedToken = req.auth?.csrfToken;

  if (!secureStringsEqual(suppliedToken, expectedToken)) {
    return next(
      new AppError(
        403,
        "CSRF_VALIDATION_FAILED",
        "A valid CSRF token is required.",
      ),
    );
  }

  return next();
}
