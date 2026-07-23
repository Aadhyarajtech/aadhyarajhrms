import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Loader2 } from "lucide-react";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const EmployeeDirectory = lazy(() => import("@/pages/employees/EmployeeDirectory"));
const EmployeeProfile = lazy(() => import("@/pages/employees/EmployeeProfile"));
const OrgChart = lazy(() => import("@/pages/employees/OrgChart"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Leave = lazy(() => import("@/pages/Leave"));
const Recruitment = lazy(() => import("@/pages/recruitment/Recruitment"));
const JobDetail = lazy(() => import("@/pages/recruitment/JobDetail"));
const Performance = lazy(() => import("@/pages/Performance"));
const Payroll = lazy(() => import("@/pages/Payroll"));
const Announcements = lazy(() => import("@/pages/Announcements"));
const Settings = lazy(() => import("@/pages/settings/Settings"));
const AccountSettings = lazy(() => import("@/pages/settings/AccountSettings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="animate-spin text-brand-500" size={26} />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="employees" element={<EmployeeDirectory />} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="org-chart" element={<OrgChart />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="leave" element={<Leave />} />
          <Route
            path="recruitment"
            element={
              <ProtectedRoute roles={["SUPER_ADMIN", "HR_ADMIN", "RECRUITER", "MANAGER"]}>
                <Recruitment />
              </ProtectedRoute>
            }
          />
          <Route
            path="recruitment/:jobId"
            element={
              <ProtectedRoute roles={["SUPER_ADMIN", "HR_ADMIN", "RECRUITER", "MANAGER"]}>
                <JobDetail />
              </ProtectedRoute>
            }
          />
          <Route path="performance" element={<Performance />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="settings/account" element={<AccountSettings />} />
          <Route
            path="settings"
            element={
              <ProtectedRoute roles={["SUPER_ADMIN", "HR_ADMIN"]}>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
