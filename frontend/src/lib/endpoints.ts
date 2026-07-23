import { api } from "./api";
import type {
  AuthUser, Employee, Department, Designation, LeaveType, LeaveBalance, LeaveRequest,
  AttendanceRecord, JobPosting, Candidate, Interview, PerformanceCycle, PerformanceReview,
  Goal, SalaryStructure, PayrollRun, Payslip, Notification, Announcement, Holiday, Asset,
} from "@/types";

// --- Auth --------------------------------------------------------------------
export const AuthApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: AuthUser }>("/auth/login", { email, password }).then((r) => r.data),
  me: () => api.get<{ user: AuthUser }>("/auth/me").then((r) => r.data.user),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post("/auth/change-password", { currentPassword, newPassword }).then((r) => r.data),
};

// --- Employees ---------------------------------------------------------------
export interface EmployeeListParams {
  search?: string; departmentId?: string; status?: string; managerId?: string; page?: number; pageSize?: number;
}
export const EmployeesApi = {
  list: (params: EmployeeListParams = {}) =>
    api.get<{ employees: Employee[]; total: number; page: number; pageSize: number }>("/employees", { params }).then((r) => r.data),
  get: (id: string) => api.get<{ employee: Employee }>(`/employees/${id}`).then((r) => r.data.employee),
  directReports: (id: string) => api.get<{ employees: Employee[] }>(`/employees/${id}/direct-reports`).then((r) => r.data.employees),
  managers: () => api.get<{ managers: { id: string; firstName: string; lastName: string; designationTitle: string }[] }>("/employees/managers").then((r) => r.data.managers),
  orgChart: () => api.get<{ chart: any[] }>("/employees/org-chart").then((r) => r.data.chart),
  create: (payload: Record<string, unknown>) => api.post<{ employee: Employee }>("/employees", payload).then((r) => r.data.employee),
  update: (id: string, payload: Record<string, unknown>) => api.patch<{ employee: Employee }>(`/employees/${id}`, payload).then((r) => r.data.employee),
  headcountByDepartment: () => api.get<{ data: { department: string; color: string; count: number }[] }>("/employees/analytics/headcount-by-department").then((r) => r.data.data),
  genderDiversity: () => api.get<{ data: { gender: string; count: number }[] }>("/employees/analytics/gender-diversity").then((r) => r.data.data),
  employmentType: () => api.get<{ data: { type: string; count: number }[] }>("/employees/analytics/employment-type").then((r) => r.data.data),
  headcountTrend: (months = 6) => api.get<{ data: { month: string; headcount: number }[] }>("/employees/analytics/headcount-trend", { params: { months } }).then((r) => r.data.data),
};

// --- Organization (departments, designations, holidays) ----------------------
export const OrganizationApi = {
  departments: () => api.get<{ departments: Department[] }>("/organization/departments").then((r) => r.data.departments),
  createDepartment: (payload: Record<string, unknown>) => api.post<{ department: Department }>("/organization/departments", payload).then((r) => r.data.department),
  updateDepartment: (id: string, payload: Record<string, unknown>) => api.patch<{ department: Department }>(`/organization/departments/${id}`, payload).then((r) => r.data.department),
  designations: (departmentId?: string) => api.get<{ designations: Designation[] }>("/organization/designations", { params: { departmentId } }).then((r) => r.data.designations),
  createDesignation: (payload: Record<string, unknown>) => api.post<{ designation: Designation }>("/organization/designations", payload).then((r) => r.data.designation),
  holidays: (year?: number) => api.get<{ holidays: Holiday[] }>("/organization/holidays", { params: { year } }).then((r) => r.data.holidays),
  createHoliday: (payload: Record<string, unknown>) => api.post<{ holiday: Holiday }>("/organization/holidays", payload).then((r) => r.data.holiday),
  deleteHoliday: (id: string) => api.delete(`/organization/holidays/${id}`),
};

// --- Attendance ----------------------------------------------------------------
export const AttendanceApi = {
  today: () => api.get<{ record: AttendanceRecord | null }>("/attendance/today").then((r) => r.data.record),
  checkIn: () => api.post<{ record: AttendanceRecord }>("/attendance/check-in").then((r) => r.data.record),
  checkOut: () => api.post<{ record: AttendanceRecord }>("/attendance/check-out").then((r) => r.data.record),
  mine: (month?: number, year?: number) => api.get<{ records: AttendanceRecord[] }>("/attendance/me", { params: { month, year } }).then((r) => r.data.records),
  forEmployee: (employeeId: string, month?: number, year?: number) => api.get<{ records: AttendanceRecord[] }>(`/attendance/employee/${employeeId}`, { params: { month, year } }).then((r) => r.data.records),
  byDate: (date: string) => api.get<{ records: any[] }>(`/attendance/by-date/${date}`).then((r) => r.data.records),
  summaryToday: () => api.get<{ present: number; total: number; date: string; isToday: boolean }>("/attendance/summary/today").then((r) => r.data),
  trend: (months = 6) => api.get<{ data: { month: string; presentRate: number }[] }>("/attendance/analytics/trend", { params: { months } }).then((r) => r.data.data),
  regularize: (date: string, note: string) => api.post<{ record: AttendanceRecord }>("/attendance/regularize", { date, note }).then((r) => r.data.record),
};

// --- Leave ----------------------------------------------------------------------
export const LeaveApi = {
  types: () => api.get<{ leaveTypes: LeaveType[] }>("/leave/types").then((r) => r.data.leaveTypes),
  balances: (employeeId?: string, year?: number) => api.get<{ balances: LeaveBalance[] }>("/leave/balances", { params: { employeeId, year } }).then((r) => r.data.balances),
  requests: (params: { status?: string; scope?: "team"; employeeId?: string } = {}) =>
    api.get<{ requests: LeaveRequest[] }>("/leave/requests", { params }).then((r) => r.data.requests),
  apply: (payload: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) =>
    api.post<{ request: LeaveRequest }>("/leave/requests", payload).then((r) => r.data.request),
  decide: (id: string, status: "APPROVED" | "REJECTED", decisionNote?: string) =>
    api.post<{ request: LeaveRequest }>(`/leave/requests/${id}/decide`, { status, decisionNote }).then((r) => r.data.request),
  cancel: (id: string) => api.post<{ request: LeaveRequest }>(`/leave/requests/${id}/cancel`).then((r) => r.data.request),
  calendar: (month?: number, year?: number) => api.get<{ entries: any[] }>("/leave/calendar", { params: { month, year } }).then((r) => r.data.entries),
};

// --- Recruitment ------------------------------------------------------------------
export const RecruitmentApi = {
  jobs: (status?: string) => api.get<{ jobs: JobPosting[] }>("/recruitment/jobs", { params: { status } }).then((r) => r.data.jobs),
  job: (id: string) => api.get<{ job: JobPosting }>(`/recruitment/jobs/${id}`).then((r) => r.data.job),
  createJob: (payload: Record<string, unknown>) => api.post<{ job: JobPosting }>("/recruitment/jobs", payload).then((r) => r.data.job),
  updateJobStatus: (id: string, status: string) => api.patch<{ job: JobPosting }>(`/recruitment/jobs/${id}/status`, { status }).then((r) => r.data.job),
  candidates: (jobPostingId?: string) => api.get<{ candidates: Candidate[] }>("/recruitment/candidates", { params: { jobPostingId } }).then((r) => r.data.candidates),
  candidate: (id: string) => api.get<{ candidate: Candidate }>(`/recruitment/candidates/${id}`).then((r) => r.data.candidate),
  createCandidate: (payload: Record<string, unknown>) => api.post<{ candidate: Candidate }>("/recruitment/candidates", payload).then((r) => r.data.candidate),
  moveStage: (id: string, stage: string) => api.patch<{ candidate: Candidate }>(`/recruitment/candidates/${id}/stage`, { stage }).then((r) => r.data.candidate),
  rate: (id: string, rating: number) => api.patch<{ candidate: Candidate }>(`/recruitment/candidates/${id}/rating`, { rating }).then((r) => r.data.candidate),
  interviews: (candidateId?: string) => api.get<{ interviews: Interview[] }>("/recruitment/interviews", { params: { candidateId } }).then((r) => r.data.interviews),
  scheduleInterview: (payload: Record<string, unknown>) => api.post<{ interview: Interview }>("/recruitment/interviews", payload).then((r) => r.data.interview),
  submitFeedback: (id: string, feedback: string, recommendation: string) =>
    api.post<{ interview: Interview }>(`/recruitment/interviews/${id}/feedback`, { feedback, recommendation }).then((r) => r.data.interview),
  pipelineSummary: () => api.get<{ data: { stage: string; count: number }[] }>("/recruitment/analytics/pipeline").then((r) => r.data.data),
  openRoles: () => api.get<{ count: number }>("/recruitment/analytics/open-roles").then((r) => r.data.count),
};

// --- Performance ----------------------------------------------------------------
export const PerformanceApi = {
  cycles: () => api.get<{ cycles: PerformanceCycle[] }>("/performance/cycles").then((r) => r.data.cycles),
  createCycle: (payload: Record<string, unknown>) => api.post<{ cycle: PerformanceCycle }>("/performance/cycles", payload).then((r) => r.data.cycle),
  reviews: (params: { cycleId?: string; scope?: "team"; revieweeId?: string } = {}) =>
    api.get<{ reviews: PerformanceReview[] }>("/performance/reviews", { params }).then((r) => r.data.reviews),
  myReview: () => api.get<{ review: PerformanceReview | null }>("/performance/reviews/mine").then((r) => r.data.review),
  ensureReview: (payload: { cycleId: string; revieweeId: string; reviewerId: string }) =>
    api.post<{ review: PerformanceReview }>("/performance/reviews", payload).then((r) => r.data.review),
  submitSelf: (id: string, selfRating: number, strengths: string, improvements: string) =>
    api.post<{ review: PerformanceReview }>(`/performance/reviews/${id}/self`, { selfRating, strengths, improvements }).then((r) => r.data.review),
  submitManager: (id: string, managerRating: number, managerComments: string) =>
    api.post<{ review: PerformanceReview }>(`/performance/reviews/${id}/manager`, { managerRating, managerComments }).then((r) => r.data.review),
  goals: (employeeId?: string) => api.get<{ goals: Goal[] }>("/performance/goals", { params: { employeeId } }).then((r) => r.data.goals),
  createGoal: (payload: { title: string; description?: string; dueDate: string }) =>
    api.post<{ goal: Goal }>("/performance/goals", payload).then((r) => r.data.goal),
  updateGoalProgress: (id: string, progress: number) => api.patch<{ goal: Goal }>(`/performance/goals/${id}/progress`, { progress }).then((r) => r.data.goal),
  ratingByDepartment: () => api.get<{ data: { department: string; avgRating: number }[] }>("/performance/analytics/rating-by-department").then((r) => r.data.data),
};

// --- Payroll -----------------------------------------------------------------------
export const PayrollApi = {
  getSalaryStructure: (employeeId: string) => api.get<{ structure: SalaryStructure | null }>(`/payroll/salary-structure/${employeeId}`).then((r) => r.data.structure),
  upsertSalaryStructure: (payload: Record<string, unknown>) => api.put<{ structure: SalaryStructure }>("/payroll/salary-structure", payload).then((r) => r.data.structure),
  runs: () => api.get<{ runs: PayrollRun[] }>("/payroll/runs").then((r) => r.data.runs),
  process: (month: number, year: number) => api.post<{ run: PayrollRun }>("/payroll/runs/process", { month, year }).then((r) => r.data.run),
  markPaid: (id: string) => api.post<{ run: PayrollRun }>(`/payroll/runs/${id}/mark-paid`).then((r) => r.data.run),
  payslipsForRun: (runId: string) => api.get<{ payslips: Payslip[] }>(`/payroll/runs/${runId}/payslips`).then((r) => r.data.payslips),
  myPayslips: () => api.get<{ payslips: Payslip[] }>("/payroll/payslips/mine").then((r) => r.data.payslips),
  payslipsForEmployee: (employeeId: string) => api.get<{ payslips: Payslip[] }>(`/payroll/payslips/employee/${employeeId}`).then((r) => r.data.payslips),
  payslip: (id: string) => api.get<{ payslip: Payslip }>(`/payroll/payslips/${id}`).then((r) => r.data.payslip),
  costTrend: (months = 6) => api.get<{ data: { month: number; year: number; totalNet: number }[] }>("/payroll/analytics/cost-trend", { params: { months } }).then((r) => r.data.data),
};

// --- Notifications & Announcements -------------------------------------------------
export const NotificationsApi = {
  list: (unreadOnly = false) => api.get<{ notifications: Notification[]; unreadCount: number }>("/notifications", { params: { unreadOnly } }).then((r) => r.data),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post("/notifications/read-all"),
  announcements: () => api.get<{ announcements: Announcement[] }>("/notifications/announcements").then((r) => r.data.announcements),
  createAnnouncement: (payload: Record<string, unknown>) => api.post<{ announcement: Announcement }>("/notifications/announcements", payload).then((r) => r.data.announcement),
};

// --- Documents & Assets -------------------------------------------------------------
export const DocumentsApi = {
  list: (employeeId: string) => api.get<{ documents: any[] }>(`/documents/employee/${employeeId}`).then((r) => r.data.documents),
  upload: (employeeId: string, file: File, type: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    return api.post(`/documents/employee/${employeeId}`, form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data.document);
  },
  delete: (id: string) => api.delete(`/documents/${id}`),
  allAssets: () => api.get<{ assets: Asset[] }>("/documents/assets/all").then((r) => r.data.assets),
  assetsForEmployee: (employeeId: string) => api.get<{ assets: Asset[] }>(`/documents/assets/employee/${employeeId}`).then((r) => r.data.assets),
  assignAsset: (payload: Record<string, unknown>) => api.post<{ asset: Asset }>("/documents/assets", payload).then((r) => r.data.asset),
  updateAssetStatus: (id: string, status: string) => api.patch<{ asset: Asset }>(`/documents/assets/${id}/status`, { status }).then((r) => r.data.asset),
};

// --- Dashboard -----------------------------------------------------------------------
export interface DashboardOverview {
  kpis: {
    headcount: number; newHires30d: number; exits90d: number; pendingLeave: number; openRoles: number;
    presentToday: number; onLeaveToday: number; attritionRate: number; attendanceRate: number;
    attendanceDate: string; attendanceIsToday: boolean;
  };
  headcountByDepartment: { department: string; color: string; count: number }[];
  headcountTrend: { month: string; headcount: number }[];
  genderDiversity: { gender: string; count: number }[];
  employmentType: { type: string; count: number }[];
  attendanceTrend: { month: string; presentRate: number }[];
  recruitmentPipeline: { stage: string; count: number }[];
  costTrend: { month: number; year: number; totalNet: number }[];
  upcomingBirthdays: any[];
  upcomingAnniversaries: any[];
  upcomingHolidays: Holiday[];
  recentActivity: any[];
}
export const DashboardApi = {
  overview: () => api.get<DashboardOverview>("/dashboard/overview").then((r) => r.data),
};
