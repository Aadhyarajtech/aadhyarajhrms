import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { env } from "@/config/env";
import { notFoundHandler, errorHandler } from "@/middleware/errorHandler";
import { UPLOAD_DIR_ABSOLUTE } from "@/middleware/upload";

import { authRouter } from "@/modules/auth/auth.routes";
import { employeesRouter } from "@/modules/employees/employees.routes";
import { organizationRouter } from "@/modules/organization/organization.routes";
import { attendanceRouter } from "@/modules/attendance/attendance.routes";
import { leaveRouter } from "@/modules/leave/leave.routes";
import { recruitmentRouter } from "@/modules/recruitment/recruitment.routes";
import { performanceRouter } from "@/modules/performance/performance.routes";
import { payrollRouter } from "@/modules/payroll/payroll.routes";
import { notificationsRouter } from "@/modules/notifications/notifications.routes";
import { documentsRouter } from "@/modules/documents/documents.routes";
import { dashboardRouter } from "@/modules/dashboard/dashboard.routes";

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.isProd ? "combined" : "dev"));

  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });
  app.use("/api", apiLimiter);

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
  app.use("/api/auth/login", authLimiter);

  app.use("/uploads", express.static(UPLOAD_DIR_ABSOLUTE));

  app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/organization", organizationRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/leave", leaveRouter);
  app.use("/api/recruitment", recruitmentRouter);
  app.use("/api/performance", performanceRouter);
  app.use("/api/payroll", payrollRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
