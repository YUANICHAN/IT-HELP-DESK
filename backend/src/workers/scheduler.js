import { env } from "../config/env.js";
import { evaluateSlaBreaches } from "./sla.processor.js";

export function startScheduler() {
  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      const summary = await evaluateSlaBreaches({
        limit: env.sla.evaluationBatchSize,
      });
      if (summary.breaches || summary.reconciliationRequired) {
        console.log("SLA evaluation:", summary);
      }
    } catch (error) {
      console.error("SLA evaluation failed:", error.message);
    } finally {
      running = false;
    }
  }
  void run();
  const timer = setInterval(run, env.sla.evaluationIntervalSeconds * 1000);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
    runNow: run,
  };
}
