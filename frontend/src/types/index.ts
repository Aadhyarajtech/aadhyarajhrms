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

export interface EmployeeOnboardingStage {
  stage: number;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  completedAt: string | null;
  completedBy: string | null;
  remarks: string | null;
}

export interface EmployeeOnboarding {
  currentStage: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  stages: EmployeeOnboardingStage[];
  startedAt: string | null;
  completedAt: string | null;
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
  isManager: boolean;
  managerFirstName: string | null;
  managerLastName: string | null;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  status:

  | "ONBOARDING"
  | "ON_PROBATION"
  | "ACTIVE"
  | "ON_LEAVE"
  | "NOTICE_PERIOD"
  | "TERMINATED"
  | "RESIGNED"
  | "INACTIVE"
  | "ON_HOLD";
  dateOfJoining: string;
  dateOfExit: string | null;
  probationPeriodMonths?: number | null;
  probationStartDate?: string | null;
  probationEndDate?: string | null;
  probationReminderSentAt?: string | null;
  probationExtensionDetails?: {
    extensionDays: number;
    extendedFrom: string | null;
    extendedTo: string;
    remarks: string | null;
    extendedAt: string;
  } | null;
  noticeStartDate?: string | null;
  lastWorkingDate?: string | null;
  noticeDays?: number | null;
  onboarding?: EmployeeOnboarding;
  offboardingChecklist?: {
    assetReturn: boolean;
    accessRevoked: boolean;
    exitInterview: boolean;
    finalSettlement: boolean;
    completedAt: string | null;
  } | null;
  email: string;
  role: Role;
  isActive: number;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactEmail?: string | null;
  emergencyContacts?: {
    name?: string | null;
    phone?: string | null;
    relationship?: string | null;
    email?: string | null;
  }[];
  medicalConditions?: string | null;
  bloodGroup?: string | null;
  insurancePolicyNumber?: string | null;
  employeeAadhaar?: string | null;
  employeePan?: string | null;
  employeeTan?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankBranch?: string | null;
  investmentDeclarations?: Record<string, unknown>;
  signature?: string | null;
  education?: {
    qualification: string;
    institution: string;
    specialization?: string | null;
    startYear?: number | null;
    endYear?: number | null;
    grade?: string | null;
  }[];
  certifications?: {
    name: string;
    issuingOrganization?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    credentialId?: string | null;
  }[];
  workHistory?: {
    companyName: string;
    designation?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    responsibilities?: string | null;
  }[];
  skills?: {
    name: string;
    category?: string | null;
    competencyLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  }[];
  shiftId?: string | null;
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
  pendingDays?: number;
  name: string;
  colorHex: string;
  defaultDaysPerYear?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
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
  status:
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";
  approverId: string | null;
  decisionNote: string | null;
  appliedAt: string;
  decidedAt: string | null;
  expiresAt?: string | null;
  expiredAt?: string | null;
  firstName: string;
  lastName: string;
  employeeCode: string;
  avatarUrl: string | null;
}

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "HALF_DAY"
  | "WORK_FROM_HOME"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKEND"
  | "LATE"
  | "EARLY_DEPARTURE";

export interface AttendanceBreak {
  start: string;
  end: string | null;
  durationMinutes: number;
}

export type AttendanceAuditAction =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "REGULARIZATION_REQUESTED"
  | "REGULARIZATION_APPROVED"
  | "REGULARIZATION_REJECTED"
  | "STATUS_CHANGED"
  | "BREAK_RECORDED"
  | "OVERTIME_CREDITED"
  | "COMP_OFF_CREDITED";

export interface AttendanceAuditEntry {
  action: AttendanceAuditAction;
  actorId: string;
  actorRole: Role;
  at: string;
  note: string | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkInAccuracy: number | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracy: number | null;
  breaks: AttendanceBreak[];
  status: AttendanceStatus;
  workHours: number | null;
  effectiveWorkHours: number | null;
  breakMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeHours: number;
  earlyDepartureReason: string | null;
  overtimeReason: string | null;
  isRegularized: boolean;
  compOffCredited: boolean;
  note: string | null;
  auditTrail: AttendanceAuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type AttendanceCheckInPayload = AttendanceLocation;

export interface AttendanceCheckOutPayload extends AttendanceLocation {
  earlyDepartureReason?: string;
}

export type AttendanceRegularizationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type AttendanceRegularizationRequestedStatus =
  | "PRESENT"
  | "ABSENT"
  | "HALF_DAY"
  | "WORK_FROM_HOME"
  | "ON_LEAVE";

export interface AttendanceRegularizationRequest {
  id: string;
  employeeId: string;
  attendanceId: string | null;
  date: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  requestedStatus: AttendanceRegularizationRequestedStatus;
  reason: string;
  status: AttendanceRegularizationStatus;
  approverId: string | null;
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  approvedCheckIn?: string | null;
  approvedCheckOut?: string | null;
  approvedStatus?: AttendanceRegularizationRequestedStatus | null;
  auditTrail?: AttendanceAuditEntry[];
  firstName?: string | null;
  lastName?: string | null;
  employeeCode?: string | null;
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
  accessTokenExpiresAt?: string | null;
  viewedAt?: string | null;
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
  extractedExperience?:
  | number
  | null
  | {
    company: string | null;
    position: string | null;
    startDate: string | null;
    endDate: string | null;
    description: string;
  }[];
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
  recordingUrl?: string | null;

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
  ratingScale?: number[];
  ratingWeights?: { self: number; manager: number };
  competencies?: { name: string; weight: number }[];
  selfReviewDueDate?: string | null;
  managerReviewDueDate?: string | null;
  finalReviewDueDate?: string | null;
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
  calibratedRating?: number | null;
  calibrationComments?: string | null;
  calibratedBy?: string | null;
  calibratedAt?: string | null;
  revieweeFirstName: string;
  revieweeLastName: string;
  revieweeAvatar: string | null;
  revieweeDesignation: string;
  revieweeDepartment: string;
  reviewerFirstName: string;
  reviewerLastName: string;
}

export interface PerformanceMilestone {
  title: string;
  targetDate: string | null;
  completed: boolean;
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
  milestones: PerformanceMilestone[];
  assignedBy: string | null;

  /**
   * Populated by the goal-cascade endpoint.
   * Normal goal-list responses may omit this field.
   */
  children?: Goal[];
}

/**
 * Recursive goal hierarchy returned by the goal-cascade API.
 * A company/department goal can contain child goals through `children`.
 */
export interface GoalCascadeNode extends Goal {
  children: GoalCascadeNode[];
}

/**
 * Payload used when changing the completion state of a milestone.
 */
export interface UpdateGoalMilestonePayload {
  milestoneIndex: number;
  completed: boolean;
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
  ctc: number;
  basicPercentage: number;
  hraPercentage: number;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  performanceBonus: number;
  advanceRecovery: number;
  overtimeRate: number;
  pf: number;
  professionalTax: number;
  incomeTax: number;
  taxRegime: "NEW" | "OLD";
  taxYear: number;
  taxOtherIncome: number;
  taxHraExemption: number;
  taxDeduction80C: number;
  taxDeduction80D: number;
  taxDeduction80CCD1B: number;
  taxDeduction80TTA: number;
  taxPreviousTds: number;
  effectiveFrom: string;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  status:
  | "DRAFT"
  | "ATTENDANCE_LOCKED"
  | "PROCESSED"
  | "HR_REVIEW"
  | "APPROVED"
  | "PAID";
  processedAt: string | null;
  attendanceLockedAt: string | null;
  attendanceLockedDepartmentIds: string[];
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  paidAt: string | null;
  paidByUserId: string | null;
  payslipsSentAt: string | null;
  payslipsSentByUserId: string | null;
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
  performanceBonus: number;
  overtimeHours: number;
  overtimeAmount: number;
  grossEarnings: number;
  pf: number;
  professionalTax: number;
  incomeTax: number;
  taxRegime: "NEW" | "OLD";
  taxYear: number;
  taxableIncome: number;
  annualTax: number;
  esi: number;
  lop: number;
  advanceRecovery: number;
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

export interface PayslipExplanation {
  payslipId: string;
  employeeName: string;
  month: number;
  year: number;
  summary: string;
  primaryChangeReason: string;
  keyHighlights: string[];
  deltas: {
    hasPriorMonth: boolean;
    priorMonth?: number;
    priorYear?: number;
    grossDelta: number;
    netDelta: number;
    deductionsDelta: number;
    lopDelta: number;
  };
  componentBreakdown: Array<{
    component: string;
    category: "EARNING" | "DEDUCTION" | "TAX" | "ATTENDANCE";
    amount: number;
    explanation: string;
  }>;
  faqAnswers: Record<string, string>;
  source: "llm" | "deterministic";
}

export interface PayrollReadinessItem {
  id: string;
  category: "STRUCTURE" | "BANKING" | "ATTENDANCE" | "LEAVE";
  severity: "BLOCKER" | "WARNING" | "INFO";
  title: string;
  description: string;
  employeeName?: string;
  employeeCode?: string;
}

export interface PayrollReadinessResult {
  month: number;
  year: number;
  score: number;
  status: "READY" | "ATTENTION" | "BLOCKED";
  totalEmployees: number;
  readyEmployees: number;
  blockersCount: number;
  warningsCount: number;
  aiSummary: string;
  recommendations: string[];
  items: PayrollReadinessItem[];
}

export type PayrollAnomalySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type PayrollAnomalyCategory =
  | "SALARY_VARIANCE"
  | "DUPLICATE_ACCOUNT"
  | "GHOST_EMPLOYEE"
  | "NEGATIVE_PAY"
  | "ATTENDANCE_MISMATCH"
  | "STATUTORY_COMPLIANCE"
  | "MACRO_VARIANCE";

export interface PayrollAnomalyItem {
  id: string;
  category: PayrollAnomalyCategory;
  severity: PayrollAnomalySeverity;
  title: string;
  description: string;
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  department?: string;
  currentValue?: number | string;
  expectedValue?: number | string;
  financialExposure?: number;
  recommendation: string;
}

export interface PayrollAuditResult {
  runId: string;
  month: number;
  year: number;
  status: string;
  healthScore: number;
  totalEmployees: number;
  anomaliesCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalFinancialExposure: number;
  discrepancyRate: number;
  aiSummary: string;
  recommendations: string[];
  anomalies: PayrollAnomalyItem[];
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
  status?: "ACTIVE" | "EXPIRED";
  expiresAt?: string | null;
  expiredAt?: string | null;
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

export type AnnouncementStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "EXPIRED";

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
  expiryDays?: number;
  expiresAt?: string | null;
  expiredAt?: string | null;

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

/* =========================================================
   PAYROLL READINESS VALIDATION
========================================================= */

export interface AffectedEmployeeItem {
  id: string;
  name: string;
  code?: string;
}

export interface PayrollReadinessItem {
  id: string;
  category: "STRUCTURE" | "BANKING" | "ATTENDANCE" | "LEAVE";
  severity: "BLOCKER" | "WARNING" | "INFO";
  title: string;
  description: string;
  count?: number;
  affectedEmployees?: AffectedEmployeeItem[];
  employeeName?: string;
  employeeCode?: string;
}

export interface PayrollReadinessResult {
  month: number;
  year: number;
  score: number;
  status: "READY" | "ATTENTION" | "BLOCKED";
  totalEmployees: number;
  readyEmployees: number;
  blockersCount: number;
  warningsCount: number;
  aiSummary: string;
  recommendations: string[];
  items: PayrollReadinessItem[];
}

/* =========================================================
   AI EXECUTIVE BRIEFING
========================================================= */

export interface BriefingConcern {
  area: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  metric?: string;
  department?: string;
}

export interface BriefingRecommendation {
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: "TALENT" | "ATTENDANCE" | "OPERATIONS" | "COST" | "COMPLIANCE";
  action: string;
  expectedImpact: string;
}

export interface DepartmentPulse {
  department: string;
  headcount: number;
  health: "HEALTHY" | "WATCH" | "AT_RISK" | "STABLE";
  keyIndicator: string;
}

export interface ExecutiveBriefingResult {
  headline: string;
  healthScore: number;
  periodLabel: string;
  executiveSummary: string;
  keyHighlights: string[];
  criticalConcerns: BriefingConcern[];
  strategicRecommendations: BriefingRecommendation[];
  departmentPulse: DepartmentPulse[];
  metricSnapshots: {
    totalHeadcount: number;
    attritionRatePercent: number;
    attendanceRatePercent: number;
    openTicketsCount: number;
    monthlyPayrollCost: number;
    avgReviewRating: number;
  };
  source: "llm" | "deterministic";
  generatedAt: string;
}

export type HrDomain =
  | "ATTENDANCE"
  | "WORKFORCE"
  | "PAYROLL"
  | "TICKETS"
  | "LEAVE"
  | "RECRUITMENT"
  | "PERFORMANCE"
  | "GENERAL";

export interface AskHrResult {
  question: string;
  answerText: string;
  keyMetric?: {
    label: string;
    value: string | number;
    subtext?: string;
  };
  domain: HrDomain;
  table?: {
    columns: string[];
    rows: (string | number)[][];
  };
  chartData?: {
    label: string;
    value: number;
  }[];
  actionLink?: {
    label: string;
    url: string;
    description?: string;
  };
  suggestedFollowUps: string[];
  source: "llm" | "rule";
}

export type DatasetType =
  | "WORKFORCE"
  | "ATTENDANCE"
  | "PAYROLL"
  | "LEAVE"
  | "TICKETS";

export interface DatasetColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "badge";
  defaultSelected: boolean;
}

export interface AiCustomReportKpi {
  id: string;
  label: string;
  value: string | number;
  subtext?: string;
  status?: "neutral" | "good" | "warning" | "danger";
}

export interface GroupedSummaryItem {
  groupKey: string;
  groupLabel: string;
  count: number;
  metrics: Record<string, string | number>;
}

export interface AiCustomReportResult {
  reportId: string;
  dataset: DatasetType;
  title: string;
  subtitle: string;
  theme: string;
  executiveSummary: string;
  keyFindings: string[];
  kpiCards: AiCustomReportKpi[];
  columns: DatasetColumnDef[];
  selectedColumns: string[];
  rows: Record<string, any>[];
  totalRecords: number;
  availableGroupings: { key: string; label: string }[];
  activeGroupBy?: string;
  groupedSummary?: GroupedSummaryItem[];
  chart?: {
    title: string;
    type: "bar" | "line";
    dataKey: string;
    data: { label: string; value: number }[];
  };
  recommendations: {
    priority: "HIGH" | "MEDIUM" | "LOW";
    action: string;
    impact: string;
  }[];
  generatedAt: string;
  source: "llm" | "deterministic";
}

export interface AiCustomReportPayload {
  dataset?: DatasetType;
  selectedColumns?: string[];
  groupBy?: string;
  chartType?: "bar" | "line" | "none";
  prompt?: string;
  templateId?: string;
  dateFrom?: string;
  dateTo?: string;
  departmentId?: string;
}

export type RiskLevel = "CRITICAL" | "ELEVATED" | "MODERATE" | "STABLE";

export interface RiskDimensionBreakdown {
  score: number;
  level: RiskLevel;
  primarySignal: string;
}

export interface EmployeeRiskProfile {
  employeeId: string;
  employeeCode: string;
  name: string;
  email: string;
  departmentId: string;
  departmentName: string;
  designation: string;
  tenureMonths: number;
  flightRiskScore: number;
  riskLevel: RiskLevel;
  estimatedReplacementCostINR: number;
  dimensions: {
    compensation: RiskDimensionBreakdown;
    burnout: RiskDimensionBreakdown;
    leaveDisengagement: RiskDimensionBreakdown;
    grievanceSentiment: RiskDimensionBreakdown;
  };
  dominantFactors: string[];
  suggestedAction: string;
}

export interface DepartmentVulnerability {
  departmentId: string;
  departmentName: string;
  headcount: number;
  avgRiskScore: number;
  vulnerabilityLevel: RiskLevel;
  criticalCount: number;
  elevatedCount: number;
  topRiskDriver: string;
}

export interface RetentionPlaybook {
  priority: "HIGH" | "MEDIUM" | "LOW";
  targetScope: string;
  diagnosis: string;
  recommendedAction: string;
  stayInterviewQuestions: string[];
  expectedImpact: string;
}

export interface RetentionRadarResult {
  orgRiskIndex: number;
  orgRiskLevel: RiskLevel;
  totalAuditedEmployees: number;
  criticalRiskCount: number;
  elevatedRiskCount: number;
  moderateRiskCount: number;
  stableCount: number;
  totalReplacementExposureINR: number;
  dominantOrgRiskDriver: string;
  executiveSummary: string;
  keyVulnerabilityFindings: string[];
  departmentVulnerabilities: DepartmentVulnerability[];
  employeeRoster: EmployeeRiskProfile[];
  managerPlaybooks: RetentionPlaybook[];
  source: "llm" | "deterministic";
  generatedAt: string;
}
