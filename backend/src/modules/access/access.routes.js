import { Router } from "express";
import {
  authenticate,
  requirePasswordChangeComplete,
} from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/authorize.js";
import { csrfProtection } from "../../middleware/csrfProtection.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import { create, list, revoke } from "./access.controller.js";

const router = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(authenticate);
router.use(requirePasswordChangeComplete);
router.use(requireRole("ADMINISTRATOR"));

router.get("/", asyncHandler(list));
router.post("/", csrfProtection, asyncHandler(create));
router.post("/:grantId/revoke", csrfProtection, asyncHandler(revoke));

export default router;
