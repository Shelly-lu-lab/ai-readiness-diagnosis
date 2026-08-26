import { createSqlClient } from "@ai-readiness/database";
import { buildApp } from "./app.js";
import { validateProductionConfig } from "./config.js";

validateProductionConfig(process.env);
const db = await createSqlClient();
const app = await buildApp(db);
const port = Number(process.env.API_PORT ?? 4310);

await app.listen({ port, host: process.env.API_HOST ?? "127.0.0.1" });
const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
