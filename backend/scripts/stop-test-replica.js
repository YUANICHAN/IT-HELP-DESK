import mongoose from "mongoose";
try {
  await mongoose.connect("mongodb://127.0.0.1:27019/admin?directConnection=true", {
    serverSelectionTimeoutMS: 3000
  });
  const hello = await mongoose.connection.db.admin().command({
    hello: 1
  });
  if (hello.setName !== "step67") throw new Error("Refusing to stop an unexpected replica set.");
  await mongoose.connection.db.admin().command({
    shutdown: 1
  });
} catch (error) {
  if (!["MongoNetworkError", "MongoServerSelectionError"].includes(error.name)) throw error;
} finally {
  await mongoose.disconnect();
}
