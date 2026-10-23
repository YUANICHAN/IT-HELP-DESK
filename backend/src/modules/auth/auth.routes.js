import { Router } from "express";
import {
  authenticate,
  requirePasswordChangeComplete,
} from "../../middleware/authenticate.js";
import { csrfProtection } from "../../middleware/csrfProtection.js";
import { loginRateLimit } from "../../middleware/rateLimit.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import {
  changePassword,
  listSessions,
  login,
  logout,
  me,
  revokeSession,
} from "./auth.controller.js";

const router = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.post("/login", loginRateLimit, asyncHandler(login));

router.use(authenticate);

router.post("/logout", csrfProtection, asyncHandler(logout));
router.get("/me", me);
router.get(
  "/sessions",
  requirePasswordChangeComplete,
  asyncHandler(listSessions),
);
router.delete(
  "/sessions/:sessionId",
  requirePasswordChangeComplete,
  csrfProtection,
  asyncHandler(revokeSession),
);
router.post(
  "/change-password",
  csrfProtection,
  asyncHandler(changePassword),
);

export default router;
