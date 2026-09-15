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

// ===========================================================================
// USERS
// ===========================================================================

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
    | "IT_SUPPORT"
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

    passwordHash: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "MANAGER",
        "RECRUITER",
        "FINANCE",
        "IT_SUPPORT",
        "EMPLOYEE",
      ],
      default: "EMPLOYEE",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    mustResetPwd: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
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

export const User = model<UserDoc>("User", userSchema);

// ===========================================================================
// DEPARTMENTS & DESIGNATIONS
// ===========================================================================

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

    name: {
      type: String,
      required: true,
      unique: true,
    },

    code: {
      type: String,
      required: true,
      unique: true,
    },

    description: {
      type: String,
      default: null,
    },

    colorHex: {
      type: String,
      default: "#5B4FE5",
    },

    headId: {
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

export const Department = model<DepartmentDoc>("Department", departmentSchema);

export interface DesignationDoc {
  _id: string;
  title: string;
  level: number;
  departmentId: string;
}

const designationSchema = new Schema<DesignationDoc>(
  {
    _id: idField("desg"),

    title: {
      type: String,
      required: true,
    },

    level: {
      type: Number,
      required: true,
      default: 1,
    },

    departmentId: {
      type: String,
      required: true,
    },
  },
  baseOptions,
);

designationSchema.index(
  {
    title: 1,
    departmentId: 1,
  },
  {
    unique: true,
  },
);

export const Designation = model<DesignationDoc>(
  "Designation",
  designationSchema,
);

// ===========================================================================
// EMPLOYEES
// ===========================================================================

export interface EmployeeEducation {
  qualification?: string;
  institution?: string;
  specialization?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  grade?: string | null;
  // Canonical aliases retained for compatibility with existing records.
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface EmployeeCertification {
  name?: string;
  issuingOrganization?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  credentialId?: string | null;
  credentialUrl?: string | null;
}

export interface EmployeeWorkHistory {
  companyName?: string;
  designation?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  responsibilities?: string | null;
  // Canonical aliases retained for compatibility with existing records.
  company?: string;
  position?: string;
  description?: string;
}

export type EmployeeSkillCompetency =
  | "BEGINNER"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "EXPERT";

export interface EmployeeSkill {
  name: string;
  category: string | null;
  competencyLevel: EmployeeSkillCompetency;
}

export interface EmployeeEmergencyContact {
  name: string | null;
  phone: string | null;
  relationship: string | null;
  email: string | null;
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

export interface EmployeeSensitiveChangeRequest {
  _id: string;
  fields: string[];
  changes: Record<string, unknown>;
  requestedBy: string;
  requestedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
}

export interface EmployeeOffboardingItem {
  item?: string;
  title?: string;
  description?: string;
  completed?: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
}

export interface EmployeeDoc {
  _id: string;
  employeeCode: string;
  userId: string;

  firstName: string;
  lastName: string;

  avatarUrl: string | null;
  signature: string | null;
  gender: string | null;
  maritalStatus: string | null;
  dateOfBirth: string | null;

  personalEmail: string | null;
  phone: string | null;

  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  workLocation: string | null;
  grade: string | null;

  departmentId: string;
  designationId: string;
  managerId: string | null;
  shiftId: string | null;

  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";

  status:
    | "ONBOARDING"
    | "ACTIVE"
    | "ON_PROBATION"
    | "ON_LEAVE"
    | "NOTICE_PERIOD"
    | "TERMINATED"
    | "RESIGNED"
    | "INACTIVE"
    | "ON_HOLD";

  dateOfJoining: string;
  dateOfExit: string | null;

  probationPeriodMonths: number | null;
  probationStartDate: string | null;
  probationEndDate: string | null;
  probationReminderSentAt: string | null;
  probationExtensionDetails: {
    extensionDays: number;
    extendedFrom: string | null;
    extendedTo: string;
    remarks: string | null;
    extendedAt: string;
  } | null;

  noticeStartDate: string | null;
  lastWorkingDate: string | null;
  noticeDays: number | null;

  resignationDetails: {
    resignationDate: string;
    resignationReason: string;
    employeeRemarks: string | null;
    hrRemarks: string | null;
  } | null;

  terminationDetails: {
    terminationDate: string;
    terminationReason: string;
    employeeRemarks: string | null;
    hrRemarks: string | null;
  } | null;

  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactEmail: string | null;
  emergencyContacts: EmployeeEmergencyContact[];

  medicalConditions: string | null;
  bloodGroup: string | null;
  insurancePolicyNumber: string | null;

  employeeAadhaar: string | null;
  employeePan: string | null;
  employeeTan: string | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  bankBranch: string | null;
  investmentDeclarations: Record<string, unknown>;

  education: EmployeeEducation[];
  certifications: EmployeeCertification[];
  workHistory: EmployeeWorkHistory[];
  skills: EmployeeSkill[];

  onboarding: EmployeeOnboarding;
  sensitiveChangeRequests: EmployeeSensitiveChangeRequest[];

  isArchived: boolean;
  archivedAt: string | null;
  offboardingChecklist: {
    assetReturn: boolean;
    accessRevoked: boolean;
    exitInterview: boolean;
    finalSettlement: boolean;
    completedAt: string | null;
  } | null;

  createdAt: string;
  updatedAt: string;
}

const employeeEducationSchema = new Schema<EmployeeEducation>(
  {
    qualification: { type: String, default: undefined },
    institution: { type: String, default: undefined },
    specialization: { type: String, default: null },
    startYear: { type: Number, default: null },
    endYear: { type: Number, default: null },
    grade: { type: String, default: null },
    degree: { type: String, default: undefined },
    fieldOfStudy: { type: String, default: undefined },
    startDate: { type: String, default: undefined },
    endDate: { type: String, default: undefined },
    description: { type: String, default: undefined },
  },
  { _id: false },
);

const employeeCertificationSchema = new Schema<EmployeeCertification>(
  {
    name: { type: String, default: undefined },
    issuingOrganization: { type: String, default: null },
    issueDate: { type: String, default: null },
    expiryDate: { type: String, default: null },
    credentialId: { type: String, default: null },
    credentialUrl: { type: String, default: null },
  },
  { _id: false },
);

const employeeWorkHistorySchema = new Schema<EmployeeWorkHistory>(
  {
    companyName: { type: String, default: undefined },
    designation: { type: String, default: null },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    responsibilities: { type: String, default: null },
    company: { type: String, default: undefined },
    position: { type: String, default: undefined },
    description: { type: String, default: undefined },
  },
  { _id: false },
);

const employeeSkillSchema = new Schema<EmployeeSkill>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: null, trim: true },
    competencyLevel: {
      type: String,
      enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"],
      default: "BEGINNER",
    },
  },
  { _id: false },
);

const employeeEmergencyContactSchema = new Schema<EmployeeEmergencyContact>(
  {
    name: { type: String, default: null },
    phone: { type: String, default: null },
    relationship: { type: String, default: null },
    email: { type: String, default: null },
  },
  { _id: false },
);

const employeeOnboardingStageSchema = new Schema<EmployeeOnboardingStage>(
  {
    stage: { type: Number, required: true, min: 1, max: 8 },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED"],
      default: "PENDING",
    },
    completedAt: { type: String, default: null },
    completedBy: { type: String, default: null },
    remarks: { type: String, default: null },
  },
  { _id: false },
);

const employeeOnboardingSchema = new Schema<EmployeeOnboarding>(
  {
    currentStage: { type: Number, min: 1, max: 8, default: 1 },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
      default: "NOT_STARTED",
    },
    stages: {
      type: [employeeOnboardingStageSchema] as any,
      default: () => [
        { stage: 1, name: "HR Creates Employee Account in System" },
        { stage: 2, name: "Personal & Professional Details Entry" },
        { stage: 3, name: "Document Upload & Verification" },
        { stage: 4, name: "Department & Role Assignment" },
        { stage: 5, name: "Payroll Structure Configuration" },
        { stage: 6, name: "System Login Credentials Issued" },
        { stage: 7, name: "Employee Orientation & Policy Briefing" },
        {
          stage: 8,
          name: "Profile Activated — Employee Successfully Onboarded",
        },
      ],
    },
    startedAt: { type: String, default: null },
    completedAt: { type: String, default: null },
  },
  { _id: false },
);

const employeeSensitiveChangeRequestSchema =
  new Schema<EmployeeSensitiveChangeRequest>(
    {
      _id: idField("ecr"),
      fields: { type: [String], default: [] },
      changes: { type: Schema.Types.Mixed, default: {} },
      requestedBy: { type: String, required: true },
      requestedAt: { type: String, required: true },
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
        default: "PENDING",
      },
      reviewedBy: { type: String, default: null },
      reviewedAt: { type: String, default: null },
      reviewComment: { type: String, default: null },
    },
    { _id: false },
  );

const employeeOffboardingItemSchema = new Schema<EmployeeOffboardingItem>(
  {
    item: { type: String, default: undefined },
    title: { type: String, default: undefined },
    description: { type: String, default: undefined },
    completed: { type: Boolean, default: false },
    completedAt: { type: String, default: null },
    completedBy: { type: String, default: null },
  },
  { _id: false },
);

const employeeSchema = new Schema<EmployeeDoc>(
  {
    _id: idField("emp"),
    employeeCode: { type: String, required: true, unique: true, trim: true },
    userId: { type: String, required: true, unique: true },

    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    avatarUrl: { type: String, default: null },
    signature: { type: String, default: null },
    gender: { type: String, default: null },
    maritalStatus: {
      type: String,
      enum: ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "NOT_LISTED"],
      default: null,
    },
    dateOfBirth: { type: String, default: null },

    personalEmail: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },

    address: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: "India" },
    workLocation: { type: String, default: null },
    grade: { type: String, default: null },

    departmentId: { type: String, required: true },
    designationId: { type: String, required: true },
    managerId: { type: String, default: null },
    shiftId: { type: String, default: null },

    employmentType: {
      type: String,
      enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"],
      default: "FULL_TIME",
    },

    status: {
      type: String,
      enum: [
        "ONBOARDING",
        "ACTIVE",
        "ON_PROBATION",
        "ON_LEAVE",
        "NOTICE_PERIOD",
        "TERMINATED",
        "RESIGNED",
        "INACTIVE",
        "ON_HOLD",
      ],
      default: "ACTIVE",
    },

    dateOfJoining: { type: String, required: true },
    dateOfExit: { type: String, default: null },

    probationPeriodMonths: { type: Number, default: null, min: 0 },
    probationStartDate: { type: String, default: null },
    probationEndDate: { type: String, default: null },
    probationReminderSentAt: { type: String, default: null },

    probationExtensionDetails: {
      extensionDays: { type: Number, default: null, min: 1 },
      extendedFrom: { type: String, default: null },
      extendedTo: { type: String, default: null },
      remarks: { type: String, default: null },
      extendedAt: { type: String, default: null },
    },

    noticeStartDate: { type: String, default: null },
    lastWorkingDate: { type: String, default: null },
    noticeDays: { type: Number, default: null, min: 0 },

    resignationDetails: {
      resignationDate: { type: String, default: null },
      resignationReason: { type: String, default: null },
      employeeRemarks: { type: String, default: null },
      hrRemarks: { type: String, default: null },
    },

    terminationDetails: {
      terminationDate: { type: String, default: null },
      terminationReason: { type: String, default: null },
      employeeRemarks: { type: String, default: null },
      hrRemarks: { type: String, default: null },
    },

    emergencyContactName: { type: String, default: null },
    emergencyContactPhone: { type: String, default: null },
    emergencyContactRelationship: { type: String, default: null },
    emergencyContactEmail: { type: String, default: null },
    emergencyContacts: {
      type: [employeeEmergencyContactSchema],
      default: [],
    },

    medicalConditions: { type: String, default: null },
    bloodGroup: { type: String, default: null },
    insurancePolicyNumber: { type: String, default: null },

    employeeAadhaar: { type: String, default: null },
    employeePan: { type: String, default: null },
    employeeTan: { type: String, default: null },
    bankAccountNumber: { type: String, default: null },
    bankIfscCode: { type: String, default: null, uppercase: true, trim: true },
    bankBranch: { type: String, default: null },
    investmentDeclarations: {
      type: Schema.Types.Mixed,
      default: {},
    },

    education: { type: [employeeEducationSchema], default: [] },
    certifications: { type: [employeeCertificationSchema], default: [] },
    workHistory: { type: [employeeWorkHistorySchema], default: [] },
    skills: { type: [employeeSkillSchema], default: [] },

    onboarding: {
      type: employeeOnboardingSchema,
      default: () => ({}),
    },
    sensitiveChangeRequests: {
      type: [employeeSensitiveChangeRequestSchema],
      default: [],
    },

    isArchived: { type: Boolean, default: false },
    archivedAt: { type: String, default: null },

    offboardingChecklist: {
      assetReturn: { type: Boolean, default: false },
      accessRevoked: { type: Boolean, default: false },
      exitInterview: { type: Boolean, default: false },
      finalSettlement: { type: Boolean, default: false },
      completedAt: { type: String, default: null },
    },

    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseOptions,
);

employeeSchema.index({ departmentId: 1 });
employeeSchema.index({ managerId: 1 });
employeeSchema.index({ isArchived: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ workLocation: 1 });
employeeSchema.index({ grade: 1 });
employeeSchema.index({ "onboarding.status": 1 });
employeeSchema.index({ "sensitiveChangeRequests.status": 1 });

export const Employee = model<EmployeeDoc>("Employee", employeeSchema);

// ===========================================================================
// ATTENDANCE & HOLIDAYS
// ===========================================================================

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

export interface AttendanceBreakDoc {
  start: string;
  end: string | null;
  durationMinutes: number;
}

export interface AttendanceAuditEntry {
  action:
    | "CHECK_IN"
    | "CHECK_OUT"
    | "REGULARIZATION_REQUESTED"
    | "REGULARIZATION_APPROVED"
    | "REGULARIZATION_REJECTED"
    | "STATUS_CHANGED"
    | "BREAK_RECORDED"
    | "OVERTIME_CREDITED"
    | "COMP_OFF_CREDITED";
  actorId: string;
  actorRole: UserDoc["role"];
  at: string;
  note: string | null;
}

export interface AttendanceDoc {
  _id: string;
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

  breaks: AttendanceBreakDoc[];
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

const attendanceBreakSchema = new Schema<AttendanceBreakDoc>(
  {
    start: { type: String, required: true },
    end: { type: String, default: null },
    durationMinutes: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const attendanceAuditEntrySchema = new Schema<AttendanceAuditEntry>(
  {
    action: { type: String, required: true },
    actorId: { type: String, required: true },
    actorRole: {
      type: String,
      enum: [
        "SUPER_ADMIN",
        "HR_ADMIN",
        "MANAGER",
        "RECRUITER",
        "FINANCE",
        "EMPLOYEE",
      ],
      required: true,
    },
    at: { type: String, required: true },
    note: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const attendanceSchema = new Schema<AttendanceDoc>(
  {
    _id: idField("att"),
    employeeId: { type: String, required: true },
    date: { type: String, required: true },
    shiftId: { type: String, default: null },

    checkIn: { type: String, default: null },
    checkOut: { type: String, default: null },

    checkInLatitude: { type: Number, default: null, min: -90, max: 90 },
    checkInLongitude: { type: Number, default: null, min: -180, max: 180 },
    checkInAccuracy: { type: Number, default: null, min: 0 },
    checkOutLatitude: { type: Number, default: null, min: -90, max: 90 },
    checkOutLongitude: { type: Number, default: null, min: -180, max: 180 },
    checkOutAccuracy: { type: Number, default: null, min: 0 },

    breaks: { type: [attendanceBreakSchema], default: [] },

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
        "LATE",
        "EARLY_DEPARTURE",
      ],
      default: "PRESENT",
    },

    workHours: { type: Number, default: null, min: 0 },
    effectiveWorkHours: { type: Number, default: null, min: 0 },
    breakMinutes: { type: Number, default: 0, min: 0 },
    lateMinutes: { type: Number, default: 0, min: 0 },
    earlyDepartureMinutes: { type: Number, default: 0, min: 0 },
    overtimeHours: { type: Number, default: 0, min: 0 },
    earlyDepartureReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    overtimeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },

    isRegularized: { type: Boolean, default: false },
    compOffCredited: { type: Boolean, default: false },
    note: { type: String, default: null, trim: true, maxlength: 2000 },
    auditTrail: { type: [attendanceAuditEntrySchema], default: [] },

    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseOptions,
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1, date: 1 });
attendanceSchema.index({ employeeId: 1, status: 1, date: -1 });
attendanceSchema.index({ shiftId: 1, date: -1 });

export const Attendance = model<AttendanceDoc>("Attendance", attendanceSchema);

export type AttendanceRegularizationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type AttendanceRegularizationAuditAction =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export interface AttendanceRegularizationAuditEntry {
  action: AttendanceRegularizationAuditAction;
  actorId: string;
  actorRole: UserDoc["role"];
  at: string;
  note: string | null;
}

export interface AttendanceRegularizationRequestDoc {
  _id: string;
  employeeId: string;
  attendanceId: string | null;
  date: string;

  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  requestedStatus:
    | "PRESENT"
    | "ABSENT"
    | "HALF_DAY"
    | "WORK_FROM_HOME"
    | "ON_LEAVE";

  reason: string;
  status: AttendanceRegularizationStatus;

  approverId: string | null;
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  approvedCheckIn: string | null;
  approvedCheckOut: string | null;
  approvedStatus: AttendanceRegularizationRequestDoc["requestedStatus"] | null;
  auditTrail: AttendanceRegularizationAuditEntry[];
}

const attendanceRegularizationAuditSchema =
  new Schema<AttendanceRegularizationAuditEntry>(
    {
      action: { type: String, required: true },
      actorId: { type: String, required: true },
      actorRole: {
        type: String,
        enum: [
          "SUPER_ADMIN",
          "HR_ADMIN",
          "MANAGER",
          "RECRUITER",
          "FINANCE",
          "EMPLOYEE",
        ],
        required: true,
      },
      at: { type: String, required: true },
      note: { type: String, default: null, trim: true, maxlength: 1000 },
    },
    { _id: false },
  );

const attendanceRegularizationRequestSchema =
  new Schema<AttendanceRegularizationRequestDoc>(
    {
      _id: idField("areg"),
      employeeId: { type: String, required: true },
      attendanceId: { type: String, default: null },
      date: { type: String, required: true },
      requestedCheckIn: { type: String, default: null },
      requestedCheckOut: { type: String, default: null },
      requestedStatus: {
        type: String,
        enum: ["PRESENT", "ABSENT", "HALF_DAY", "WORK_FROM_HOME", "ON_LEAVE"],
        required: true,
      },
      reason: { type: String, required: true, trim: true, maxlength: 1000 },
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
        default: "PENDING",
      },
      approverId: { type: String, default: null },
      decisionNote: {
        type: String,
        default: null,
        trim: true,
        maxlength: 1000,
      },
      requestedAt: { type: String, required: true },
      decidedAt: { type: String, default: null },
      approvedCheckIn: { type: String, default: null },
      approvedCheckOut: { type: String, default: null },
      approvedStatus: { type: String, default: null },
      auditTrail: { type: [attendanceRegularizationAuditSchema], default: [] },
    },
    baseOptions,
  );

attendanceRegularizationRequestSchema.index({ employeeId: 1, date: 1 });
attendanceRegularizationRequestSchema.index({ status: 1, requestedAt: -1 });
attendanceRegularizationRequestSchema.index({ employeeId: 1, status: 1 });

export const AttendanceRegularizationRequest =
  model<AttendanceRegularizationRequestDoc>(
    "AttendanceRegularizationRequest",
    attendanceRegularizationRequestSchema,
  );

export interface AttendanceGeofence {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface AttendanceShiftDoc {
  _id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  standardHours: number;
  graceMinutes: number;
  halfDayHours: number;
  breakMinutes: number;
  overtimeAfterHours: number;
  departmentId: string | null;
  employeeIds: string[];
  geofence: AttendanceGeofence | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const attendanceGeofenceSchema = new Schema<AttendanceGeofence>(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    radiusMeters: { type: Number, required: true, min: 1, max: 100000 },
  },
  { _id: false },
);

const attendanceShiftSchema = new Schema<AttendanceShiftDoc>(
  {
    _id: idField("shift"),
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    standardHours: { type: Number, required: true, min: 0 },
    graceMinutes: { type: Number, required: true, min: 0, default: 15 },
    halfDayHours: { type: Number, required: true, min: 0, default: 4 },
    breakMinutes: { type: Number, required: true, min: 0, default: 60 },
    overtimeAfterHours: { type: Number, required: true, min: 0, default: 8 },
    departmentId: { type: String, default: null },
    employeeIds: { type: [String], default: [] },
    geofence: { type: attendanceGeofenceSchema, default: null },
    isActive: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseOptions,
);

attendanceShiftSchema.index({ code: 1 }, { unique: true });
attendanceShiftSchema.index({ departmentId: 1, isActive: 1 });
attendanceShiftSchema.index({ employeeIds: 1 });

export const AttendanceShift = model<AttendanceShiftDoc>(
  "AttendanceShift",
  attendanceShiftSchema,
);

// Compatibility alias used by the attendance shift repository.
export const Shift = AttendanceShift;
export type ShiftDoc = AttendanceShiftDoc;

export interface CompOffDoc {
  _id: string;
  employeeId: string;
  attendanceId: string;
  earnedHours: number;
  earnedDate: string;
  expiresAt: string;
  usedHours: number;
  remainingHours: number;
  status: "AVAILABLE" | "PARTIALLY_USED" | "USED" | "EXPIRED";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  usedDate: string | null;
  useNote: string | null;
}

const compOffSchema = new Schema<CompOffDoc>(
  {
    _id: idField("coff"),
    employeeId: { type: String, required: true },
    attendanceId: { type: String, required: true, unique: true },
    earnedHours: { type: Number, required: true, min: 0 },
    earnedDate: { type: String, required: true },
    expiresAt: { type: String, required: true },
    usedHours: { type: Number, default: 0, min: 0 },
    remainingHours: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["AVAILABLE", "PARTIALLY_USED", "USED", "EXPIRED"],
      default: "AVAILABLE",
    },
    note: { type: String, default: null, trim: true, maxlength: 1000 },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    usedDate: { type: String, default: null },
    useNote: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  baseOptions,
);

compOffSchema.index({ employeeId: 1, status: 1, expiresAt: 1 });
compOffSchema.index({ employeeId: 1, earnedDate: -1 });

export const CompOff = model<CompOffDoc>("CompOff", compOffSchema);

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

export const Holiday = model<HolidayDoc>("Holiday", holidaySchema);

export interface CompOffCreditDoc {
  _id: string;
  employeeId: string;
  attendanceId: string | null;
  days: number;
  remainingDays: number;
  creditedAt: string;
  expiresAt: string;
  status: "ACTIVE" | "EXPIRED" | "USED";
  createdAt: string;
  updatedAt: string;
}

const compOffCreditSchema = new Schema<CompOffCreditDoc>(
  {
    _id: idField("coc"),
    employeeId: { type: String, required: true },
    attendanceId: { type: String, default: null },
    days: { type: Number, required: true, min: 0 },
    remainingDays: { type: Number, required: true, min: 0 },
    creditedAt: { type: String, required: true },
    expiresAt: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "USED"],
      default: "ACTIVE",
    },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseOptions,
);

compOffCreditSchema.index({ employeeId: 1, status: 1, expiresAt: 1 });
compOffCreditSchema.index({ attendanceId: 1 });

export const CompOffCredit = model<CompOffCreditDoc>(
  "CompOffCredit",
  compOffCreditSchema,
);

// ===========================================================================

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

    name: {
      type: String,
      required: true,
      unique: true,
    },

    colorHex: {
      type: String,
      default: "#5B4FE5",
    },

    defaultDaysPerYear: {
      type: Number,
      default: 12,
    },

    isPaid: {
      type: Boolean,
      default: true,
    },

    requiresApproval: {
      type: Boolean,
      default: true,
    },
  },
  baseOptions,
);

export const LeaveType = model<LeaveTypeDoc>("LeaveType", leaveTypeSchema);

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

    employeeId: {
      type: String,
      required: true,
    },

    leaveTypeId: {
      type: String,
      required: true,
    },

    year: {
      type: Number,
      required: true,
    },

    allotted: {
      type: Number,
      required: true,
    },

    used: {
      type: Number,
      default: 0,
    },

    carriedOver: {
      type: Number,
      default: 0,
    },
  },
  baseOptions,
);

leaveBalanceSchema.index(
  {
    employeeId: 1,
    leaveTypeId: 1,
    year: 1,
  },
  {
    unique: true,
  },
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

  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

  approverId: string | null;
  decisionNote: string | null;
  appliedAt: string;
  decidedAt: string | null;
}

const leaveRequestSchema = new Schema<LeaveRequestDoc>(
  {
    _id: idField("lreq"),

    employeeId: {
      type: String,
      required: true,
    },

    leaveTypeId: {
      type: String,
      required: true,
    },

    startDate: {
      type: String,
      required: true,
    },

    endDate: {
      type: String,
      required: true,
    },

    totalDays: {
      type: Number,
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
    },

    approverId: {
      type: String,
      default: null,
    },

    decisionNote: {
      type: String,
      default: null,
    },

    appliedAt: {
      type: String,
      required: true,
    },

    decidedAt: {
      type: String,
      default: null,
    },
  },
  baseOptions,
);

leaveRequestSchema.index({
  employeeId: 1,
});

leaveRequestSchema.index({
  status: 1,
});

export const LeaveRequest = model<LeaveRequestDoc>(
  "LeaveRequest",
  leaveRequestSchema,
);

// ===========================================================================
// RECRUITMENT
// ===========================================================================

export type RequisitionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type ApprovalStepStatus = "PENDING" | "APPROVED" | "REJECTED";

export type HiringMode = "STANDARD" | "WALK_IN" | "CAMPUS";

export type BudgetValidationStatus = "NOT_VALIDATED" | "VALID" | "EXCEEDED";

export type JobDescriptionTemplateCategory =
  | "ENGINEERING"
  | "DATA_AI"
  | "SALES"
  | "MARKETING"
  | "HR"
  | "FINANCE"
  | "OPERATIONS"
  | "CUSTOM";

export interface JobDescriptionTemplateDoc {
  _id: string;
  name: string;
  category: JobDescriptionTemplateCategory;
  description: string;
  content: string;
  skills: string[];
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

const jobDescriptionTemplateSchema = new Schema<JobDescriptionTemplateDoc>(
  {
    _id: idField("jd"),
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        "ENGINEERING",
        "DATA_AI",
        "SALES",
        "MARKETING",
        "HR",
        "FINANCE",
        "OPERATIONS",
        "CUSTOM",
      ],
      required: true,
    },
    description: { type: String, default: "" },
    content: { type: String, required: true },
    skills: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    createdById: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseOptions,
);

jobDescriptionTemplateSchema.index({ category: 1, isActive: 1 });
jobDescriptionTemplateSchema.index({ name: 1 }, { unique: true });

export const JobDescriptionTemplate = model<JobDescriptionTemplateDoc>(
  "JobDescriptionTemplate",
  jobDescriptionTemplateSchema,
);

export interface RecruitmentApprovalPolicyDoc {
  _id: string;
  name: string;
  minDesignationLevel: number;
  approvalLevels: number;
  budgetThresholdCtc: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const recruitmentApprovalPolicySchema =
  new Schema<RecruitmentApprovalPolicyDoc>(
    {
      _id: idField("rap"),
      name: { type: String, required: true, trim: true },
      minDesignationLevel: { type: Number, required: true, min: 1 },
      approvalLevels: { type: Number, required: true, min: 1, max: 10 },
      budgetThresholdCtc: { type: Number, default: null, min: 0 },
      isActive: { type: Boolean, default: true },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOptions,
  );

recruitmentApprovalPolicySchema.index({
  minDesignationLevel: 1,
  budgetThresholdCtc: 1,
  isActive: 1,
});

export const RecruitmentApprovalPolicy = model<RecruitmentApprovalPolicyDoc>(
  "RecruitmentApprovalPolicy",
  recruitmentApprovalPolicySchema,
);

export interface ApprovalStepDoc {
  approverId: string;
  level: number;
  status: ApprovalStepStatus;
  actedAt: string | null;
  comment: string | null;
}

export interface JobPostingDoc {
  _id: string;
  title: string;
  departmentId: string;
  designationId: string;
  location: string;

  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";

  experienceMin: number;
  experienceMax: number;
  description: string;

  shortlistingCriteria: {
    enabled: boolean;
    minimumJobFitScore: number;
    requiredSkills: string[];
    minimumExperience: number;
  };

  status: "OPEN" | "ON_HOLD" | "CLOSED";

  openings: number;
  postedAt: string;
  requestedAt: string;
  requestedById: string;

  requisitionStatus: RequisitionStatus;

  headcount: number;
  budgetCtc: number | null;
  budgetValidationStatus: BudgetValidationStatus;
  budgetValidatedAt: string | null;
  budgetValidatedById: string | null;
  budgetValidationNote: string | null;

  jdTemplateId: string | null;
  jdTemplateCategory: JobDescriptionTemplateCategory | null;

  approvalPolicyId: string | null;
  approvalLevelRequired: number;
  approvalSteps: ApprovalStepDoc[];

  approvedById: string | null;
  approvedAt: string | null;

  rejectionReason: string | null;

  postingChannels: string[];
  screeningQuestions: string[];

  // Public job posting / application configuration
  publishedAt: string | null;
  closedAt: string | null;

  hiringMode: HiringMode;

  skills: string[];
  walkInDrive: {
    driveDate: string | null;
    startTime: string | null;
    endTime: string | null;
    venue: string | null;
    coordinatorName: string | null;
    coordinatorContact: string | null;
    registrationDeadline: string | null;
    expectedCandidates: number | null;
  };

  campusDrive: {
    collegeName: string | null;
    campusLocation: string | null;
    driveDate: string | null;
    startTime: string | null;
    endTime: string | null;
    placementCoordinator: string | null;
    coordinatorContact: string | null;
    expectedCandidates: number | null;
  };
}

const approvalStepSchema = new Schema<ApprovalStepDoc>(
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
      enum: ["PENDING", "APPROVED", "REJECTED"],
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
  {
    _id: false,
  },
);

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
      enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"],
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

    shortlistingCriteria: {
      enabled: {
        type: Boolean,
        default: false,
      },
      minimumJobFitScore: {
        type: Number,
        default: 60,
        min: 0,
        max: 100,
      },
      requiredSkills: {
        type: [String],
        default: [],
      },
      minimumExperience: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    description: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["OPEN", "ON_HOLD", "CLOSED"],
      default: "ON_HOLD",
    },

    openings: {
      type: Number,
      default: 1,
    },

    postedAt: {
      type: String,
      required: true,
    },

    requestedAt: {
      type: String,
      required: true,
    },

    requestedById: {
      type: String,
      required: true,
    },

    requisitionStatus: {
      type: String,
      enum: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"],
      default: "PENDING_APPROVAL",
    },

    headcount: {
      type: Number,
      default: 1,
      min: 1,
    },

    budgetCtc: {
      type: Number,
      default: null,
      min: 0,
    },

    budgetValidationStatus: {
      type: String,
      enum: ["NOT_VALIDATED", "VALID", "EXCEEDED"],
      default: "NOT_VALIDATED",
    },

    budgetValidatedAt: {
      type: String,
      default: null,
    },

    budgetValidatedById: {
      type: String,
      default: null,
    },

    budgetValidationNote: {
      type: String,
      default: null,
    },

    jdTemplateId: {
      type: String,
      default: null,
    },

    jdTemplateCategory: {
      type: String,
      enum: [
        "ENGINEERING",
        "DATA_AI",
        "SALES",
        "MARKETING",
        "HR",
        "FINANCE",
        "OPERATIONS",
        "CUSTOM",
        null,
      ],
      default: null,
    },

    approvalPolicyId: {
      type: String,
      default: null,
    },

    approvalLevelRequired: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },

    approvalSteps: {
      type: [approvalStepSchema],
      default: [],
    },

    approvedById: {
      type: String,
      default: null,
    },

    approvedAt: {
      type: String,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    postingChannels: {
      type: [String],
      default: ["CAREERS"],
    },

    screeningQuestions: {
      type: [String],
      default: [],
    },

    publishedAt: {
      type: String,
      default: null,
    },

    closedAt: {
      type: String,
      default: null,
    },

    hiringMode: {
      type: String,
      enum: ["STANDARD", "WALK_IN", "CAMPUS"],
      default: "STANDARD",
    },

    walkInDrive: {
      driveDate: {
        type: String,
        default: null,
      },

      startTime: {
        type: String,
        default: null,
      },

      endTime: {
        type: String,
        default: null,
      },

      venue: {
        type: String,
        default: null,
      },

      coordinatorName: {
        type: String,
        default: null,
      },

      coordinatorContact: {
        type: String,
        default: null,
      },

      registrationDeadline: {
        type: String,
        default: null,
      },

      expectedCandidates: {
        type: Number,
        default: null,
        min: 0,
      },
    },

    campusDrive: {
      collegeName: {
        type: String,
        default: null,
      },

      campusLocation: {
        type: String,
        default: null,
      },

      driveDate: {
        type: String,
        default: null,
      },

      startTime: {
        type: String,
        default: null,
      },

      endTime: {
        type: String,
        default: null,
      },

      placementCoordinator: {
        type: String,
        default: null,
      },

      coordinatorContact: {
        type: String,
        default: null,
      },

      expectedCandidates: {
        type: Number,
        default: null,
        min: 0,
      },
    },

    skills: {
      type: [String],
      default: [],
    },
  },
  baseOptions,
);

export const JobPosting = model<JobPostingDoc>("JobPosting", jobPostingSchema);

export type ReferralBonusStatus =
  | "NOT_APPLICABLE"
  | "PENDING"
  | "APPROVED"
  | "PAID";

export type OfferStatus = "NOT_GENERATED" | "SENT" | "ACCEPTED" | "DECLINED";

export type BackgroundVerificationStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "VERIFIED"
  | "FAILED";

export type PreboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface OfferDoc {
  status: OfferStatus;
  offerUrl: string | null;
  annualCtc: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  joiningDate: string;
  generatedAt: string | null;
  respondedAt: string | null;
  accessTokenHash: string | null;
  accessTokenExpiresAt: string | null;
  viewedAt: string | null;
}

export interface BackgroundVerificationDoc {
  status: BackgroundVerificationStatus;
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
  status: PreboardingStatus;
  documents: PreboardingDocumentDoc[];
  completedAt: string | null;
}

export interface CandidateResumeExperience {
  company: string | null;
  position: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export interface CandidateResumeEducation {
  degree: string | null;
  institution: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  grade: string | null;
}

export type ResumeParsingStatus =
  | "NOT_PARSED"
  | "PARSING"
  | "PARSED"
  | "FAILED";

export interface CandidateDoc {
  _id: string;
  jobPostingId: string;

  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;

  resumeUrl: string | null;
  resumeText: string | null;

  // Automatic resume parsing
  resumeParsingStatus: ResumeParsingStatus;
  resumeParsingError: string | null;
  resumeParsedAt: string | null;
  extractedSkills: string[];
  extractedExperience: CandidateResumeExperience[];
  extractedEducation: CandidateResumeEducation[];

  jobFitScore: number | null;
  screeningSummary: string | null;

  autoShortlisted: boolean;

  shortlistingResult: "PENDING" | "SHORTLISTED" | "NOT_SHORTLISTED";

  finalResult: "PENDING" | "SELECTED" | "REJECTED";

  screeningRecommendation:
    | "PENDING"
    | "STRONG_FIT"
    | "GOOD_FIT"
    | "WEAK_FIT"
    | "NOT_RECOMMENDED";

  // Answers to role-specific application/screening questions.
  applicationAnswers: Record<string, string>;

  // Duplicate/spam protection
  duplicateStatus: "NOT_CHECKED" | "UNIQUE" | "DUPLICATE";
  duplicateOfCandidateId: string | null;
  spamFlag: boolean;
  spamReason: string | null;

  stage: "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED";

  rating: number | null;
  expectedCtc: number | null;

  source: string;
  referredById: string | null;

  referralBonusStatus: ReferralBonusStatus;

  appliedAt: string;
  notes: string | null;

  offer: OfferDoc;
  backgroundVerification: BackgroundVerificationDoc;
  preboarding: PreboardingDoc;

  hiredEmployeeId: string | null;
}

const offerSchema = new Schema<OfferDoc>(
  {
    status: {
      type: String,
      enum: ["NOT_GENERATED", "SENT", "ACCEPTED", "DECLINED"],
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

    accessTokenHash: {
      type: String,
      default: null,
    },

    accessTokenExpiresAt: {
      type: String,
      default: null,
    },

    viewedAt: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const backgroundVerificationSchema = new Schema<BackgroundVerificationDoc>(
  {
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "VERIFIED", "FAILED"],
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
  {
    _id: false,
  },
);

const preboardingDocumentSchema = new Schema<PreboardingDocumentDoc>(
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
  {
    _id: false,
  },
);

const preboardingSchema = new Schema<PreboardingDoc>(
  {
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
      default: "NOT_STARTED",
    },

    documents: {
      type: [preboardingDocumentSchema],
      default: [],
    },

    completedAt: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const candidateResumeExperienceSchema = new Schema<CandidateResumeExperience>(
  {
    company: { type: String, default: null },
    position: { type: String, default: null },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    description: { type: String, default: null },
  },
  { _id: false },
);

const candidateResumeEducationSchema = new Schema<CandidateResumeEducation>(
  {
    degree: { type: String, default: null },
    institution: { type: String, default: null },
    fieldOfStudy: { type: String, default: null },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    grade: { type: String, default: null },
  },
  { _id: false },
);

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
      lowercase: true,
      trim: true,
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

    resumeParsingStatus: {
      type: String,
      enum: ["NOT_PARSED", "PARSING", "PARSED", "FAILED"],
      default: "NOT_PARSED",
    },

    resumeParsingError: {
      type: String,
      default: null,
    },

    resumeParsedAt: {
      type: String,
      default: null,
    },

    extractedSkills: {
      type: [String],
      default: [],
    },

    extractedExperience: {
      type: [candidateResumeExperienceSchema],
      default: [],
    },

    extractedEducation: {
      type: [candidateResumeEducationSchema],
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
    autoShortlisted: {
      type: Boolean,
      default: false,
    },

    shortlistingResult: {
      type: String,
      enum: ["PENDING", "SHORTLISTED", "NOT_SHORTLISTED"],
      default: "PENDING",
    },

    screeningRecommendation: {
      type: String,
      enum: [
        "PENDING",
        "STRONG_FIT",
        "GOOD_FIT",
        "WEAK_FIT",
        "NOT_RECOMMENDED",
      ],
      default: "PENDING",
    },

    applicationAnswers: {
      type: Schema.Types.Mixed,
      default: {},
    },

    duplicateStatus: {
      type: String,
      enum: ["NOT_CHECKED", "UNIQUE", "DUPLICATE"],
      default: "NOT_CHECKED",
    },

    duplicateOfCandidateId: {
      type: String,
      default: null,
    },

    spamFlag: {
      type: Boolean,
      default: false,
    },

    spamReason: {
      type: String,
      default: null,
    },

    finalResult: {
      type: String,
      enum: ["PENDING", "SELECTED", "REJECTED"],
      default: "PENDING",
    },

    stage: {
      type: String,
      enum: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"],
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
      default: "CAREERS",
    },

    referredById: {
      type: String,
      default: null,
    },

    referralBonusStatus: {
      type: String,
      enum: ["NOT_APPLICABLE", "PENDING", "APPROVED", "PAID"],
      default: "NOT_APPLICABLE",
    },

    appliedAt: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
      default: null,
    },

    offer: {
      type: offerSchema,
      default: () => ({}),
    },

    backgroundVerification: {
      type: backgroundVerificationSchema,
      default: () => ({}),
    },

    preboarding: {
      type: preboardingSchema,
      default: () => ({}),
    },

    hiredEmployeeId: {
      type: String,
      default: null,
    },
  },
  baseOptions,
);

candidateSchema.index({
  stage: 1,
});

candidateSchema.index({
  duplicateStatus: 1,
});

candidateSchema.index({
  spamFlag: 1,
});

candidateSchema.index(
  {
    jobPostingId: 1,
    email: 1,
  },
  {
    unique: true,
  },
);

export const Candidate = model<CandidateDoc>("Candidate", candidateSchema);

// ===========================================================================
// INTERVIEWS
// ===========================================================================

export interface InterviewScorecardDoc {
  criterion: string;
  score: number;
  comment: string | null;
}

export interface InterviewDoc {
  _id: string;
  candidateId: string;
  interviewerId: string;
  scheduledAt: string;
  round: string;

  mode: "VIDEO" | "IN_PERSON" | "PHONE";

  meetingLink: string | null;
  recordingUrl: string | null;
  feedback: string | null;
  recommendation: string | null;

  scorecard: InterviewScorecardDoc[];

  completed: boolean;
}

const scorecardSchema = new Schema<InterviewScorecardDoc>(
  {
    criterion: {
      type: String,
      required: true,
    },

    score: {
      type: Number,
      required: true,
    },

    comment: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const interviewSchema = new Schema<InterviewDoc>(
  {
    _id: idField("intv"),

    candidateId: {
      type: String,
      required: true,
    },

    interviewerId: {
      type: String,
      required: true,
    },

    scheduledAt: {
      type: String,
      required: true,
    },

    round: {
      type: String,
      default: "Round 1",
    },

    mode: {
      type: String,
      enum: ["VIDEO", "IN_PERSON", "PHONE"],
      default: "VIDEO",
    },

    meetingLink: {
      type: String,
      default: null,
    },

    recordingUrl: {
      type: String,
      default: null,
    },

    feedback: {
      type: String,
      default: null,
    },

    recommendation: {
      type: String,
      default: null,
    },

    scorecard: {
      type: [scorecardSchema],
      default: [],
    },

    completed: {
      type: Boolean,
      default: false,
    },
  },
  baseOptions,
);

export const Interview = model<InterviewDoc>("Interview", interviewSchema);

// ===========================================================================
// PERFORMANCE
// ===========================================================================

export interface PerformanceCycleDoc {
  _id: string;
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

const performanceCycleSchema = new Schema<PerformanceCycleDoc>(
  {
    _id: idField("cyc"),
    name: {
      type: String,
      required: true,
    },
    startDate: {
      type: String,
      required: true,
    },
    endDate: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
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
    purpose: {
      type: String,
      default: null,
    },
  },
  baseOptions,
);

export const PerformanceCycle = model<PerformanceCycleDoc>(
  "PerformanceCycle",
  performanceCycleSchema,
);

export interface PerformanceReviewDoc {
  _id: string;
  cycleId: string;
  revieweeId: string;
  reviewerId: string;

  status: "NOT_STARTED" | "SELF_REVIEW" | "MANAGER_REVIEW" | "COMPLETED";

  selfRating: number | null;
  managerRating: number | null;
  managerTechnicalRating: number | null;
  managerDeliveryRating: number | null;
  managerBehaviorRating: number | null;
  finalRating: number | null;

  strengths: string | null;
  improvements: string | null;
  managerComments: string | null;

  submittedAt: string | null;
}

const performanceReviewSchema = new Schema<PerformanceReviewDoc>(
  {
    _id: idField("rev"),

    cycleId: {
      type: String,
      required: true,
    },

    revieweeId: {
      type: String,
      required: true,
    },

    reviewerId: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["NOT_STARTED", "SELF_REVIEW", "MANAGER_REVIEW", "COMPLETED"],
      default: "NOT_STARTED",
    },

    selfRating: {
      type: Number,
      default: null,
    },

    managerRating: {
      type: Number,
      default: null,
    },

    managerTechnicalRating: {
      type: Number,
      default: null,
    },

    managerDeliveryRating: {
      type: Number,
      default: null,
    },

    managerBehaviorRating: {
      type: Number,
      default: null,
    },

    finalRating: {
      type: Number,
      default: null,
    },

    strengths: {
      type: String,
      default: null,
    },

    improvements: {
      type: String,
      default: null,
    },

    managerComments: {
      type: String,
      default: null,
    },

    submittedAt: {
      type: String,
      default: null,
    },
  },
  baseOptions,
);

performanceReviewSchema.index(
  {
    cycleId: 1,
    revieweeId: 1,
    reviewerId: 1,
  },
  {
    unique: true,
  },
);

export const PerformanceReview = model<PerformanceReviewDoc>(
  "PerformanceReview",
  performanceReviewSchema,
);

export interface GoalDoc {
  _id: string;
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

const goalMilestoneSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    targetDate: {
      type: String,
      default: null,
    },
    completed: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  },
);

const goalSchema = new Schema<GoalDoc>(
  {
    _id: idField("goal"),

    employeeId: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: null,
    },

    progress: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETED"],
      default: "NOT_STARTED",
    },

    dueDate: {
      type: String,
      required: true,
    },

    createdAt: {
      type: String,
      required: true,
    },

    cycleId: {
      type: String,
      default: null,
    },

    parentGoalId: {
      type: String,
      default: null,
    },

    category: {
      type: String,
      default: null,
    },

    targetValue: {
      type: Number,
      default: null,
    },

    currentValue: {
      type: Number,
      default: null,
    },

    milestones: {
      type: [goalMilestoneSchema],
      default: [],
    },

    assignedBy: {
      type: String,
      default: null,
    },
  },
  baseOptions,
);

export const Goal = model<GoalDoc>("Goal", goalSchema);
export interface PerformanceFeedbackDoc {
  _id: string;
  reviewId: string;
  reviewerEmployeeId: string;
  type: "PEER" | "SUBORDINATE";
  competencyRatings: { competency: string; rating: number }[];
  comments: string | null;
  submittedAt: string;
}

const performanceFeedbackSchema = new Schema<PerformanceFeedbackDoc>(
  {
    _id: idField("pfb"),
    reviewId: { type: String, required: true },
    reviewerEmployeeId: { type: String, required: true },
    type: {
      type: String,
      enum: ["PEER", "SUBORDINATE"],
      required: true,
    },
    competencyRatings: {
      type: [{ competency: String, rating: Number }],
      default: [],
    },
    comments: { type: String, default: null },
    submittedAt: { type: String, required: true },
  },
  baseOptions,
);

performanceFeedbackSchema.index(
  { reviewId: 1, reviewerEmployeeId: 1 },
  { unique: true },
);

export const PerformanceFeedback = model<PerformanceFeedbackDoc>(
  "PerformanceFeedback",
  performanceFeedbackSchema,
);

export interface PerformanceOutcomeDoc {
  _id: string;
  reviewId: string;
  incrementRecommendation: "MAXIMUM" | "STANDARD" | "NONE" | "PIP";
  promotionEligible: boolean;
  trainingNeeds: string[];
  pipRecommended: boolean;
  fastTrackEligible: boolean;
  createdAt: string;
}

const performanceOutcomeSchema = new Schema<PerformanceOutcomeDoc>(
  {
    _id: idField("pout"),
    reviewId: {
      type: String,
      required: true,
      unique: true,
    },
    incrementRecommendation: {
      type: String,
      enum: ["MAXIMUM", "STANDARD", "NONE", "PIP"],
      required: true,
    },
    promotionEligible: {
      type: Boolean,
      default: false,
    },
    trainingNeeds: {
      type: [String],
      default: [],
    },
    pipRecommended: {
      type: Boolean,
      default: false,
    },
    fastTrackEligible: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: String,
      required: true,
    },
  },
  baseOptions,
);

export const PerformanceOutcome = model<PerformanceOutcomeDoc>(
  "PerformanceOutcome",
  performanceOutcomeSchema,
);

export interface PipObjectiveDoc {
  title: string;
  description: string | null;
  target: string | null;
  progress: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  dueDate: string;
}

export interface PipCheckInDoc {
  date: string;
  progress: number;
  managerComments: string | null;
  hrComments: string | null;
  nextSteps: string | null;
  managerId: string | null;
  addedByRole: string | null;
}

export interface PerformanceImprovementPlanDoc {
  _id: string;
  reviewId: string;
  employeeId: string;
  managerId: string | null;
  createdBy: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate: string;
  objectives: string[];
  pipObjectives: PipObjectiveDoc[];
  checkInFrequency: "MONTHLY" | "WEEKLY" | "BIWEEKLY";
  pipCheckInFrequency: "MONTHLY" | "WEEKLY" | "BIWEEKLY";
  checkIns: PipCheckInDoc[];
  latestCheckInProgress: number;
  completedAt: string | null;
  cancelledAt: string | null;
  finalOutcome: string | null;
  createdAt: string;
}

export interface PerformanceImprovementPlanDoc {
  _id: string;
  reviewId: string;
  employeeId: string;
  managerId: string | null;
  createdBy: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate: string;
  objectives: string[];
  pipObjectives: PipObjectiveDoc[];
  checkInFrequency: "MONTHLY" | "WEEKLY" | "BIWEEKLY";
  pipCheckInFrequency: "MONTHLY" | "WEEKLY" | "BIWEEKLY";
  checkIns: PipCheckInDoc[];
  latestCheckInProgress: number;
  completedAt: string | null;
  cancelledAt: string | null;
  finalOutcome: string | null;
  createdAt: string;
}

const pipObjectiveSchema = new Schema<PipObjectiveDoc>(
  {
    title: { type: String, required: true },
    description: { type: String, default: null },
    target: { type: String, default: null },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE"],
      default: "NOT_STARTED",
    },
    dueDate: { type: String, required: true },
  },
  { _id: false },
);

const pipCheckInSchema = new Schema<PipCheckInDoc>(
  {
    date: { type: String, required: true },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    managerComments: { type: String, default: null },
    hrComments: { type: String, default: null },
    nextSteps: { type: String, default: null },
    managerId: { type: String, default: null },
    addedByRole: { type: String, default: null },
  },
  { _id: false },
);

const performanceImprovementPlanSchema =
  new Schema<PerformanceImprovementPlanDoc>(
    {
      _id: idField("pip"),
      reviewId: {
        type: String,
        required: true,
        unique: true,
      },
      employeeId: {
        type: String,
        required: true,
      },
      managerId: { type: String, default: null },
      createdBy: { type: String, default: null },
      status: {
        type: String,
        enum: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"],
        default: "ACTIVE",
      },
      startDate: {
        type: String,
        required: true,
      },
      endDate: {
        type: String,
        required: true,
      },
      objectives: {
        type: [String],
        default: [],
      },
      pipObjectives: { type: [pipObjectiveSchema], default: [] },
      checkInFrequency: {
        type: String,
        enum: ["MONTHLY", "WEEKLY", "BIWEEKLY"],
        default: "MONTHLY",
      },
      pipCheckInFrequency: {
        type: String,
        enum: ["MONTHLY", "WEEKLY", "BIWEEKLY"],
        default: "MONTHLY",
      },
      checkIns: { type: [pipCheckInSchema], default: [] },
      latestCheckInProgress: { type: Number, min: 0, max: 100, default: 0 },
      completedAt: { type: String, default: null },
      cancelledAt: { type: String, default: null },
      finalOutcome: { type: String, default: null },
      createdAt: {
        type: String,
        required: true,
      },
    },
    baseOptions,
  );

export const PerformanceImprovementPlan = model<PerformanceImprovementPlanDoc>(
  "PerformanceImprovementPlan",
  performanceImprovementPlanSchema,
);

// ===========================================================================
// PAYROLL
// ===========================================================================

export interface SalaryStructureDoc {
  _id: string;
  employeeId: string;

  /** Annual total compensation. Monthly payroll derives components from this when configured. */
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

const salaryStructureSchema = new Schema<SalaryStructureDoc>(
  {
    _id: idField("sal"),

    employeeId: {
      type: String,
      required: true,
      unique: true,
    },

    ctc: { type: Number, default: 0, min: 0 },
    basicPercentage: { type: Number, default: 50, min: 40, max: 50 },
    hraPercentage: { type: Number, default: 40, min: 20, max: 40 },

    basic: {
      type: Number,
      required: true,
    },

    hra: {
      type: Number,
      required: true,
    },

    conveyance: {
      type: Number,
      required: true,
    },

    medical: {
      type: Number,
      required: true,
    },

    specialAllowance: {
      type: Number,
      required: true,
    },

    performanceBonus: { type: Number, default: 0, min: 0 },
    advanceRecovery: { type: Number, default: 0, min: 0 },
    overtimeRate: { type: Number, default: 1.5, min: 0 },

    // Statutory deductions are calculated by Payroll. These defaults keep
    // older salary-structure records valid without requiring a migration.
    pf: {
      type: Number,
      default: 0,
      min: 0,
    },

    professionalTax: {
      type: Number,
      default: 0,
      min: 0,
    },

    incomeTax: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxRegime: { type: String, enum: ["NEW", "OLD"], default: "NEW" },
    taxYear: { type: Number, default: 2026, min: 2020 },
    taxOtherIncome: { type: Number, default: 0, min: 0 },
    taxHraExemption: { type: Number, default: 0, min: 0 },
    taxDeduction80C: { type: Number, default: 0, min: 0 },
    taxDeduction80D: { type: Number, default: 0, min: 0 },
    taxDeduction80CCD1B: { type: Number, default: 0, min: 0 },
    taxDeduction80TTA: { type: Number, default: 0, min: 0 },
    taxPreviousTds: { type: Number, default: 0, min: 0 },

    effectiveFrom: {
      type: String,
      required: true,
    },
  },
  baseOptions,
);

export const SalaryStructure = model<SalaryStructureDoc>(
  "SalaryStructure",
  salaryStructureSchema,
);

export interface PayrollRunDoc {
  _id: string;

  month: number;
  year: number;

  status:
    | "DRAFT"
    | "ATTENDANCE_LOCKED"
    | "PROCESSED"
    | "HR_REVIEW"
    | "APPROVED"
    | "PAID";

  processedAt: string | null;
  attendanceLockedAt: string | null;
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

const payrollRunSchema = new Schema<PayrollRunDoc>(
  {
    _id: idField("prun"),

    month: {
      type: Number,
      required: true,
    },

    year: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "ATTENDANCE_LOCKED",
        "PROCESSED",
        "HR_REVIEW",
        "APPROVED",
        "PAID",
      ],
      default: "DRAFT",
    },

    processedAt: {
      type: String,
      default: null,
    },
    attendanceLockedAt: { type: String, default: null },
    reviewedAt: { type: String, default: null },
    reviewedByUserId: { type: String, default: null },
    approvedAt: { type: String, default: null },
    approvedByUserId: { type: String, default: null },
    paidAt: { type: String, default: null },
    paidByUserId: { type: String, default: null },
    payslipsSentAt: { type: String, default: null },
    payslipsSentByUserId: { type: String, default: null },

    totalGross: {
      type: Number,
      default: 0,
    },

    totalDeductions: {
      type: Number,
      default: 0,
    },

    totalNet: {
      type: Number,
      default: 0,
    },

    headcount: {
      type: Number,
      default: 0,
    },
  },
  baseOptions,
);

payrollRunSchema.index(
  {
    month: 1,
    year: 1,
  },
  {
    unique: true,
  },
);

export const PayrollRun = model<PayrollRunDoc>("PayrollRun", payrollRunSchema);

export interface PayslipDoc {
  _id: string;

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
}

const payslipSchema = new Schema<PayslipDoc>(
  {
    _id: idField("pay"),

    payrollRunId: {
      type: String,
      required: true,
    },

    employeeId: {
      type: String,
      required: true,
    },

    basic: {
      type: Number,
      required: true,
    },

    hra: {
      type: Number,
      required: true,
    },

    conveyance: {
      type: Number,
      required: true,
    },

    medical: {
      type: Number,
      required: true,
    },

    specialAllowance: {
      type: Number,
      required: true,
    },

    performanceBonus: { type: Number, default: 0, min: 0 },
    overtimeHours: { type: Number, default: 0, min: 0 },
    overtimeAmount: { type: Number, default: 0, min: 0 },

    grossEarnings: {
      type: Number,
      required: true,
    },

    pf: {
      type: Number,
      required: true,
    },

    professionalTax: {
      type: Number,
      required: true,
    },

    incomeTax: {
      type: Number,
      required: true,
    },
    taxRegime: { type: String, enum: ["NEW", "OLD"], default: "NEW" },
    taxYear: { type: Number, default: 2026, min: 2020 },
    taxableIncome: { type: Number, default: 0, min: 0 },
    annualTax: { type: Number, default: 0, min: 0 },
    esi: { type: Number, default: 0, min: 0 },

    lop: {
      type: Number,
      default: 0,
    },
    advanceRecovery: { type: Number, default: 0, min: 0 },

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
  {
    payrollRunId: 1,
    employeeId: 1,
  },
  {
    unique: true,
  },
);

export const Payslip = model<PayslipDoc>("Payslip", payslipSchema);

export type PayslipRequestPeriod = "3_MONTHS" | "6_MONTHS" | "12_MONTHS";

export type PayslipRequestStatus = "PENDING" | "SENT" | "REJECTED";

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

const payslipRequestSchema = new Schema<PayslipRequestDoc>(
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
      enum: ["3_MONTHS", "6_MONTHS", "12_MONTHS"],
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SENT", "REJECTED"],
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

export const PayslipRequest = model<PayslipRequestDoc>(
  "PayslipRequest",
  payslipRequestSchema,
);

// ===========================================================================
// ANNOUNCEMENTS & NOTIFICATIONS
// ===========================================================================

// Announcement content is owned by
// modules/announcements/announcement.model.ts.
//
// Keep only receipt/read-state model here.

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

const announcementReceiptSchema = new Schema<AnnouncementReceiptDoc>(
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
  {
    announcementId: 1,
    userId: 1,
  },
  {
    unique: true,
  },
);

export const AnnouncementReceipt = model<AnnouncementReceiptDoc>(
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
  | "DOCUMENT_READY"
  | "ATTENDANCE_LATE"
  | "ATTENDANCE_EARLY_DEPARTURE"
  | "ATTENDANCE_COMP_OFF"
  | "ATTENDANCE_REGULARIZATION_REQUEST"
  | "ATTENDANCE_REGULARIZATION_DECISION";

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

const notificationSchema = new Schema<NotificationDoc>(
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
        "ATTENDANCE_LATE",
        "ATTENDANCE_EARLY_DEPARTURE",
        "ATTENDANCE_COMP_OFF",
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

export const Notification = model<NotificationDoc>(
  "Notification",
  notificationSchema,
);

// ===========================================================================
// DOCUMENTS & ASSETS
// ===========================================================================

export type DocumentStatus = "PENDING" | "VERIFIED" | "REJECTED";

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

  expiryDate: string | null;

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

const documentSchema = new Schema<DocumentRecordDoc>(
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

    expiryDate: { type: String, default: null },

    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
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

documentSchema.index({
  requestId: 1,
});

export const DocumentRecord = model<DocumentRecordDoc>(
  "DocumentRecord",
  documentSchema,
  "documents",
);

// ===========================================================================
// DOCUMENT REQUESTS
// ===========================================================================

export type DocumentRequestDirection =
  | "COMPANY_TO_EMPLOYEE"
  | "EMPLOYEE_TO_COMPANY";

export type DocumentRequestStatus = "PENDING" | "UPLOADED" | "REJECTED";

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

const documentRequestSchema = new Schema<DocumentRequestDoc>(
  {
    _id: idField("dreq"),

    employeeId: {
      type: String,
      required: true,
    },

    direction: {
      type: String,
      enum: ["COMPANY_TO_EMPLOYEE", "EMPLOYEE_TO_COMPANY"],
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
      enum: ["PENDING", "UPLOADED", "REJECTED"],
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

export const DocumentRequest = model<DocumentRequestDoc>(
  "DocumentRequest",
  documentRequestSchema,
);

// ===========================================================================
// ASSETS
// ===========================================================================

export interface AssetDoc {
  _id: string;

  employeeId: string;

  assetTag: string;
  category: string;
  name: string;

  assignedAt: string;
  returnedAt: string | null;

  status: "ASSIGNED" | "RETURNED" | "DAMAGED" | "LOST";
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
      enum: ["ASSIGNED", "RETURNED", "DAMAGED", "LOST"],
      default: "ASSIGNED",
    },
  },
  baseOptions,
);

export const Asset = model<AssetDoc>("Asset", assetSchema);

// ===========================================================================
// AUDIT LOG
// ===========================================================================

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

    userId: {
      type: String,
      default: null,
    },

    action: {
      type: String,
      required: true,
    },

    entity: {
      type: String,
      required: true,
    },

    entityId: {
      type: String,
      default: null,
    },

    metadata: {
      type: String,
      default: null,
    },

    ipAddress: {
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

auditLogSchema.index({
  entity: 1,
  entityId: 1,
});

export const AuditLog = model<AuditLogDoc>("AuditLog", auditLogSchema);

// ===========================================================================
// TICKETS
// ===========================================================================

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
    | "IT Support"
    | "Complaint";

  priority: "LOW" | "MEDIUM" | "HIGH";

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

  // AI classification metadata
  aiCategory: string | null;
  aiIntent: string | null;
  aiConfidence: number | null;
  aiReason: string | null;
  aiPriority: "LOW" | "MEDIUM" | "HIGH" | null;
  aiPriorityReason: string | null;
  aiSentiment: "POSITIVE" | "NEUTRAL" | "FRUSTRATED" | "CRITICAL" | null;

  // Phase 5: Predictive SLA Breach Warning
  slaRiskScore: number;
  slaRiskLevel: "NORMAL" | "ELEVATED" | "CRITICAL";

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
        "Complaint",
      ],
      required: true,
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
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

    // AI classification metadata
    aiCategory: {
      type: String,
      default: null,
    },

    aiIntent: {
      type: String,
      default: null,
    },

    aiConfidence: {
      type: Number,
      default: null,
    },

    aiReason: {
      type: String,
      default: null,
    },

    aiPriority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", null],
      default: null,
    },

    aiPriorityReason: {
      type: String,
      default: null,
    },

    aiSentiment: {
      type: String,
      enum: ["POSITIVE", "NEUTRAL", "FRUSTRATED", "CRITICAL", null],
      default: null,
    },

    // Phase 5: Autonomous Operations & Predictive SLA
    slaRiskScore: {
      type: Number,
      default: 0,
    },

    slaRiskLevel: {
      type: String,
      enum: ["NORMAL", "ELEVATED", "CRITICAL"],
      default: "NORMAL",
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

export const Ticket = model<TicketDoc>("Ticket", ticketSchema);
