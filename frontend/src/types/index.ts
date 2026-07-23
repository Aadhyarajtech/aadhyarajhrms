export type Role = "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "RECRUITER" | "FINANCE" | "EMPLOYEE";

export interface AuthEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  departmentId: string;
  departmentName: string;
  designationTitle: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustResetPwd: boolean;
  employee: AuthEmployee | null;
}

export interface Employee {
  id: string;
  employeeCode: string;
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  personalEmail: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string;
  departmentId: string;
  departmentName: string;
  departmentColor: string;
  designationId: string;
  designationTitle: string;
  designationLevel: number;
  managerId: string | null;
  managerFirstName: string | null;
  managerLastName: string | null;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  status: "ACTIVE" | "ON_LEAVE" | "NOTICE_PERIOD" | "TERMINATED" | "RESIGNED";
  dateOfJoining: string;
  dateOfExit: string | null;
  email: string;
  role: Role;
  isActive: number;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  colorHex: string;
  headId: string | null;
  headFirstName?: string | null;
  headLastName?: string | null;
  headcount: number;
}

export interface Designation {
  id: string;
  title: string;
  level: number;
  departmentId: string;
  departmentName?: string;
}

export interface LeaveType {
  id: string;
  name: string;
  colorHex: string;
  defaultDaysPerYear: number;
  isPaid: boolean;
  requiresApproval: boolean;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allotted: number;
  used: number;
  carriedOver: number;
  name: string;
  colorHex: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  approverId: string | null;
  decisionNote: string | null;
  appliedAt: string;
  decidedAt: string | null;
  firstName: string;
  lastName: string;
  employeeCode: string;
  avatarUrl: string | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: "PRESENT" | "ABSENT" | "HALF_DAY" | "WORK_FROM_HOME" | "ON_LEAVE" | "HOLIDAY" | "WEEKEND";
  workHours: number | null;
  isRegularized: boolean;
  note: string | null;
}

export interface JobPosting {
  id: string;
  title: string;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationTitle: string;
  location: string;
  employmentType: string;
  experienceMin: number;
  experienceMax: number;
  description: string;
  status: "OPEN" | "ON_HOLD" | "CLOSED";
  openings: number;
  postedAt: string;
  candidateCount: number;
}

export interface Candidate {
  id: string;
  jobPostingId: string;
  jobTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  resumeUrl: string | null;
  stage: "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED";
  rating: number | null;
  expectedCtc: number | null;
  source: string;
  appliedAt: string;
  notes: string | null;
}

export interface Interview {
  id: string;
  candidateId: string;
  interviewerId: string;
  interviewerFirstName: string;
  interviewerLastName: string;
  candidateFirstName?: string;
  candidateLastName?: string;
  scheduledAt: string;
  round: string;
  feedback: string | null;
  recommendation: string | null;
  completed: boolean;
}

export interface PerformanceCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface PerformanceReview {
  id: string;
  cycleId: string;
  cycleName: string;
  revieweeId: string;
  reviewerId: string;
  status: "NOT_STARTED" | "SELF_REVIEW" | "MANAGER_REVIEW" | "COMPLETED";
  selfRating: number | null;
  managerRating: number | null;
  finalRating: number | null;
  strengths: string | null;
  improvements: string | null;
  managerComments: string | null;
  submittedAt: string | null;
  revieweeFirstName: string;
  revieweeLastName: string;
  revieweeAvatar: string | null;
  revieweeDesignation: string;
  revieweeDepartment: string;
  reviewerFirstName: string;
  reviewerLastName: string;
}

export interface Goal {
  id: string;
  employeeId: string;
  title: string;
  description: string | null;
  progress: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "AT_RISK" | "COMPLETED";
  dueDate: string;
  createdAt: string;
}

export interface SalaryStructure {
  id: string;
  employeeId: string;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  pf: number;
  professionalTax: number;
  incomeTax: number;
  effectiveFrom: string;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: "DRAFT" | "PROCESSED" | "PAID";
  processedAt: string | null;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  headcount: number;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  grossEarnings: number;
  pf: number;
  professionalTax: number;
  incomeTax: number;
  lop: number;
  totalDeductions: number;
  netPay: number;
  daysPayable: number;
  daysInMonth: number;
  month?: number;
  year?: number;
  runStatus?: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  departmentName?: string;
  designationTitle?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  audience: string;
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  isOptional: boolean;
}

export interface Asset {
  id: string;
  employeeId: string;
  assetTag: string;
  category: string;
  name: string;
  assignedAt: string;
  returnedAt: string | null;
  status: "ASSIGNED" | "RETURNED" | "DAMAGED" | "LOST";
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
}
