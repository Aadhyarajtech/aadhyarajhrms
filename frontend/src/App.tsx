import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

// =========================================================
// PUBLIC PAGES
// =========================================================

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));

// =========================================================
// MAIN PAGES
// =========================================================

const Dashboard = lazy(() => import("@/pages/Dashboard"));

const MyTickets = lazy(
  () => import("@/pages/MyTickets"),
);

const Tickets = lazy(
  () => import("@/pages/Tickets"),
);

// =========================================================
// TICKET CONVERSATION
// =========================================================

// IMPORTANT:
// TicketConversation is the chat/message page.
const TicketConversation = lazy(
  () => import("@/pages/TicketConversation"),
);

// =========================================================
// EMPLOYEES
// =========================================================

const EmployeeDirectory = lazy(
  () => import("@/pages/employees/EmployeeDirectory"),
);

const EmployeeProfile = lazy(
  () => import("@/pages/employees/EmployeeProfile"),
);

const MyTeam = lazy(() => import("@/pages/MyTeam"));

const OrgChart = lazy(
  () => import("@/pages/employees/OrgChart"),
);

// =========================================================
// HR MODULES
// =========================================================

const Attendance = lazy(
  () => import("@/pages/Attendance"),
);

const Leave = lazy(
  () => import("@/pages/Leave"),
);

const Recruitment = lazy(
  () => import("@/pages/recruitment/Recruitment"),
);

const JobDetail = lazy(
  () => import("@/pages/recruitment/JobDetail"),
);

const Performance = lazy(
  () => import("@/pages/Performance"),
);

const Payroll = lazy(
  () => import("@/pages/Payroll"),
);

const Documents = lazy(
  () => import("@/pages/Documents"),
);

const Announcements = lazy(
  () => import("@/pages/Announcements"),
);

// =========================================================
// CALENDAR
// =========================================================

const Calendar = lazy(
  () => import("@/pages/Calendar"),
);

// =========================================================
// SETTINGS
// =========================================================

const Settings = lazy(
  () => import("@/pages/settings/Settings"),
);

const AccountSettings = lazy(
  () => import("@/pages/settings/AccountSettings"),
);

// =========================================================
// 404
// =========================================================

const NotFound = lazy(
  () => import("@/pages/NotFound"),
);

// =========================================================
// LOADING
// =========================================================

function PageFallback() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <Loader2
        className="h-6 w-6 animate-spin text-brand-600"
      />
    </div>
  );
}

// =========================================================
// APP
// =========================================================

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>

        {/* =====================================================
            PUBLIC ROUTES
        ===================================================== */}

        <Route path="/" element={<Landing />} />

        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />

        {/* =====================================================
            PROTECTED APPLICATION
        ===================================================== */}

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          {/* =================================================
              DEFAULT APP ROUTE
          ================================================= */}

          <Route
            index
            element={<Navigate to="dashboard" replace />}
          />

          {/* =================================================
              DASHBOARD
          ================================================= */}

          <Route
            path="dashboard"
            element={<Dashboard />}
          />

          {/* =================================================
              MY TICKETS
          ================================================= */}

          <Route
            path="my-tickets"
            element={<MyTickets />}
          />

          {/* =================================================
              TICKETS
          ================================================= */}

          <Route
            path="tickets"
            element={
              <ProtectedRoute
                roles={[
                  "SUPER_ADMIN",
                  "HR_ADMIN",
                  "MANAGER",
                  "FINANCE",
                  "IT_SUPPORT",
                ]}
              >
                <Tickets />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              TICKET CONVERSATION
          ================================================= */}

          <Route
            path="tickets/:id"
            element={
              <ProtectedRoute>
                <TicketConversation />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              OLD TICKET CONVERSATION URL
          ================================================= */}

          <Route
            path="ticket-conversation/:id"
            element={
              <ProtectedRoute>
                <TicketConversation />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              EMPLOYEES
          ================================================= */}

          <Route
            path="employees"
            element={
              <ProtectedRoute
                roles={[
                  "SUPER_ADMIN",
                  "HR_ADMIN",
                ]}
              >
                <EmployeeDirectory />
              </ProtectedRoute>
            }
          />

          <Route
            path="employees/:id"
            element={<EmployeeProfile />}
          />

          {/* =================================================
              MY TEAM
          ================================================= */}

          <Route
            path="my-team"
            element={
              <ProtectedRoute roles={["MANAGER"]}>
                <MyTeam />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              ORG CHART
          ================================================= */}

          <Route
            path="org-chart"
            element={
              <ProtectedRoute
                roles={[
                  "SUPER_ADMIN",
                  "HR_ADMIN",
                  "MANAGER",
                ]}
              >
                <OrgChart />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              ATTENDANCE
          ================================================= */}

          <Route
            path="attendance"
            element={<Attendance />}
          />

          {/* =================================================
              LEAVE
          ================================================= */}

          <Route
            path="leave"
            element={<Leave />}
          />

          {/* =================================================
              RECRUITMENT
          ================================================= */}

          <Route
            path="recruitment"
            element={
              <ProtectedRoute
                roles={[
                  "SUPER_ADMIN",
                  "HR_ADMIN",
                  "RECRUITER",
                  "MANAGER",
                ]}
              >
                <Recruitment />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              RECRUITMENT JOB DETAIL
          ================================================= */}

          <Route
            path="recruitment/:jobId"
            element={
              <ProtectedRoute
                roles={[
                  "SUPER_ADMIN",
                  "HR_ADMIN",
                  "RECRUITER",
                  "MANAGER",
                ]}
              >
                <JobDetail />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              PERFORMANCE
          ================================================= */}

          <Route
            path="performance"
            element={<Performance />}
          />

          {/* =================================================
              PAYROLL
          ================================================= */}

          <Route
            path="payroll"
            element={<Payroll />}
          />

          {/* =================================================
              DOCUMENTS
          ================================================= */}

          <Route
            path="documents"
            element={<Documents />}
          />

          {/* =================================================
              ANNOUNCEMENTS
          ================================================= */}

          <Route
            path="announcements"
            element={
              <ProtectedRoute>
                <Announcements />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              CALENDAR

              URL:
              /app/calendar
          ================================================= */}

          <Route
            path="calendar"
            element={
              <ProtectedRoute>
                <Calendar />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              SETTINGS ACCOUNT
          ================================================= */}

          <Route
            path="settings/account"
            element={<AccountSettings />}
          />

          {/* =================================================
              SETTINGS
          ================================================= */}

          <Route
            path="settings"
            element={
              <ProtectedRoute
                roles={[
                  "SUPER_ADMIN",
                  "HR_ADMIN",
                  "MANAGER",
                  "RECRUITER",
                  "FINANCE",
                ]}
              >
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* =================================================
              UNKNOWN APP ROUTE
          ================================================= */}

          <Route
            path="*"
            element={<NotFound />}
          />

        </Route>

        {/* =====================================================
            UNKNOWN PUBLIC ROUTE
        ===================================================== */}

        <Route
          path="*"
          element={<NotFound />}
        />

      </Routes>
    </Suspense>
  );
}