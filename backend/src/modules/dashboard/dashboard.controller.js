import { clockNow } from "../../shared/time/clock.js";
import { validateReportingQuery } from "../reporting/reporting.validation.js";
import { dashboard } from "./dashboard.service.js";

export async function getDashboard(req, res) {
  const asOf = clockNow();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    data: {
      dashboard: await dashboard(
        req.auth,
        validateReportingQuery(req.query, asOf),
        asOf,
      ),
    },
  });
}
