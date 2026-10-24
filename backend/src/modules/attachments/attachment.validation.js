import { createHash } from "node:crypto";
import { AppError } from "../../shared/errors/app-error.js";
import { choice, objectId, version } from "../../shared/validation/commands.js";
import { storageConfig } from "../../config/storage.js";
export async function parseAttachment(request) {
  const max = storageConfig().maxBytes;
  if (!/^multipart\/form-data;\s*boundary=/iu.test(request.get("content-type") || "")) throw new AppError(415, "MULTIPART_REQUIRED", "Use multipart/form-data with one file field.");
  if (Number(request.get("content-length")) > max + 65536) throw new AppError(413, "FILE_TOO_LARGE", "Maximum file size is 5 MiB.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > max + 65536) throw new AppError(413, "FILE_TOO_LARGE", "Maximum file size is 5 MiB.");
    chunks.push(chunk);
  }
  let form;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: {
        "Content-Type": request.get("content-type")
      }
    }).formData();
  } catch {
    throw new AppError(400, "INVALID_MULTIPART", "Invalid multipart body.");
  }
  const allowed = ["file", "expectedVersion", "visibility", "commentId"];
  for (const key of form.keys()) if (!allowed.includes(key) || form.getAll(key).length !== 1) throw new AppError(400, "INVALID_MULTIPART", "Unexpected or repeated multipart field.");
  const file = form.get("file"),
    rawVersion = form.get("expectedVersion");
  if (!file || typeof file === "string" || !file.size || file.size > max) throw new AppError(file?.size > max ? 413 : 400, "INVALID_FILE", "Supply one nonempty file, at most 5 MiB.");
  if (typeof rawVersion !== "string" || !/^\d+$/u.test(rawVersion)) throw new AppError(400, "VALIDATION_ERROR", "expectedVersion is required.");
  const buffer = Buffer.from(await file.arrayBuffer());
  // Strict signatures and type/extension agreement; this is format validation, never a malware verdict.
  let mimeType;
  if (buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString("ascii", 12, 16) === "IHDR" && buffer.readUInt32BE(8) === 13 && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0) mimeType = "image/png";else if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer.at(-2) === 255 && buffer.at(-1) === 217) mimeType = "image/jpeg";else if (/^%PDF-(1\.[0-7]|2\.0)[\r\n]/u.test(buffer.toString("ascii", 0, 12)) && /%%EOF\s*$/u.test(buffer.subarray(-1024).toString("ascii"))) mimeType = "application/pdf";
  const extensions = {
    "image/png": /\.png$/iu,
    "image/jpeg": /\.jpe?g$/iu,
    "application/pdf": /\.pdf$/iu
  };
  if (!mimeType || file.type !== mimeType || !extensions[mimeType].test(file.name)) throw new AppError(415, "INVALID_FILE_TYPE", "Extension, declared MIME, and detected PNG, JPEG, or PDF signature must agree.");
  const originalName = file.name.replaceAll("\\", "/").split("/").at(-1).replace(/[\x00-\x1f\x7f"<>:|?*]/gu, "_").slice(-180) || "attachment";
  return {
    input: {
      expectedVersion: version(Number(rawVersion)),
      visibility: choice(form.get("visibility") ?? "PUBLIC", ["PUBLIC", "INTERNAL"], "visibility"),
      commentId: form.has("commentId") ? objectId(form.get("commentId"), "commentId") : null,
      originalName,
      mimeType,
      size: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex")
    },
    buffer
  };
}
