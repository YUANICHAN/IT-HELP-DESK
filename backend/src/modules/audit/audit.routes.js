import { Router } from "express";
import { authenticate, requirePasswordChangeComplete } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/authorize.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import { listAudit } from "./audit.controller.js";

const router = Router();
router.use(authenticate);
router.use(requirePasswordChangeComplete);
router.use(requireRole("ADMINISTRATOR"));
router.get("/", asyncHandler(listAudit));

export default router;
