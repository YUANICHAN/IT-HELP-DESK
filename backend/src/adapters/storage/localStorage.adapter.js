import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, unlink, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { storageConfig } from "../../config/storage.js";
function generatedPath(directory, name) {
  if (!/^[a-f0-9-]{36}$/u.test(name)) throw new Error("Invalid storage identifier.");
  return path.join(directory, name);
}
export const localStorage = {
  async temporary(buffer) {
    const config = storageConfig();
    await mkdir(config.temporary, {
      recursive: true
    });
    await mkdir(config.attachments, {
      recursive: true
    });
    const name = randomUUID();
    await writeFile(generatedPath(config.temporary, name), buffer, {
      flag: "wx",
      mode: 0o600
    });
    return name;
  },
  async finalize(name) {
    const config = storageConfig();
    await rename(generatedPath(config.temporary, name), generatedPath(config.attachments, name));
  },
  async read(name) {
    return readFile(generatedPath(storageConfig().attachments, name));
  },
  async remove(name) {
    const config = storageConfig();
    for (const directory of [config.temporary, config.attachments]) await unlink(generatedPath(directory, name)).catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
  },
  async removeTemporary(name) {
    await unlink(generatedPath(storageConfig().temporary, name)).catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
  },
  async oldFiles(cutoff) {
    const config = storageConfig(),
      result = new Set();
    for (const directory of [config.temporary, config.attachments]) {
      const entries = await readdir(directory, {
        withFileTypes: true
      }).catch(error => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      for (const entry of entries) if (entry.isFile() && /^[a-f0-9-]{36}$/u.test(entry.name) && (await stat(generatedPath(directory, entry.name))).mtime < cutoff) result.add(entry.name);
    }
    return [...result];
  }
};
