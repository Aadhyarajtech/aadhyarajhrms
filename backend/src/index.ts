import { createApp } from "@/app";
import { connectDB } from "@/db/connection";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { startEmployeeLifecycleJobs } from "./jobs/employeeLifecycle.job";

async function start() {
  await connectDB();

  startEmployeeLifecycleJobs();

  const app = createApp();

  app.listen(env.port, () => {
    logger.info(
      `Aadhyaraj HRMS API listening on http://localhost:${env.port}`,
      { env: env.nodeEnv },
    );
  });
}

start().catch((err) => {
  logger.error("Failed to start server", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
