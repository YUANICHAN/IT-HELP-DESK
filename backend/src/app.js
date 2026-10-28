import express from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { credentialedCors, validateOrigin } from "./middleware/validateOrigin.js";
import authRoutes from "./modules/auth/auth.routes.js";
import accessRoutes from "./modules/access/access.routes.js";
import ticketRoutes, { queueRouter } from "./modules/tickets/ticket.routes.js";
import assetRoutes from "./modules/assets/assets.routes.js";
import attachmentRoutes from "./modules/attachments/attachment.routes.js";
import approvalRoutes from "./modules/approvals/approvals.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import reportingRoutes from "./modules/reporting/reporting.routes.js";
import auditRoutes from "./modules/audit/audit.routes.js";
import { AppError } from "./shared/errors/app-error.js";

const app = express();

app.disable("x-powered-by");

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  if (req.originalUrl.startsWith("/api/v1/auth")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.use(credentialedCors);
app.use(validateOrigin);
app.use(express.json({ limit: "100kb" }));

app.get("/api/v1/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.setHeader("Cache-Control", "no-store");

  res.status(databaseConnected ? 200 : 503).json({
    data: {
      status: databaseConnected ? "ok" : "unavailable",
      service: "it-help-desk-api",
      database: databaseConnected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    },
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin/access-grants", accessRoutes);
app.use("/api/v1/tickets", ticketRoutes);
app.use("/api/v1/queue", queueRouter);
app.use("/api/v1/assets", assetRoutes);
app.use("/api/v1/attachments", attachmentRoutes);
app.use("/api/v1/approvals", approvalRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/admin/health", healthRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/reports", reportingRoutes);
app.use("/api/v1/admin/audit", auditRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist.",
      requestId: req.requestId,
    },
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  let status = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred.";

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "The request body contains invalid JSON.";
  } else if (error.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "The request body exceeds the allowed size.";
  }

  if (status === 500) {
    console.error(`[${req.requestId}]`, error);
  }

  res.status(status).json({
    error: {
      code,
      message,
      requestId: req.requestId,
      ...(error instanceof AppError && error.details
        ? { details: error.details }
        : {}),
    },
  });
});

export default app;
