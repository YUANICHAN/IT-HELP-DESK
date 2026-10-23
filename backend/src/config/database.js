import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("bufferCommands", false);

export async function connectDatabase() {
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log("MongoDB connected.");
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
