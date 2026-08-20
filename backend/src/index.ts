import { createApp } from "@/app";
import { connectDB } from "@/db/connection";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { startEmployeeLifecycleJobs } from "./jobs/employeeLifecycle.job";

import {
  startAnnouncementScheduler,
} from "@/modules/announcements/announcement.scheduler";

async function start() {
  /* -------------------------------------------------------
     DATABASE
  ------------------------------------------------------- */

  await connectDB();

  /* -------------------------------------------------------
     EMPLOYEE LIFECYCLE JOBS
  ------------------------------------------------------- */

  startEmployeeLifecycleJobs();

  /* -------------------------------------------------------
     ANNOUNCEMENT SCHEDULER
  ------------------------------------------------------- */

  startAnnouncementScheduler();

  /* -------------------------------------------------------
     EXPRESS APP
  ------------------------------------------------------- */

  const app = createApp();

  /* -------------------------------------------------------
     SERVER
  ------------------------------------------------------- */

  app.listen(env.port, () => {
    logger.info(
      `Aadhyaraj HRMS API listening on http://localhost:${env.port}`,
      {
        env: env.nodeEnv,
      },
    );
  });
}

start().catch((err) => {
  logger.error(
    "Failed to start server",
    {
      message:
        err instanceof Error
          ? err.message
          : String(err),
    },
  );

  process.exit(1);
});