import net from "node:net";
import { storageConfig } from "../../config/storage.js";
// ClamAV INSTREAM protocol. An unavailable scanner never produces CLEAN.
export async function scanBuffer(buffer) {
  const config = storageConfig();
  if (!config.scanning) return "NOT_CONFIGURED";
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: config.scanHost,
      port: config.scanPort
    });
    let response = "",
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    socket.setTimeout(30000, () => finish(new Error("Scanner timeout.")));
    socket.on("error", error => finish(error));
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < buffer.length; offset += 65536) {
        const chunk = buffer.subarray(offset, offset + 65536),
          length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", chunk => {
      response += chunk.toString("utf8");
      if (response.length > 4096) return finish(new Error("Invalid scanner response."));
      if (response.includes("\0") || response.includes("\n")) {
        if (/^stream: OK[\0\r\n]/u.test(response)) finish(null, "CLEAN");else if (/ FOUND[\0\r\n]/u.test(response)) finish(null, "INFECTED");else finish(new Error("Scanner did not confirm a clean result."));
      }
    });
    socket.on("end", () => {
      if (!settled) finish(new Error("Incomplete scanner response."));
    });
  });
}
