import { administratorHealth } from "./health.service.js";

export async function adminHealth(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    data: await administratorHealth(req.auth.user.organizationId),
  });
}
