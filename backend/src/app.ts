// path: src/app.ts

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env } from "@/config/env";

import {
  notFoundHandler,
  errorHandler,
} from "@/middleware/errorHandler";

import { UPLOAD_DIR_ABSOLUTE } from "@/middleware/upload";

// =========================================================
// ROUTES
// =========================================================

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

// =========================================================
// TICKET ROUTES
// =========================================================

import { ticketRouter } from "@/modules/tickets/ticket.routes";
import { ticketMessageRouter } from "@/modules/tickets/ticketMessage.routes";

// =========================================================
// CREATE APP
// =========================================================

export function createApp() {
  const app = express();

  // =======================================================
  // SECURITY
  // =======================================================

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  // =======================================================
  // CORS
  // =======================================================

  app.use(
    cors({
      origin(origin, callback) {
        // Allow requests without an Origin header
        // such as Postman, curl and server-to-server requests.
        if (!origin || env.clientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        console.warn(
          `[cors] blocked request from disallowed origin: ${origin}`,
        );

        callback(null, false);
      },

      credentials: true,
    }),
  );

  // =======================================================
  // GENERAL MIDDLEWARE
  // =======================================================

  app.use(compression());

  app.use(
    express.json({
      limit: "2mb",
    }),
  );

  app.use(
    morgan(
      env.isProd
        ? "combined"
        : "dev",
    ),
  );

  // =======================================================
  // API RATE LIMIT
  // =======================================================

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api", apiLimiter);

  // =======================================================
  // LOGIN RATE LIMIT
  // =======================================================

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(
    "/api/auth/login",
    authLimiter,
  );

  // =======================================================
  // UPLOADS
  // =======================================================

  app.use(
    "/uploads",
    express.static(UPLOAD_DIR_ABSOLUTE),
  );

  // =======================================================
  // HEALTH CHECK
  // =======================================================

  app.get(
    "/api/health",
    (_req, res) => {
      res.json({
        status: "ok",
        time: new Date().toISOString(),
      });
    },
  );

  // =======================================================
  // AUTH
  // =======================================================

  app.use(
    "/api/auth",
    authRouter,
  );

  // =======================================================
  // EMPLOYEES
  // =======================================================

  app.use(
    "/api/employees",
    employeesRouter,
  );

  // =======================================================
  // ORGANIZATION
  // =======================================================

  app.use(
    "/api/organization",
    organizationRouter,
  );

  // =======================================================
  // ATTENDANCE
  // =======================================================

  app.use(
    "/api/attendance",
    attendanceRouter,
  );

  // =======================================================
  // LEAVE
  // =======================================================

  app.use(
    "/api/leave",
    leaveRouter,
  );

  // =======================================================
  // RECRUITMENT
  // =======================================================

  app.use(
    "/api/recruitment",
    recruitmentRouter,
  );

  // =======================================================
  // PERFORMANCE
  // =======================================================

  app.use(
    "/api/performance",
    performanceRouter,
  );

  // =======================================================
  // PAYROLL
  // =======================================================

  app.use(
    "/api/payroll",
    payrollRouter,
  );

  // =======================================================
  // NOTIFICATIONS
  // =======================================================

  app.use(
    "/api/notifications",
    notificationsRouter,
  );

  // =======================================================
  // DOCUMENTS
  // =======================================================

  app.use(
    "/api/documents",
    documentsRouter,
  );

  // =======================================================
  // TICKETS
  // =======================================================

  app.use(
    "/api/tickets",
    ticketRouter,
  );

  // =======================================================
  // TICKET MESSAGES
  //
  // GET:
  // /api/tickets/:id/messages
  //
  // POST:
  // /api/tickets/:id/messages
  //
  // This router handles:
  // Employee -> HR Admin messages
  // HR Admin -> Employee messages
  // =======================================================

  app.use(
    "/api/tickets",
    ticketMessageRouter,
  );

  // =======================================================
  // DASHBOARD
  // =======================================================

  app.use(
    "/api/dashboard",
    dashboardRouter,
  );

  // =======================================================
  // 404 HANDLER
  // =======================================================

  app.use(
    notFoundHandler,
  );

  // =======================================================
  // ERROR HANDLER
  // =======================================================

  app.use(
    errorHandler,
  );

  return app;
}