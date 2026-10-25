import { Router } from "express";
import { asyncHandler } from "../../shared/errors/app-error.js";
import { showServiceLevel } from "./serviceLevels.controller.js";

const router = Router({ mergeParams: true });
router.get("/", asyncHandler(showServiceLevel));

export default router;
