import { Router } from "express";
import {
  authenticate,
  requirePasswordChangeComplete,
} from "../../middleware/authenticate.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import { getDashboard } from "./dashboard.controller.js";

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(authenticate);
router.use(requirePasswordChangeComplete);
router.get("/", asyncHandler(getDashboard));

export default router;
