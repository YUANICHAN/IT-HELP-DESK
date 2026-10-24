import mongoose from "mongoose";
await mongoose.connect("mongodb://127.0.0.1:27019/admin?directConnection=true");
try {
  await mongoose.connection.db.admin().command({
    replSetInitiate: {
      _id: "step67",
      members: [{
        _id: 0,
        host: "127.0.0.1:27019"
      }]
    }
  });
} catch (error) {
  if (error.codeName !== "AlreadyInitialized") throw error;
} finally {
  await mongoose.disconnect();
}
