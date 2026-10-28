import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { storageConfig } from "../../config/storage.js";

function safeStorageCode(error) {
  if (error?.code === "EACCES" || error?.code === "EPERM") return "STORAGE_PERMISSION_DENIED";
  if (error?.code === "ENOSPC") return "STORAGE_CAPACITY_EXHAUSTED";
  if (error?.code === "EROFS") return "STORAGE_READ_ONLY";
  if (error?.code === "ENOENT") return "STORAGE_LOCATION_MISSING";
  return "STORAGE_PROBE_FAILED";
}

export async function inspectPrivateStorage(options = {}) {
  const enabled = options.enabled ?? env.operations.storageHealthProbeEnabled;
  if (!enabled) {
    return { status: "not-configured", writable: null, capacity: null, diagnosticCode: "STORAGE_PROBE_DISABLED" };
  }
  let root = options.root;
  if (!root) {
    try {
      root = storageConfig().root;
    } catch {
      return { status: "unavailable", writable: false, capacity: null, diagnosticCode: "STORAGE_CONFIGURATION_INVALID" };
    }
  }
  const probeDirectory = path.join(root, ".health-probes");
  const probePath = path.join(probeDirectory, `probe-${randomUUID()}`);
  let result;
  try {
    await mkdir(probeDirectory, { recursive: true });
    await writeFile(probePath, "health-probe", { flag: "wx", mode: 0o600 });
    const capacity = await statfs(root).catch(() => null);
    result = {
      status: "healthy",
      writable: true,
      capacity: capacity
        ? {
            availableBytes: Number(capacity.bavail) * Number(capacity.bsize),
            totalBytes: Number(capacity.blocks) * Number(capacity.bsize),
          }
        : null,
      diagnosticCode: null,
    };
  } catch (error) {
    result = { status: "unavailable", writable: false, capacity: null, diagnosticCode: safeStorageCode(error) };
  }
  try {
    await unlink(probePath);
  } catch (error) {
    if (error?.code !== "ENOENT" && result.status === "healthy") {
      result = { ...result, status: "degraded", diagnosticCode: "STORAGE_PROBE_CLEANUP_FAILED" };
    }
  }
  return result;
}

function validTimestamp(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function malformed(code = "BACKUP_MANIFEST_MALFORMED") {
  return {
    status: "unknown",
    diagnosticCode: code,
    latestAttempt: null,
    lastSuccessfulBackup: null,
    lastVerifiedRestore: null,
  };
}

export async function inspectBackupEvidence({
  manifestPath = env.operations.backupManifestPath,
  maximumAgeHours = env.operations.backupMaximumAgeHours,
  at = new Date(),
} = {}) {
  if (!manifestPath) {
    return {
      status: "not-configured",
      diagnosticCode: "BACKUP_MANIFEST_NOT_CONFIGURED",
      maximumAgeHours,
      latestAttempt: null,
      lastSuccessfulBackup: null,
      lastVerifiedRestore: null,
    };
  }
  let document;
  try {
    const file = await stat(manifestPath);
    if (!file.isFile() || file.size > 65_536) return malformed();
    document = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return malformed("BACKUP_MANIFEST_MISSING");
    if (error instanceof SyntaxError) return malformed();
    return malformed("BACKUP_MANIFEST_UNREADABLE");
  }
  const attempt = document?.latestAttempt;
  const successful = document?.lastSuccessfulBackup;
  const restore = document?.lastVerifiedRestore ?? null;
  const attemptStarted = validTimestamp(attempt?.startedAt);
  const attemptCompleted = validTimestamp(attempt?.completedAt);
  const successfulAt = validTimestamp(successful?.completedAt);
  const restoreAt = restore ? validTimestamp(restore.verifiedAt) : null;
  const attemptOutcomes = new Set(["SUCCESS", "FAILED"]);
  const restoreOutcomes = new Set(["SUCCESS", "FAILED"]);
  if (
    document?.schemaVersion !== 1 || !attemptStarted || !attemptCompleted ||
    attemptStarted > attemptCompleted || !attemptOutcomes.has(attempt?.outcome) ||
    !successfulAt || typeof successful?.coverage?.database !== "boolean" ||
    typeof successful?.coverage?.privateAttachments !== "boolean" ||
    (restore && (!restoreAt || !restoreOutcomes.has(restore.outcome))) ||
    successfulAt.getTime() > at.getTime() + 300_000 ||
    attemptCompleted.getTime() > at.getTime() + 300_000
  ) {
    return malformed();
  }
  const ageSeconds = Math.max(0, Math.floor((at - successfulAt) / 1000));
  const stale = ageSeconds > maximumAgeHours * 3600;
  const completeCoverage = successful.coverage.database && successful.coverage.privateAttachments;
  let diagnosticCode = null;
  if (attempt.outcome === "FAILED") diagnosticCode = "LATEST_BACKUP_ATTEMPT_FAILED";
  else if (restore?.outcome === "FAILED") diagnosticCode = "LAST_RESTORE_VERIFICATION_FAILED";
  else if (!completeCoverage) diagnosticCode = "BACKUP_COVERAGE_INCOMPLETE";
  else if (stale) diagnosticCode = "BACKUP_EVIDENCE_STALE";
  return {
    status: diagnosticCode ? "degraded" : "healthy",
    diagnosticCode,
    maximumAgeHours,
    latestAttempt: {
      startedAt: attemptStarted.toISOString(),
      completedAt: attemptCompleted.toISOString(),
      outcome: attempt.outcome,
      code: typeof attempt.code === "string" && /^[A-Z0-9_]{1,80}$/u.test(attempt.code)
        ? attempt.code
        : null,
    },
    lastSuccessfulBackup: {
      completedAt: successfulAt.toISOString(),
      ageSeconds,
      coverage: {
        database: successful.coverage.database,
        privateAttachments: successful.coverage.privateAttachments,
      },
    },
    lastVerifiedRestore: restore
      ? { verifiedAt: restoreAt.toISOString(), outcome: restore.outcome }
      : null,
  };
}
