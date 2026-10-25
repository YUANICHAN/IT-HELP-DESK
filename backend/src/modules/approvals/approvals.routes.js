import { Router } from "express";
import { authenticate, requirePasswordChangeComplete } from "../../middleware/authenticate.js";
import { csrfProtection } from "../../middleware/csrfProtection.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import { list, decision } from "./approvals.controller.js";
const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(authenticate, requirePasswordChangeComplete);
router.get("/", asyncHandler(list));
router.post("/:approvalId/decision", csrfProtection, asyncHandler(decision));
export default router;
