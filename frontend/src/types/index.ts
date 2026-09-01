export type Role =
  | "SUPER_ADMIN"
  | "HR_ADMIN"
  | "MANAGER"
  | "RECRUITER"
  | "FINANCE"
  | "IT_SUPPORT"
  | "EMPLOYEE";

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
  state: string | null;
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
  status:
    | "PRESENT"
    | "ABSENT"
    | "HALF_DAY"
    | "WORK_FROM_HOME"
    | "ON_LEAVE"
    | "HOLIDAY"
    | "WEEKEND";
  workHours: number | null;
  isRegularized: boolean;
  note: string | null;
}

/* =========================================================
   RECRUITMENT
========================================================= */

export type RequisitionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type HiringMode = "STANDARD" | "WALK_IN" | "CAMPUS";

export type ApprovalStepStatus = "PENDING" | "APPROVED" | "REJECTED";

export type RecruitmentEmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN";

export type JobStatus = "OPEN" | "ON_HOLD" | "CLOSED";

export type PostingChannel =
  | "CAREERS"
  | "LINKEDIN"
  | "NAUKRI"
  | "INDEED"
  | "REFERRALS";

export interface ApprovalStep {
  approverId: string;
  level: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  actedAt: string | null;
  comment: string | null;
}

export interface JobPosting {
  id: string;

  title: string;

  departmentId: string;
  departmentName: string;

  designationId: string;
  designationTitle: string;

  location: string;

  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | string;

  experienceMin: number;
  experienceMax: number;

  description: string;

  status: "OPEN" | "ON_HOLD" | "CLOSED";

  openings: number;

  postedAt: string;
  requestedAt?: string;
  requestedById?: string;

  /* Requisition workflow */
  requisitionStatus?: RequisitionStatus;

  headcount?: number;

  budgetCtc?: number | null;

  approvalLevelRequired?: number;

  approvalSteps?: ApprovalStep[];

  approvedById?: string | null;

  approvedAt?: string | null;

  rejectionReason?: string | null;

  /* Posting configuration */
  postingChannels?: string[];

  screeningQuestions?: string[];

  shortlistingCriteria?: {
    enabled?: boolean;
    minimumJobFitScore?: number;
    requiredSkills?: string[];
    minimumExperience?: number;
  };

  publishedAt?: string | null;
  closedAt?: string | null;

  hiringMode?: HiringMode;

  skills?: string[];

  candidateCount: number;
}

export interface CandidateOffer {
  status: "NOT_GENERATED" | "SENT" | "ACCEPTED" | "DECLINED";

  offerUrl: string | null;
  annualCtc: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  joiningDate: string;
  generatedAt: string | null;
  respondedAt: string | null;
}

export interface BackgroundVerification {
  status: "NOT_STARTED" | "IN_PROGRESS" | "VERIFIED" | "FAILED";
  provider: string | null;
  reference: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PreboardingDocument {
  type: string;
  url: string;
  uploadedAt: string;
  verified: boolean;
}

export interface Preboarding {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  documents: PreboardingDocument[];
  completedAt: string | null;
}

export type CandidateStage =
  | "APPLIED"
  | "SCREENING"
  | "INTERVIEW"
  | "OFFER"
  | "HIRED"
  | "REJECTED";

export type ReferralBonusStatus =
  | "NOT_APPLICABLE"
  | "PENDING"
  | "APPROVED"
  | "PAID";

export interface Candidate {
  id: string;

  jobPostingId: string;
  jobTitle: string;

  firstName: string;
  lastName: string;

  email: string;
  phone: string | null;

  /* Resume / AI screening */
  resumeUrl: string | null;
  resumeText?: string | null;

  /* Resume parsing */
  resumeParsingStatus?: "NOT_PARSED" | "PARSING" | "PARSED" | "FAILED";
  resumeParsingError?: string | null;
  resumeParsedAt?: string | null;
  extractedSkills?: string[];
  extractedExperience?: number | null;
  extractedEducation?: string[];

  jobFitScore?: number | null;
  screeningSummary?: string | null;
  screeningRecommendation?:
    | "PENDING"
    | "STRONG_FIT"
    | "GOOD_FIT"
    | "WEAK_FIT"
    | "NOT_RECOMMENDED";

  /* Application */
  applicationAnswers?: Record<string, string>;

  /* Duplicate / spam protection */
  duplicateStatus?: "NOT_CHECKED" | "UNIQUE" | "DUPLICATE";
  duplicateOfCandidateId?: string | null;
  spamFlag?: boolean;
  spamReason?: string | null;

  /* AI / final hiring result */
  shortlistingResult?: "PENDING" | "SHORTLISTED" | "NOT_SHORTLISTED";
  finalResult?: "PENDING" | "SELECTED" | "REJECTED";

  /* Pipeline */
  stage: CandidateStage;

  /* Evaluation */
  rating: number | null;
  expectedCtc: number | null;

  /* Source / referral */
  source: PostingChannel | "WALK_IN" | "CAMPUS" | "AGENCY" | string;
  referredById?: string | null;
  referralBonusStatus?: ReferralBonusStatus;

  /* Application */
  appliedAt: string;
  notes: string | null;

  /* Offer */
  offer?: CandidateOffer;

  /* Background verification */
  backgroundVerification?: BackgroundVerification;

  /* Preboarding */
  preboarding?: Preboarding;

  /* Employee conversion */
  hiredEmployeeId?: string | null;
}

export interface InterviewScorecard {
  criterion: string;
  score: number;
  comment: string | null;
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

  mode?: "VIDEO" | "IN_PERSON" | "PHONE";

  meetingLink?: string | null;

  feedback: string | null;

  recommendation: string | null;

  scorecard?: InterviewScorecard[];

  completed: boolean;
}

/* =========================================================
   PERFORMANCE
========================================================= */

export interface PerformanceCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  type:
    | "PROBATION"
    | "QUARTERLY"
    | "HALF_YEARLY"
    | "ANNUAL"
    | "THREE_SIXTY"
    | "PIP";
  purpose: string | null;
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
  cycleId: string | null;
  parentGoalId: string | null;
  category: string | null;
  targetValue: number | null;
  currentValue: number | null;
  milestones: {
    title: string;
    targetDate: string | null;
    completed: boolean;
  }[];
  assignedBy: string | null;
}
export interface PerformanceOutcome {
  id: string;
  reviewId: string;
  incrementRecommendation: "MAXIMUM" | "STANDARD" | "NONE" | "PIP";
  promotionEligible: boolean;
  trainingNeeds: string[];
  pipRecommended: boolean;
  fastTrackEligible: boolean;
  createdAt: string;
}
export interface FeedbackSummary {
  responseCount: number;
  competencies: { competency: string; averageRating: number }[];
  comments: string[];
}

/* =========================================================
   PAYROLL
========================================================= */

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

export type PayslipRequestPeriod = "3_MONTHS" | "6_MONTHS" | "12_MONTHS";

export type PayslipRequestStatus = "PENDING" | "SENT" | "REJECTED";

export interface PayslipRequest {
  id: string;
  employeeId: string;
  requestedByUserId: string;
  period: PayslipRequestPeriod;
  status: PayslipRequestStatus;
  payslipIds: string[];
  processedByUserId: string | null;
  requestedAt: string;
  completedAt: string | null;

  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  availablePayslips?: Payslip[];
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

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

/* =========================================================
   ANNOUNCEMENTS
========================================================= */

export interface AnnouncementReceipt {
  isRead: boolean;
  isAcknowledged: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
}

export type AnnouncementType =
  | "HOLIDAY_NOTICE"
  | "COMPANY_EVENT"
  | "POLICY_UPDATE"
  | "EMPLOYEE_RECOGNITION"
  | "MEETING_NOTICE"
  | "BENEFITS_UPDATE"
  | "TRAINING_LD"
  | "GENERAL_NOTICE";

export type AnnouncementAudience =
  | "ALL"
  | "HR_ADMIN"
  | "FINANCE"
  | "MANAGER"
  | "RECRUITER"
  | "IT_SUPPORT"
  | "EMPLOYEE"
  | "DEPARTMENT"
  | "TARGETED_GROUP";

export type AnnouncementChannel = "IN_APP" | "EMAIL" | "BANNER" | "CALENDAR";

export type AnnouncementStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED";

export interface Announcement {
  id: string;
  title: string;
  body: string;

  type: AnnouncementType | string;
  audience: AnnouncementAudience | string;

  departments?: string[];
  locations?: string[];
  targetRoles?: string[];

  channels?: AnnouncementChannel[];

  pinned: boolean;
  showBanner?: boolean;
  requiresAcknowledgement?: boolean;

  attachment?: string | null;

  createdBy: string;

  status?: AnnouncementStatus | string;

  scheduledAt?: string | null;
  publishedAt?: string | null;

  calendarEnabled?: boolean;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  eventLocation?: string | null;

  createdAt: string;
  updatedAt: string;

  receipt?: AnnouncementReceipt | null;
}

export interface AnnouncementStatusEntry {
  id: string;
  announcementId: string;
  userId: string;

  isRead: boolean;
  isAcknowledged: boolean;

  readAt: string | null;
  acknowledgedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

/* =========================================================
   HOLIDAYS
========================================================= */

export interface Holiday {
  id: string;
  name: string;
  date: string;
  isOptional: boolean;
}

/* =========================================================
   ASSETS
========================================================= */

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
