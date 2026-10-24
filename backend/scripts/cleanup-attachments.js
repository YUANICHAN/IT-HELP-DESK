import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { cleanupAttachments } from "../src/modules/attachments/attachment.service.js";
try {
  await connectDatabase();
  console.log(await cleanupAttachments());
} finally {
  await disconnectDatabase();
}
