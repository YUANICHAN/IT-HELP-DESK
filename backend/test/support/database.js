import { randomUUID } from "node:crypto";

export function isolatedDatabaseUri(label) {
  const baseUri =
    process.env.TEST_MONGODB_URI ||
    "mongodb://127.0.0.1:27017/it_help_desk_test";
  const uri = new URL(baseUri);
  const suffix = randomUUID().replaceAll("-", "");
  uri.pathname = `/it_help_desk_test_${label}_${suffix}`;
  return uri.toString();
}
