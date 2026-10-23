import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

let server;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal}: shutting down.`);

  const timeout = setTimeout(() => {
    console.error("Shutdown timed out.");
    process.exit(1);
  }, 10000);

  timeout.unref();

  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await disconnectDatabase();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    console.error("Shutdown failed:", error.message);
    process.exit(1);
  }
}

async function startServer() {
  try {
    await connectDatabase();

    server = app.listen(env.port, env.host, () => {
      console.log(`API running at http://${env.host}:${env.port}`);
      console.log(
        `Health: http://${env.host}:${env.port}/api/v1/health`,
      );
    });

    server.on("error", async (error) => {
      console.error("HTTP server failed:", error.message);

      try {
        await disconnectDatabase();
      } finally {
        process.exit(1);
      }
    });

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
