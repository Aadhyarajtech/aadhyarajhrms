import { Schema, model } from "mongoose";
import { genId } from "@/utils/id";

const baseOptions = {
  versionKey: false as const,
  _id: false as const,
};

function idField(prefix: string) {
  return {
    type: String,
    default: () => genId(prefix),
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export interface UserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  role:
    | "SUPER_ADMIN"
    | "HR_ADMIN"
    | "MANAGER"
    | "RECRUITER"
    | "FINANCE"
    | "EMPLOYEE";
  isActive: boolean;
  mustResetPwd: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: idField("usr"),
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "MANAGER",
        "RECRUITER",
        "FINANCE",
        "EMPLOYEE",
      ],
      default: "EMPLOYEE",
    },
    isActive: { type: Boolean, default: true },
    mustResetPwd: { type: Boolean, default: false },
    lastLoginAt: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseOptions,
);

export const User = model<UserDoc>("User", userSchema);

// ---------------------------------------------------------------------------
// Departments & designations
// ---------------------------------------------------------------------------
export interface DepartmentDoc {
  _id: string;
  name: string;
  code: string;
  description: string | null;
  colorHex: string;
  headId: string | null;
  createdAt: string;
}

const departmentSchema = new Schema<DepartmentDoc>(
  {
    _id: idField("dept"),
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    description: { type: String, default: null },
    colorHex: { type: String, default: "#5B4FE5" },
    headId: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  baseOptions,
);

export const Department = model<DepartmentDoc>(
  "Department",
  departmentSchema,
);

export interface DesignationDoc {
  _id: string;
  title: string;
  level: number;
  departmentId: string;
}

const designationSchema = new Schema<DesignationDoc>(
  {
    _id: idField("desg"),
    title: { type: String, required: true },
    level: { type: Number, required: true, default: 1 },
    departmentId: { type: String, required: true },
  },
  baseOptions,
);

designationSchema.index(
  { title: 1, departmentId: 1 },
  { unique: true },
);

export const Designation = model<DesignationDoc>(
  "Designation",
  designationSchema,
);

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------
export interface EmployeeDoc {
  _id: string;
  employeeCode: string;
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  gender: string | null;
  maritalStatus: string | null;
  dateOfBirth: string | null;
  personalEmail: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  departmentId: string;
  designationId: string;
  managerId: string | null;
  employmentType:
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT"
    | "INTERN";
  status:
    | "ACTIVE"
    | "ON_LEAVE"
    | "NOTICE_PERIOD"
    | "TERMINATED"
    | "RESIGNED";
  dateOfJoining: string;
  dateOfExit: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactEmail: string | null;
  employeeAadhaar: string | null;
  employeePan: string | null;
  createdAt: string;
  updatedAt: string;
}

const employeeSchema = new Schema<EmployeeDoc>(
  {
    _id: idField("emp"),
    employeeCode: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    gender: { type: String, default: null },
    maritalStatus: {
      type: String,
      enum: [
        "SINGLE",
        "MARRIED",
        "DIVORCED",
        "WIDOWED",
        "NOT_LISTED",
      ],
      default: null,
    },
    dateOfBirth: { type: String, default: null },
    personalEmail: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: "India" },
    departmentId: { type: String, required: true },
    designationId: { type: String, required: true },
    managerId: { type: String, default: null },
    employmentType: {
      type: String,
      enum: [
        "FULL_TIME",
        "PART_TIME",
        "CONTRACT",
        "INTERN",
      ],
      default: "FULL_TIME",
    },
    status: {
      type: String,
      enum: [
        "ACTIVE",
        "ON_LEAVE",
        "NOTICE_PERIOD",
        "TERMINATED",
        "RESIGNED",
      ],
      default: "ACTIVE",
    },
    dateOfJoining: { type: String, required: true },
    dateOfExit: { type: String, default: null },
    emergencyContactName: { type: String, default: null },
    emergencyContactPhone: { type: String, default: null },
    emergencyContactRelationship: {
      type: String,
      default: null,
    },
    emergencyContactEmail: {
      type: String,
      default: null,
    },
    employeeAadhaar: { type: String, default: null },
    employeePan: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseOptions,
);

employeeSchema.index({ departmentId: 1 });
employeeSchema.index({ managerId: 1 });

export const Employee = model<EmployeeDoc>(
  "Employee",
  employeeSchema,
);

// ---------------------------------------------------------------------------
// Attendance & holidays
// ---------------------------------------------------------------------------
export interface AttendanceDoc {
  _id: string;
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
  createdAt: string;
}

const attendanceSchema = new Schema<AttendanceDoc>(
  {
    _id: idField("att"),
    employeeId: { type: String, required: true },
    date: { type: String, required: true },
    checkIn: { type: String, default: null },
    checkOut: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "PRESENT",
        "ABSENT",
        "HALF_DAY",
        "WORK_FROM_HOME",
        "ON_LEAVE",
        "HOLIDAY",
        "WEEKEND",
      ],
      default: "PRESENT",
    },
    workHours: { type: Number, default: null },
    isRegularized: { type: Boolean, default: false },
    note: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  baseOptions,
);

attendanceSchema.index(
  { employeeId: 1, date: 1 },
  { unique: true },
);

attendanceSchema.index({ date: 1 });

export const Attendance = model<AttendanceDoc>(
  "Attendance",
  attendanceSchema,
);

export interface HolidayDoc {
  _id: string;
  name: string;
  date: string;
  isOptional: boolean;
}

const holidaySchema = new Schema<HolidayDoc>(
  {
    _id: idField("hol"),
    name: { type: String, required: true },
    date: { type: String, required: true, unique: true },
    isOptional: { type: Boolean, default: false },
  },
  baseOptions,
);

export const Holiday = model<HolidayDoc>(
  "Holiday",
  holidaySchema,
);

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------
export interface LeaveTypeDoc {
  _id: string;
  name: string;
  colorHex: string;
  defaultDaysPerYear: number;
  isPaid: boolean;
  requiresApproval: boolean;
}

const leaveTypeSchema = new Schema<LeaveTypeDoc>(
  {
    _id: idField("ltyp"),
    name: { type: String, required: true, unique: true },
    colorHex: { type: String, default: "#5B4FE5" },
    defaultDaysPerYear: { type: Number, default: 12 },
    isPaid: { type: Boolean, default: true },
    requiresApproval: { type: Boolean, default: true },
  },
  baseOptions,
);

export const LeaveType = model<LeaveTypeDoc>(
  "LeaveType",
  leaveTypeSchema,
);

export interface LeaveBalanceDoc {
  _id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allotted: number;
  used: number;
  carriedOver: number;
}

const leaveBalanceSchema = new Schema<LeaveBalanceDoc>(
  {
    _id: idField("lbal"),
    employeeId: { type: String, required: true },
    leaveTypeId: { type: String, required: true },
    year: { type: Number, required: true },
    allotted: { type: Number, required: true },
    used: { type: Number, default: 0 },
    carriedOver: { type: Number, default: 0 },
  },
  baseOptions,
);

leaveBalanceSchema.index(
  { employeeId: 1, leaveTypeId: 1, year: 1 },
  { unique: true },
);

export const LeaveBalance = model<LeaveBalanceDoc>(
  "LeaveBalance",
  leaveBalanceSchema,
);

export interface LeaveRequestDoc {
  _id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED";
  approverId: string | null;
  decisionNote: string | null;
  appliedAt: string;
  decidedAt: string | null;
}

const leaveRequestSchema = new Schema<LeaveRequestDoc>(
  {
    _id: idField("lreq"),
    employeeId: { type: String, required: true },
    leaveTypeId: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    totalDays: { type: Number, required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
      ],
      default: "PENDING",
    },
    approverId: { type: String, default: null },
    decisionNote: { type: String, default: null },
    appliedAt: { type: String, required: true },
    decidedAt: { type: String, default: null },
  },
  baseOptions,
);

leaveRequestSchema.index({ employeeId: 1 });
leaveRequestSchema.index({ status: 1 });

export const LeaveRequest = model<LeaveRequestDoc>(
  "LeaveRequest",
  leaveRequestSchema,
);

// ===========================================================================
// RECRUITMENT
// ===========================================================================

export interface ApprovalStepDoc {
  approverId: string;
  level: number;
  status:
    | "PENDING"
    | "APPROVED"
    | "REJECTED";
  actedAt: string | null;
  comment: string | null;
}

export interface JobPostingDoc {
  _id: string;

  title: string;

  departmentId: string;

  designationId: string;

  location: string;

  employmentType:
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT"
    | "INTERN";

  experienceMin: number;

  experienceMax: number;

  description: string;

  status:
    | "OPEN"
    | "ON_HOLD"
    | "CLOSED";

  openings: number;

  postedAt: string;

  requisitionStatus:
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED";

  headcount: number;

  budgetCtc: number | null;

  approvalLevelRequired: number;

  approvalSteps: ApprovalStepDoc[];

  postingChannels: string[];

  screeningQuestions: string[];

  hiringMode:
    | "STANDARD"
    | "WALK_IN"
    | "CAMPUS";

  skills: string[];

  requestedAt: string | null;

  approvedAt: string | null;

  approvedById: string | null;

  rejectionReason: string | null;
}

const jobPostingSchema = new Schema<JobPostingDoc>(
  {
    _id: idField("job"),

    title: {
      type: String,
      required: true,
    },

    departmentId: {
      type: String,
      required: true,
    },

    designationId: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      default: "Bengaluru, India",
    },

    employmentType: {
      type: String,
      enum: [
        "FULL_TIME",
        "PART_TIME",
        "CONTRACT",
        "INTERN",
      ],
      default: "FULL_TIME",
    },

    experienceMin: {
      type: Number,
      default: 0,
    },

    experienceMax: {
      type: Number,
      default: 5,
    },

    description: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "OPEN",
        "ON_HOLD",
        "CLOSED",
      ],
      default: "OPEN",
    },

    openings: {
      type: Number,
      default: 1,
    },

    postedAt: {
      type: String,
      required: true,
    },

    requisitionStatus: {
      type: String,
      enum: [
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
      ],
      default: "PENDING_APPROVAL",
    },

    headcount: {
      type: Number,
      default: 1,
    },

    budgetCtc: {
      type: Number,
      default: null,
    },

    approvalLevelRequired: {
      type: Number,
      default: 1,
    },

    approvalSteps: {
      type: [
        {
          approverId: {
            type: String,
            required: true,
          },

          level: {
            type: Number,
            required: true,
          },

          status: {
            type: String,
            enum: [
              "PENDING",
              "APPROVED",
              "REJECTED",
            ],
            default: "PENDING",
          },

          actedAt: {
            type: String,
            default: null,
          },

          comment: {
            type: String,
            default: null,
          },
        },
      ],
      default: [],
    },

    postingChannels: {
      type: [String],
      default: [],
    },

    screeningQuestions: {
      type: [String],
      default: [],
    },

    hiringMode: {
      type: String,
      enum: [
        "STANDARD",
        "WALK_IN",
        "CAMPUS",
      ],
      default: "STANDARD",
    },

    skills: {
      type: [String],
      default: [],
    },

    requestedAt: {
      type: String,
      default: null,
    },

    approvedAt: {
      type: String,
      default: null,
    },

    approvedById: {
      type: String,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
    },
  },
  baseOptions,
);

export const JobPosting = model<JobPostingDoc>(
  "JobPosting",
  jobPostingSchema,
);

export interface CandidateOfferDoc {
  status:
    | "NOT_GENERATED"
    | "NOT_SENT"
    | "SENT"
    | "ACCEPTED"
    | "DECLINED";

  offerUrl: string | null;

  annualCtc: number;

  basic: number;

  hra: number;

  specialAllowance: number;

  joiningDate: string;

  generatedAt: string | null;

  respondedAt: string | null;
}

export interface BackgroundVerificationDoc {
  status:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "VERIFIED"
    | "FAILED";

  provider: string | null;

  reference: string | null;

  notes: string | null;

  startedAt: string | null;

  completedAt: string | null;
}

export interface PreboardingDocumentDoc {
  type: string;

  url: string;

  uploadedAt: string;

  verified: boolean;
}

export interface PreboardingDoc {
  status:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "COMPLETED";

  completedAt: string | null;

  documents: PreboardingDocumentDoc[];
}

export interface CandidateDoc {
  _id: string;

  jobPostingId: string;

  firstName: string;

  lastName: string;

  email: string;

  phone: string | null;

  resumeUrl: string | null;

  resumeText: string | null;

  stage:
    | "APPLIED"
    | "SCREENING"
    | "INTERVIEW"
    | "OFFER"
    | "HIRED"
    | "REJECTED";

  rating: number | null;

  expectedCtc: number | null;

  source: string;

  referredById: string | null;

  appliedAt: string;

  notes: string | null;

  extractedSkills: string[];

  jobFitScore: number | null;

  screeningSummary: string | null;

  offer: CandidateOfferDoc | null;

  backgroundVerification:
    BackgroundVerificationDoc | null;

  preboarding: PreboardingDoc | null;

  hiredEmployeeId: string | null;
}

const candidateSchema = new Schema<CandidateDoc>(
  {
    _id: idField("cand"),

    jobPostingId: {
      type: String,
      required: true,
    },

    firstName: {
      type: String,
      required: true,
    },

    lastName: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      default: null,
    },

    resumeUrl: {
      type: String,
      default: null,
    },

    resumeText: {
      type: String,
      default: null,
    },

    stage: {
      type: String,
      enum: [
        "APPLIED",
        "SCREENING",
        "INTERVIEW",
        "OFFER",
        "HIRED",
        "REJECTED",
      ],
      default: "APPLIED",
    },

    rating: {
      type: Number,
      default: null,
    },

    expectedCtc: {
      type: Number,
      default: null,
    },

    source: {
      type: String,
      default: "Career Site",
    },

    referredById: {
      type: String,
      default: null,
    },

    appliedAt: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
      default: null,
    },

    extractedSkills: {
      type: [String],
      default: [],
    },

    jobFitScore: {
      type: Number,
      default: null,
    },

    screeningSummary: {
      type: String,
      default: null,
    },

    offer: {
      type: {
        status: {
          type: String,
          enum: [
            "NOT_GENERATED",
            "NOT_SENT",
            "SENT",
            "ACCEPTED",
            "DECLINED",
          ],
          default: "NOT_GENERATED",
        },

        offerUrl: {
          type: String,
          default: null,
        },

        annualCtc: {
          type: Number,
          default: 0,
        },

        basic: {
          type: Number,
          default: 0,
        },

        hra: {
          type: Number,
          default: 0,
        },

        specialAllowance: {
          type: Number,
          default: 0,
        },

        joiningDate: {
          type: String,
          default: "",
        },

        generatedAt: {
          type: String,
          default: null,
        },

        respondedAt: {
          type: String,
          default: null,
        },
      },

      default: null,
    },

    backgroundVerification: {
      type: {
        status: {
          type: String,
          enum: [
            "NOT_STARTED",
            "IN_PROGRESS",
            "VERIFIED",
            "FAILED",
          ],
          default: "NOT_STARTED",
        },

        provider: {
          type: String,
          default: null,
        },

        reference: {
          type: String,
          default: null,
        },

        notes: {
          type: String,
          default: null,
        },

        startedAt: {
          type: String,
          default: null,
        },

        completedAt: {
          type: String,
          default: null,
        },
      },

      default: null,
    },

    preboarding: {
      type: {
        status: {
          type: String,
          enum: [
            "NOT_STARTED",
            "IN_PROGRESS",
            "COMPLETED",
          ],
          default: "NOT_STARTED",
        },

        completedAt: {
          type: String,
          default: null,
        },

        documents: {
          type: [
            {
              type: {
                type: String,
                required: true,
              },

              url: {
                type: String,
                required: true,
              },

              uploadedAt: {
                type: String,
                required: true,
              },

              verified: {
                type: Boolean,
                default: false,
              },
            },
          ],

          default: [],
        },
      },

      default: null,
    },

    hiredEmployeeId: {
      type: String,
      default: null,
    },
  },
  baseOptions,
);

candidateSchema.index({ stage: 1 });

export const Candidate = model<CandidateDoc>(
  "Candidate",
  candidateSchema,
);

export interface InterviewDoc {
  _id: string;
  candidateId: string;
  interviewerId: string;
  scheduledAt: string;
  round: string;
  feedback: string | null;
  recommendation: string | null;
  completed: boolean;
}

const interviewSchema = new Schema<InterviewDoc>(
  {
    _id: idField("intv"),
    candidateId: { type: String, required: true },
    interviewerId: { type: String, required: true },
    scheduledAt: { type: String, required: true },
    round: { type: String, default: "Round 1" },
    feedback: { type: String, default: null },
    recommendation: { type: String, default: null },
    completed: { type: Boolean, default: false },
  },
  baseOptions,
);

export const Interview = model<InterviewDoc>(
  "Interview",
  interviewSchema,
);

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------
export interface PerformanceCycleDoc {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  type: "PROBATION" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL" | "THREE_SIXTY" | "PIP";
  purpose: string | null;
}

const performanceCycleSchema =
  new Schema<PerformanceCycleDoc>(
    {
      _id: idField("cyc"),
      name: { type: String, required: true },
      startDate: { type: String, required: true },
      endDate: { type: String, required: true },
      isActive: { type: Boolean, default: true },
      type: {
        type: String,
        enum: [
          "PROBATION",
          "QUARTERLY",
          "HALF_YEARLY",
          "ANNUAL",
          "THREE_SIXTY",
          "PIP",
        ],
        default: "ANNUAL",
      },
      purpose: { type: String, default: null },
    },
    baseOptions,
  );

export const PerformanceCycle =
  model<PerformanceCycleDoc>(
    "PerformanceCycle",
    performanceCycleSchema,
  );

export interface PerformanceReviewDoc {
  _id: string;
  cycleId: string;
  revieweeId: string;
  reviewerId: string;
  status:
    | "NOT_STARTED"
    | "SELF_REVIEW"
    | "MANAGER_REVIEW"
    | "COMPLETED";
  selfRating: number | null;
  managerRating: number | null;
  finalRating: number | null;
  strengths: string | null;
  improvements: string | null;
  managerComments: string | null;
  submittedAt: string | null;
}

const performanceReviewSchema =
  new Schema<PerformanceReviewDoc>(
    {
      _id: idField("rev"),
      cycleId: { type: String, required: true },
      revieweeId: { type: String, required: true },
      reviewerId: { type: String, required: true },
      status: {
        type: String,
        enum: [
          "NOT_STARTED",
          "SELF_REVIEW",
          "MANAGER_REVIEW",
          "COMPLETED",
        ],
        default: "NOT_STARTED",
      },
      selfRating: { type: Number, default: null },
      managerRating: { type: Number, default: null },
      finalRating: { type: Number, default: null },
      strengths: { type: String, default: null },
      improvements: { type: String, default: null },
      managerComments: { type: String, default: null },
      submittedAt: { type: String, default: null },
    },
    baseOptions,
  );

performanceReviewSchema.index(
  { cycleId: 1, revieweeId: 1 },
  { unique: true },
);

export const PerformanceReview =
  model<PerformanceReviewDoc>(
    "PerformanceReview",
    performanceReviewSchema,
  );

export interface GoalDoc {
  _id: string;
  employeeId: string;
  title: string;
  description: string | null;
  progress: number;
  status:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "AT_RISK"
    | "COMPLETED";
  dueDate: string;
  createdAt: string;
  cycleId: string | null;
  parentGoalId: string | null;
  category: string | null;
  targetValue: number | null;
  currentValue: number | null;
  milestones: { title: string; targetDate: string | null; completed: boolean }[];
  assignedBy: string | null;
}

const goalSchema = new Schema<GoalDoc>(
  {
    _id: idField("goal"),
    employeeId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    progress: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "AT_RISK",
        "COMPLETED",
      ],
      default: "NOT_STARTED",
    },
    dueDate: { type: String, required: true },
    createdAt: { type: String, required: true },
    cycleId: { type: String, default: null },
    parentGoalId: { type: String, default: null },
    category: { type: String, default: null },
    targetValue: { type: Number, default: null },
    currentValue: { type: Number, default: null },
    milestones: { type: [{ title: String, targetDate: { type: String, default: null }, completed: Boolean }], default: [] },
    assignedBy: { type: String, default: null },
  },
  baseOptions,
);

export const Goal = model<GoalDoc>(
  "Goal",
  goalSchema,
);

export interface PerformanceFeedbackDoc { _id: string; reviewId: string; reviewerEmployeeId: string; type: "PEER" | "SUBORDINATE"; competencyRatings: { competency: string; rating: number }[]; comments: string | null; submittedAt: string; }
const performanceFeedbackSchema = new Schema<PerformanceFeedbackDoc>({ _id: idField("pfb"), reviewId: { type: String, required: true }, reviewerEmployeeId: { type: String, required: true }, type: { type: String, enum: ["PEER", "SUBORDINATE"], required: true }, competencyRatings: { type: [{ competency: String, rating: Number }], default: [] }, comments: { type: String, default: null }, submittedAt: { type: String, required: true } }, baseOptions);
performanceFeedbackSchema.index({ reviewId: 1, reviewerEmployeeId: 1 }, { unique: true });
export const PerformanceFeedback = model<PerformanceFeedbackDoc>("PerformanceFeedback", performanceFeedbackSchema);

export interface PerformanceOutcomeDoc { _id: string; reviewId: string; incrementRecommendation: "MAXIMUM" | "STANDARD" | "NONE" | "PIP"; promotionEligible: boolean; trainingNeeds: string[]; pipRecommended: boolean; fastTrackEligible: boolean; createdAt: string; }
const performanceOutcomeSchema = new Schema<PerformanceOutcomeDoc>({ _id: idField("pout"), reviewId: { type: String, required: true, unique: true }, incrementRecommendation: { type: String, enum: ["MAXIMUM", "STANDARD", "NONE", "PIP"], required: true }, promotionEligible: { type: Boolean, default: false }, trainingNeeds: { type: [String], default: [] }, pipRecommended: { type: Boolean, default: false }, fastTrackEligible: { type: Boolean, default: false }, createdAt: { type: String, required: true } }, baseOptions);
export const PerformanceOutcome = model<PerformanceOutcomeDoc>("PerformanceOutcome", performanceOutcomeSchema);

export interface PerformanceImprovementPlanDoc { _id: string; reviewId: string; employeeId: string; status: "ACTIVE" | "COMPLETED" | "CANCELLED"; startDate: string; endDate: string; objectives: string[]; checkInFrequency: "MONTHLY"; createdAt: string; }
const performanceImprovementPlanSchema = new Schema<PerformanceImprovementPlanDoc>({ _id: idField("pip"), reviewId: { type: String, required: true, unique: true }, employeeId: { type: String, required: true }, status: { type: String, enum: ["ACTIVE", "COMPLETED", "CANCELLED"], default: "ACTIVE" }, startDate: { type: String, required: true }, endDate: { type: String, required: true }, objectives: { type: [String], default: [] }, checkInFrequency: { type: String, enum: ["MONTHLY"], default: "MONTHLY" }, createdAt: { type: String, required: true } }, baseOptions);
export const PerformanceImprovementPlan = model<PerformanceImprovementPlanDoc>("PerformanceImprovementPlan", performanceImprovementPlanSchema);

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------
export interface SalaryStructureDoc {
  _id: string;
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

const salaryStructureSchema =
  new Schema<SalaryStructureDoc>(
    {
      _id: idField("sal"),
      employeeId: {
        type: String,
        required: true,
        unique: true,
      },
      basic: { type: Number, required: true },
      hra: { type: Number, required: true },
      conveyance: { type: Number, required: true },
      medical: { type: Number, required: true },
      specialAllowance: {
        type: Number,
        required: true,
      },
      pf: { type: Number, required: true },
      professionalTax: {
        type: Number,
        required: true,
      },
      incomeTax: {
        type: Number,
        required: true,
      },
      effectiveFrom: {
        type: String,
        required: true,
      },
    },
    baseOptions,
  );

export const SalaryStructure =
  model<SalaryStructureDoc>(
    "SalaryStructure",
    salaryStructureSchema,
  );

export interface PayrollRunDoc {
  _id: string;
  month: number;
  year: number;
  status: "DRAFT" | "PROCESSED" | "PAID";
  processedAt: string | null;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  headcount: number;
}

const payrollRunSchema =
  new Schema<PayrollRunDoc>(
    {
      _id: idField("prun"),
      month: { type: Number, required: true },
      year: { type: Number, required: true },
      status: {
        type: String,
        enum: ["DRAFT", "PROCESSED", "PAID"],
        default: "DRAFT",
      },
      processedAt: { type: String, default: null },
      totalGross: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 },
      totalNet: { type: Number, default: 0 },
      headcount: { type: Number, default: 0 },
    },
    baseOptions,
  );

payrollRunSchema.index(
  { month: 1, year: 1 },
  { unique: true },
);

export const PayrollRun =
  model<PayrollRunDoc>(
    "PayrollRun",
    payrollRunSchema,
  );

export interface PayslipDoc {
  _id: string;
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
}

const payslipSchema = new Schema<PayslipDoc>(
  {
    _id: idField("pay"),
    payrollRunId: { type: String, required: true },
    employeeId: { type: String, required: true },
    basic: { type: Number, required: true },
    hra: { type: Number, required: true },
    conveyance: { type: Number, required: true },
    medical: { type: Number, required: true },
    specialAllowance: {
      type: Number,
      required: true,
    },
    grossEarnings: {
      type: Number,
      required: true,
    },
    pf: { type: Number, required: true },
    professionalTax: {
      type: Number,
      required: true,
    },
    incomeTax: {
      type: Number,
      required: true,
    },
    lop: { type: Number, default: 0 },
    totalDeductions: {
      type: Number,
      required: true,
    },
    netPay: {
      type: Number,
      required: true,
    },
    daysPayable: {
      type: Number,
      required: true,
    },
    daysInMonth: {
      type: Number,
      required: true,
    },
  },
  baseOptions,
);

payslipSchema.index(
  { payrollRunId: 1, employeeId: 1 },
  { unique: true },
);

export const Payslip = model<PayslipDoc>(
  "Payslip",
  payslipSchema,
);

export type PayslipRequestPeriod =
  | "3_MONTHS"
  | "6_MONTHS"
  | "12_MONTHS";

export type PayslipRequestStatus =
  | "PENDING"
  | "SENT"
  | "REJECTED";

export interface PayslipRequestDoc {
  _id: string;
  employeeId: string;
  requestedByUserId: string;
  period: PayslipRequestPeriod;
  status: PayslipRequestStatus;
  payslipIds: string[];
  processedByUserId: string | null;
  requestedAt: string;
  completedAt: string | null;
}

const payslipRequestSchema =
  new Schema<PayslipRequestDoc>(
    {
      _id: idField("preq"),
      employeeId: {
        type: String,
        required: true,
      },
      requestedByUserId: {
        type: String,
        required: true,
      },
      period: {
        type: String,
        enum: [
          "3_MONTHS",
          "6_MONTHS",
          "12_MONTHS",
        ],
        required: true,
      },
      status: {
        type: String,
        enum: [
          "PENDING",
          "SENT",
          "REJECTED",
        ],
        default: "PENDING",
      },
      payslipIds: {
        type: [String],
        default: [],
      },
      processedByUserId: {
        type: String,
        default: null,
      },
      requestedAt: {
        type: String,
        required: true,
      },
      completedAt: {
        type: String,
        default: null,
      },
    },
    baseOptions,
  );

payslipRequestSchema.index({
  employeeId: 1,
  requestedAt: -1,
});

payslipRequestSchema.index({
  status: 1,
});

export const PayslipRequest =
  model<PayslipRequestDoc>(
    "PayslipRequest",
    payslipRequestSchema,
  );

// ---------------------------------------------------------------------------
// Announcements & notifications
// ---------------------------------------------------------------------------

// Announcement data is owned by:
//   modules/announcements/announcement.model.ts
//
// AnnouncementReceipt remains here because it is part of the existing
// notification/read-state infrastructure and is used by the announcements
// repository for read/acknowledgement tracking.

// ---------------------------------------------------------------------------
// Announcement receipts
// ---------------------------------------------------------------------------

export interface AnnouncementReceiptDoc {
  _id: string;
  announcementId: string;
  userId: string;
  isRead: boolean;
  isAcknowledged: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const announcementReceiptSchema =
  new Schema<AnnouncementReceiptDoc>(
    {
      _id: idField("anr"),

      announcementId: {
        type: String,
        required: true,
        index: true,
      },

      userId: {
        type: String,
        required: true,
        index: true,
      },

      isRead: {
        type: Boolean,
        default: false,
      },

      isAcknowledged: {
        type: Boolean,
        default: false,
      },

      readAt: {
        type: String,
        default: null,
      },

      acknowledgedAt: {
        type: String,
        default: null,
      },

      createdAt: {
        type: String,
        required: true,
      },

      updatedAt: {
        type: String,
        required: true,
      },
    },
    baseOptions,
  );

announcementReceiptSchema.index(
  { announcementId: 1, userId: 1 },
  { unique: true },
);

export const AnnouncementReceipt =
  model<AnnouncementReceiptDoc>(
    "AnnouncementReceipt",
    announcementReceiptSchema,
  );

export type NotificationType =
  | "LEAVE_REQUEST"
  | "LEAVE_DECISION"
  | "ANNOUNCEMENT"
  | "PAYROLL"
  | "PERFORMANCE"
  | "RECRUITMENT"
  | "TICKET_MESSAGE"
  | "SYSTEM"
  | "DOCUMENT_REQUESTED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_READY";

export interface NotificationDoc {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

const notificationSchema =
  new Schema<NotificationDoc>(
    {
      _id: idField("ntf"),

      userId: {
        type: String,
        required: true,
      },

      type: {
        type: String,
        enum: [
          "LEAVE_REQUEST",
          "LEAVE_DECISION",
          "ANNOUNCEMENT",
          "PAYROLL",
          "PERFORMANCE",
          "RECRUITMENT",
          "TICKET_MESSAGE",
          "SYSTEM",
          "DOCUMENT_REQUESTED",
          "DOCUMENT_UPLOADED",
          "DOCUMENT_READY",
        ],
        default: "SYSTEM",
      },

      title: {
        type: String,
        required: true,
      },

      message: {
        type: String,
        required: true,
      },

      isRead: {
        type: Boolean,
        default: false,
      },

      link: {
        type: String,
        default: null,
      },

      createdAt: {
        type: String,
        required: true,
      },
    },
    baseOptions,
  );

notificationSchema.index({
  userId: 1,
  isRead: 1,
});

export const Notification =
  model<NotificationDoc>(
    "Notification",
    notificationSchema,
  );

// ---------------------------------------------------------------------------
// Documents & assets
// ---------------------------------------------------------------------------

export type DocumentStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

// Employee-provided document types plus company-issued document types.
export type DocumentRecordType =
  | "OFFER_LETTER"
  | "ID_PROOF"
  | "ADDRESS_PROOF"
  | "EDUCATIONAL"
  | "CONTRACT"
  | "APPOINTMENT_LETTER"
  | "EXPERIENCE_LETTER"
  | "RELIEVING_LETTER"
  | "SALARY_CERTIFICATE"
  | "EMPLOYMENT_CERTIFICATE"
  | "OTHER";

export interface DocumentRecordDoc {
  _id: string;
  employeeId: string;
  type: DocumentRecordType;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  status: DocumentStatus;
  uploadedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  requestId: string | null;
}

const documentSchema =
  new Schema<DocumentRecordDoc>(
    {
      _id: idField("doc"),
      employeeId: {
        type: String,
        required: true,
      },
      type: {
        type: String,
        enum: [
          "OFFER_LETTER",
          "ID_PROOF",
          "ADDRESS_PROOF",
          "EDUCATIONAL",
          "CONTRACT",
          "APPOINTMENT_LETTER",
          "EXPERIENCE_LETTER",
          "RELIEVING_LETTER",
          "SALARY_CERTIFICATE",
          "EMPLOYMENT_CERTIFICATE",
          "OTHER",
        ],
        default: "OTHER",
      },
      fileName: {
        type: String,
        required: true,
      },
      fileUrl: {
        type: String,
        required: true,
      },
      uploadedAt: {
        type: String,
        required: true,
      },
      status: {
        type: String,
        enum: [
          "PENDING",
          "VERIFIED",
          "REJECTED",
        ],
        default: "PENDING",
      },
      uploadedBy: {
        type: String,
        default: null,
      },
      reviewedBy: {
        type: String,
        default: null,
      },
      reviewedAt: {
        type: String,
        default: null,
      },
      rejectionReason: {
        type: String,
        default: null,
      },
      requestId: {
        type: String,
        default: null,
      },
    },
    baseOptions,
  );

documentSchema.index({ requestId: 1 });

export const DocumentRecord =
  model<DocumentRecordDoc>(
    "DocumentRecord",
    documentSchema,
    "documents",
  );

// ---------------------------------------------------------------------------
// Document requests (both directions)
// ---------------------------------------------------------------------------

export type DocumentRequestDirection =
  | "COMPANY_TO_EMPLOYEE"
  | "EMPLOYEE_TO_COMPANY";

export type DocumentRequestStatus =
  | "PENDING"
  | "UPLOADED"
  | "REJECTED";

export interface DocumentRequestDoc {
  _id: string;
  employeeId: string;
  direction: DocumentRequestDirection;
  type: DocumentRecordType;
  note: string | null;
  status: DocumentRequestStatus;
  requestedByUserId: string;
  processedByUserId: string | null;
  documentId: string | null;
  requestedAt: string;
  completedAt: string | null;
}

const documentRequestSchema =
  new Schema<DocumentRequestDoc>(
    {
      _id: idField("dreq"),
      employeeId: {
        type: String,
        required: true,
      },
      direction: {
        type: String,
        enum: [
          "COMPANY_TO_EMPLOYEE",
          "EMPLOYEE_TO_COMPANY",
        ],
        required: true,
      },
      type: {
        type: String,
        enum: [
          "OFFER_LETTER",
          "ID_PROOF",
          "ADDRESS_PROOF",
          "EDUCATIONAL",
          "CONTRACT",
          "APPOINTMENT_LETTER",
          "EXPERIENCE_LETTER",
          "RELIEVING_LETTER",
          "SALARY_CERTIFICATE",
          "EMPLOYMENT_CERTIFICATE",
          "OTHER",
        ],
        required: true,
      },
      note: {
        type: String,
        default: null,
      },
      status: {
        type: String,
        enum: [
          "PENDING",
          "UPLOADED",
          "REJECTED",
        ],
        default: "PENDING",
      },
      requestedByUserId: {
        type: String,
        required: true,
      },
      processedByUserId: {
        type: String,
        default: null,
      },
      documentId: {
        type: String,
        default: null,
      },
      requestedAt: {
        type: String,
        required: true,
      },
      completedAt: {
        type: String,
        default: null,
      },
    },
    baseOptions,
  );

documentRequestSchema.index({
  employeeId: 1,
  requestedAt: -1,
});

documentRequestSchema.index({
  direction: 1,
  status: 1,
});

export const DocumentRequest =
  model<DocumentRequestDoc>(
    "DocumentRequest",
    documentRequestSchema,
  );

export interface AssetDoc {
  _id: string;
  employeeId: string;
  assetTag: string;
  category: string;
  name: string;
  assignedAt: string;
  returnedAt: string | null;
  status:
    | "ASSIGNED"
    | "RETURNED"
    | "DAMAGED"
    | "LOST";
}

const assetSchema = new Schema<AssetDoc>(
  {
    _id: idField("ast"),
    employeeId: {
      type: String,
      required: true,
    },
    assetTag: {
      type: String,
      required: true,
      unique: true,
    },
    category: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    assignedAt: {
      type: String,
      required: true,
    },
    returnedAt: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "ASSIGNED",
        "RETURNED",
        "DAMAGED",
        "LOST",
      ],
      default: "ASSIGNED",
    },
  },
  baseOptions,
);

export const Asset = model<AssetDoc>(
  "Asset",
  assetSchema,
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export interface AuditLogDoc {
  _id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    _id: idField("aud"),
    userId: { type: String, default: null },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: null },
    metadata: { type: String, default: null },
    ipAddress: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  baseOptions,
);

auditLogSchema.index({
  entity: 1,
  entityId: 1,
});

export const AuditLog = model<AuditLogDoc>(
  "AuditLog",
  auditLogSchema,
);

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export interface TicketDoc {
  _id: string;
  ticketId: string;
  employeeId: string;

  category:
    | "HR"
    | "Payroll"
    | "Leave"
    | "Attendance"
    | "Recruitment"
    | "Employee Referral"
    | "IT Support";

  priority:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  subject: string;
  description: string;

  attachment: string | null;

  assignedTo: string;

  status:
    | "OPEN"
    | "IN_PROGRESS"
    | "WAITING_FOR_EMPLOYEE"
    | "RESOLVED"
    | "CLOSED";

  createdAt: string;
  updatedAt: string;
}

const ticketSchema = new Schema<TicketDoc>(
  {
    _id: idField("tkt"),

    ticketId: {
      type: String,
      required: true,
      unique: true,
    },

    employeeId: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      enum: [
        "HR",
        "Payroll",
        "Leave",
        "Attendance",
        "Recruitment",
        "Employee Referral",
        "IT Support",
      ],
      required: true,
    },

    priority: {
      type: String,
      enum: [
        "LOW",
        "MEDIUM",
        "HIGH",
      ],
      default: "MEDIUM",
    },

    subject: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    attachment: {
      type: String,
      default: null,
    },

    assignedTo: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "OPEN",
        "IN_PROGRESS",
        "WAITING_FOR_EMPLOYEE",
        "RESOLVED",
        "CLOSED",
      ],
      default: "OPEN",
    },

    createdAt: {
      type: String,
      required: true,
    },

    updatedAt: {
      type: String,
      required: true,
    },
  },
  baseOptions,
);

ticketSchema.index({
  employeeId: 1,
});

ticketSchema.index({
  assignedTo: 1,
});

ticketSchema.index({
  status: 1,
});

export const Ticket = model<TicketDoc>(
  "Ticket",
  ticketSchema,
);