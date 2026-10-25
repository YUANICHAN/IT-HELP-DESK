import { serviceLevelForTicket } from "./serviceLevels.service.js";

export async function showServiceLevel(req, res) {
  res.status(200).json({
    data: {
      serviceLevel: await serviceLevelForTicket(req.auth, req.params.ticketId),
    },
  });
}
