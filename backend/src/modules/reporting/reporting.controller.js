import { clockNow } from "../../shared/time/clock.js";
import { overviewReport } from "./reporting.service.js";
import { validateReportingQuery } from "./reporting.validation.js";

export async function overview(req, res) {
  const asOf = clockNow();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    data: {
      report: await overviewReport(
        req.auth,
        validateReportingQuery(req.query, asOf),
        asOf,
      ),
    },
  });
}
