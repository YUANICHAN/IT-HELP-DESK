import path from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
export function storageConfig() {
  const scanning = (process.env.MALWARE_SCAN_ENABLED || "false").trim().toLowerCase();
  if (!["true", "false"].includes(scanning)) throw new Error("MALWARE_SCAN_ENABLED must be true or false.");
  const scanPort = Number(process.env.CLAMAV_PORT || 3310);
  if (!Number.isInteger(scanPort) || scanPort < 1 || scanPort > 65535) throw new Error("CLAMAV_PORT must be a valid TCP port.");
  const root = path.resolve(process.env.ATTACHMENT_STORAGE_ROOT || path.join(projectRoot, "private-storage"));
  for (const publicRoot of [path.join(projectRoot, "frontend"), path.join(projectRoot, "backend", "public")]) {
    const relative = path.relative(publicRoot, root);
    if (!relative || !relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Attachment storage must be outside public application directories.");
  }
  return {
    root,
    temporary: path.join(root, "temporary"),
    attachments: path.join(root, "attachments"),
    maxBytes: 5 * 1024 * 1024,
    scanning: scanning === "true",
    scanHost: process.env.CLAMAV_HOST || "127.0.0.1",
    scanPort
  };
}
