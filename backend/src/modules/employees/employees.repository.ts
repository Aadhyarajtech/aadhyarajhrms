import bcrypt from "bcryptjs";
import { Employee, User, Department, Designation } from "@/db/models";
import { nowIso } from "@/db/connection";
import { AppError } from "@/utils/errors";

export interface EmployeeFilters {
  search?: string;
  departmentId?: string;
  status?: string;
  managerId?: string;
  page?: number;
  pageSize?: number;
}

async function enrichEmployees(employeeDocs: any[]) {
  if (employeeDocs.length === 0) return [];

  const departmentIds = [...new Set(employeeDocs.map((e) => e.departmentId))];
  const designationIds = [...new Set(employeeDocs.map((e) => e.designationId))];
  const managerIds = [
    ...new Set(employeeDocs.map((e) => e.managerId).filter(Boolean)),
  ];
  const userIds = [...new Set(employeeDocs.map((e) => e.userId))];

  const [departments, designations, managers, users] = await Promise.all([
    Department.find({ _id: { $in: departmentIds } }).lean(),
    Designation.find({ _id: { $in: designationIds } }).lean(),
    Employee.find({ _id: { $in: managerIds } }).lean(),
    User.find({ _id: { $in: userIds } }).lean(),
  ]);

  const deptMap = new Map(departments.map((d) => [d._id, d]));
  const desMap = new Map(designations.map((d) => [d._id, d]));
  const managerMap = new Map(managers.map((m) => [m._id, m]));
  const userMap = new Map(users.map((u) => [u._id, u]));

  return employeeDocs.map((e) => {
    const dept = deptMap.get(e.departmentId);
    const des = desMap.get(e.designationId);
    const manager = e.managerId ? managerMap.get(e.managerId) : undefined;
    const user = userMap.get(e.userId);
    const { _id, ...rest } = e;
    return {
      id: _id,
      ...rest,
      departmentName: dept?.name ?? null,
      departmentCode: dept?.code ?? null,
      departmentColor: dept?.colorHex ?? null,
      designationTitle: des?.title ?? null,
      designationLevel: des?.level ?? null,
      managerFirstName: manager?.firstName ?? null,
      managerLastName: manager?.lastName ?? null,
      managerEmpId: manager?._id ?? null,
      email: user?.email ?? null,
      role: user?.role ?? null,
      isActive: user?.isActive ?? null,
    };
  });
}

async function enrichEmployee(employeeDoc: any | null) {
  if (!employeeDoc) return undefined;
  const [enriched] = await enrichEmployees([employeeDoc]);
  return enriched;
}

export async function listEmployees(filters: EmployeeFilters) {
  const query: Record<string, any> = {};

  if (filters.departmentId) query.departmentId = filters.departmentId;
  if (filters.status) query.status = filters.status;
  if (filters.managerId) query.managerId = filters.managerId;

  if (filters.search) {
    const regex = new RegExp(
      filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    const matchingUsers = await User.find({ email: regex })
      .select("_id")
      .lean();
    const userIds = matchingUsers.map((u) => u._id);
    query.$or = [
      { firstName: regex },
      { lastName: regex },
      { employeeCode: regex },
      { userId: { $in: userIds } },
    ];
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    Employee.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    Employee.countDocuments(query),
  ]);

  return {
    employees: await enrichEmployees(rows),
    total,
    page,
    pageSize,
  };
}

export async function getEmployeeById(id: string) {
  const doc = await Employee.findById(id).lean();
  return enrichEmployee(doc);
}

export async function getEmployeeByUserId(userId: string) {
  const doc = await Employee.findOne({ userId }).lean();
  return enrichEmployee(doc);
}

/**
 * Validate a reporting-manager assignment without changing existing employee
 * records. A manager cannot be the employee themself and a reporting chain
 * cannot contain a cycle.
 */
async function validateManagerAssignment(
  employeeId: string,
  managerId?: string | null,
) {
  if (!managerId) return;

  if (managerId === employeeId) {
    throw AppError.badRequest("An employee cannot report to themself.");
  }

  const manager = await Employee.findById(managerId).select("_id managerId status").lean<any>();
  if (!manager) {
    throw AppError.notFound("Reporting manager not found.");
  }

  // Follow the proposed manager's chain. If it reaches the employee being
  // edited, the new relationship would create a circular hierarchy.
  const visited = new Set<string>();
  let currentId: string | null = managerId;

  while (currentId) {
    if (currentId === employeeId) {
      throw AppError.badRequest("Invalid reporting hierarchy: this assignment creates a manager cycle.");
    }
    if (visited.has(currentId)) {
      throw AppError.badRequest("Invalid reporting hierarchy: an existing manager cycle was detected.");
    }
    visited.add(currentId);

    const current:  { _id?: unknown; managerId?: unknown } | null =
      currentId === managerId
        ? manager
        : await Employee.findById(currentId).select("_id managerId").lean<any>();

    currentId = current?.managerId ? String(current.managerId) : null;
  }
}

export async function listDirectReports(managerId: string) {
  const rows = await Employee.find({
    managerId,
    status: {
      $in: [
        "ACTIVE",
        "ON_PROBATION",
        "ON_LEAVE",
        "NOTICE_PERIOD",
        "ON_HOLD",
      ],
    },
  })
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  return enrichEmployees(rows);
}

async function nextEmployeeCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ART-${year}-`;
  const pattern = new RegExp(`^${prefix}\\d{4,}$`);

  // Do not derive the next employee code from total document count.
  // Archived/deleted records can make the count diverge from the actual
  // sequence and can otherwise produce duplicate employee codes.
  const latest = await Employee.findOne({ employeeCode: pattern })
    .sort({ employeeCode: -1 })
    .select("employeeCode")
    .lean();

  let sequence = 1;
  if (latest?.employeeCode?.startsWith(prefix)) {
    const parsed = Number(latest.employeeCode.slice(prefix.length));
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      sequence = parsed + 1;
    }
  }

  // The employeeCode field is unique. Check for an existing candidate so
  // gaps in the sequence are handled safely when older records are present.
  let candidate = `${prefix}${String(sequence).padStart(4, "0")}`;
  while (await Employee.exists({ employeeCode: candidate })) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(4, "0")}`;
  }

  return candidate;
}

export const ONBOARDING_STAGE_DEFINITIONS = [
  { stage: 1, key: "ACCOUNT_CREATION", name: "HR Creates Employee Account in System" },
  { stage: 2, key: "PERSONAL_PROFESSIONAL_DETAILS", name: "Personal & Professional Details Entry" },
  { stage: 3, key: "DOCUMENT_VERIFICATION", name: "Document Upload & Verification" },
  { stage: 4, key: "DEPARTMENT_ROLE_ASSIGNMENT", name: "Department & Role Assignment" },
  { stage: 5, key: "PAYROLL_STRUCTURE", name: "Payroll Structure Configuration" },
  { stage: 6, key: "CREDENTIALS", name: "System Login Credentials Issued" },
  { stage: 7, key: "ORIENTATION_POLICY", name: "Employee Orientation & Policy Briefing" },
  { stage: 8, key: "PROFILE_ACTIVATION", name: "Profile Activated — Employee Successfully Onboarded" },
] as const;

export const ONBOARDING_STAGES = ONBOARDING_STAGE_DEFINITIONS.map((item) => item.key) as [
  "ACCOUNT_CREATION",
  "PERSONAL_PROFESSIONAL_DETAILS",
  "DOCUMENT_VERIFICATION",
  "DEPARTMENT_ROLE_ASSIGNMENT",
  "PAYROLL_STRUCTURE",
  "CREDENTIALS",
  "ORIENTATION_POLICY",
  "PROFILE_ACTIVATION",
];

export type OnboardingStageKey = (typeof ONBOARDING_STAGES)[number];
export type OnboardingStageStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export interface OnboardingStage {
  stage: number;
  name: string;
  status: OnboardingStageStatus;
  startedAt: string | null;
  completedAt: string | null;
  completedBy?: string | null;
  remarks: string | null;
}

export interface EmployeeOnboarding {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentStage: number | null;
  stages: OnboardingStage[];
  startedAt: string | null;
  completedAt: string | null;
}

function buildOnboardingStages(
  statusByStage?: Record<number, OnboardingStageStatus>,
  timestamps?: Record<number, { startedAt?: string | null; completedAt?: string | null }>,
): OnboardingStage[] {
  return ONBOARDING_STAGE_DEFINITIONS.map(({ stage, name }) => ({
    stage,
    name,
    status: statusByStage?.[stage] ?? "PENDING",
    startedAt: timestamps?.[stage]?.startedAt ?? null,
    completedAt: timestamps?.[stage]?.completedAt ?? null,
    completedBy: null,
    remarks: null,
  }));
}

export function createInitialOnboarding(): EmployeeOnboarding {
  const now = nowIso();

  return {
    status: "IN_PROGRESS",
    currentStage: 2,
    startedAt: now,
    completedAt: null,
    stages: buildOnboardingStages(
      {
        1: "COMPLETED",
        2: "IN_PROGRESS",
      },
      {
        1: { startedAt: now, completedAt: now },
        2: { startedAt: now, completedAt: null },
      },
    ),
  };
}

export interface CreateEmployeeInput {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  departmentId: string;
  designationId: string;
  managerId?: string | null;
  employmentType?: string;
  dateOfJoining: string;
  gender?: string;
  phone?: string;
  city?: string;
  personalEmail?: string;
  grade?: string;
  workLocation?: string;
  probationPeriodMonths: number;
  temporaryPassword: string;
  dateOfBirth?: string | null;
  address?: string;
  state?: string | null;
  country?: string;
  maritalStatus?: string | null;

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
  avatarUrl?: string;

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
}

export async function createEmployee(input: CreateEmployeeInput) {
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(input.temporaryPassword, 10);
  const employeeCode = await nextEmployeeCode();

  if (input.managerId) {
    // New employee does not have an id yet, so only validate that the selected
    // manager exists and is not part of a malformed existing chain.
    const manager = await Employee.findById(input.managerId)
      .select("_id managerId status")
      .lean<any>();
    if (!manager) throw AppError.notFound("Reporting manager not found.");
    if (manager.status === "INACTIVE" || manager.status === "TERMINATED" || manager.status === "RESIGNED") {
      throw AppError.badRequest("An inactive employee cannot be assigned as reporting manager.");
    }
  }

  const user = await User.create({
    email: input.email.toLowerCase().trim(),
    passwordHash,
    role: input.role as any,
    isActive: true,
    mustResetPwd: true,
    createdAt: now,
    updatedAt: now,
  });

  const employee = await Employee.create({
    employeeCode,
    userId: user._id,
    firstName: input.firstName,
    lastName: input.lastName,
    gender: input.gender ?? null,
    phone: input.phone ?? null,
    personalEmail: input.personalEmail ?? null,
    city: input.city ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    address: input.address ?? null,
    state: input.state ?? null,
    country: input.country ?? "India",
    maritalStatus: input.maritalStatus ?? null,

    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    emergencyContactRelationship: input.emergencyContactRelationship ?? null,
    emergencyContactEmail: input.emergencyContactEmail ?? null,
    emergencyContacts: input.emergencyContacts ?? [],

    medicalConditions: input.medicalConditions ?? null,
    bloodGroup: input.bloodGroup ?? null,
    insurancePolicyNumber: input.insurancePolicyNumber ?? null,

    employeeAadhaar: input.employeeAadhaar ?? null,
    employeePan: input.employeePan ?? null,
    employeeTan: input.employeeTan ?? null,
    bankAccountNumber: input.bankAccountNumber ?? null,
    bankIfscCode: input.bankIfscCode ?? null,
    bankBranch: input.bankBranch ?? null,
    investmentDeclarations: input.investmentDeclarations ?? {},
    signature: input.signature ?? null,
    avatarUrl: input.avatarUrl ?? null,

    education: input.education ?? [],
    certifications: input.certifications ?? [],
    workHistory: input.workHistory ?? [],
    skills: input.skills ?? [],
    departmentId: input.departmentId,
    designationId: input.designationId,
    managerId: input.managerId ?? null,
    employmentType: (input.employmentType as any) ?? "FULL_TIME",

    grade: input.grade ?? null,
    workLocation: input.workLocation ?? null,
    probationPeriodMonths: input.probationPeriodMonths ?? null,
    probationStartDate: null,
    probationEndDate: null,
    probationReminderSentAt: null,

    status: "ONBOARDING",
    onboarding: createInitialOnboarding(),

    dateOfJoining: input.dateOfJoining,
    isArchived: false,
    archivedAt: null,
    offboardingChecklist: null,
    resignationDetails: null,
    createdAt: now,
    updatedAt: now,
  });

  return getEmployeeById(employee._id);
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  gender?: string | null;
  maritalStatus?: string | null;
  dateOfBirth?: string | null;
  departmentId?: string;
  designationId?: string;
  managerId?: string | null;
  employmentType?: string;
  grade?: string | null;
  workLocation?: string | null;

  probationPeriodMonths?: number | null;
  probationStartDate?: string | null;
  probationEndDate?: string | null;

  probationExtensionDetails?: {
    extensionDays: number;
    extendedFrom: string | null;
    extendedTo: string;
    remarks: string | null;
    extendedAt: string;
  } | null;

  noticeDays?: number;
  noticeStartDate?: string;
  lastWorkingDate?: string;

  resignationDetails?: {
    resignationDate: string;
    resignationReason: string;
    employeeRemarks: string | null;
    hrRemarks: string | null;
  };

  terminationDetails?: {
    terminationDate: string;
    terminationReason: string;
    employeeRemarks: string | null;
    hrRemarks: string | null;
  };

  status?: string;
  phone?: string;
  personalEmail?: string;
  address?: string;
  city?: string;
  state?: string | null;
  country?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
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
  avatarUrl?: string;

  onboarding?: EmployeeOnboarding;
  dateOfExit?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;

  offboardingChecklist?: {
    assetReturn: boolean;
    accessRevoked: boolean;
    exitInterview: boolean;
    finalSettlement: boolean;
    completedAt: string | null;
  } | null;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  const current = await Employee.findById(id).lean<any>();
  if (!current) return undefined;

  const merged = { ...current, ...input };

  if (Object.prototype.hasOwnProperty.call(input, "managerId")) {
    await validateManagerAssignment(id, merged.managerId ?? null);
  }

  await Employee.updateOne(
    { _id: id },
    {
      $set: {
        firstName: merged.firstName,
        lastName: merged.lastName,
        departmentId: merged.departmentId,
        designationId: merged.designationId,
        managerId: merged.managerId ?? null,
        employmentType: merged.employmentType,
        grade: merged.grade ?? null,
        workLocation: merged.workLocation ?? null,
        probationPeriodMonths: merged.probationPeriodMonths ?? null,
        probationStartDate: merged.probationStartDate ?? null,
        probationEndDate: merged.probationEndDate ?? null,

        noticeStartDate: merged.noticeStartDate ?? null,
        lastWorkingDate: merged.lastWorkingDate ?? null,
        noticeDays: merged.noticeDays ?? null,

        probationReminderSentAt:
          merged.probationEndDate !== current.probationEndDate ||
          merged.probationStartDate !== current.probationStartDate
            ? null
            : (current.probationReminderSentAt ?? null),
        status: merged.status,
        gender: merged.gender ?? null,
        maritalStatus: merged.maritalStatus ?? null,
        dateOfBirth: merged.dateOfBirth ?? null,
        phone: merged.phone ?? null,
        personalEmail: merged.personalEmail ?? null,
        address: merged.address ?? null,
        city: merged.city ?? null,
        state: merged.state ?? null,
        country: merged.country ?? "India",
        emergencyContactName: merged.emergencyContactName ?? null,
        emergencyContactPhone: merged.emergencyContactPhone ?? null,
        emergencyContactRelationship:
          merged.emergencyContactRelationship ?? null,
        emergencyContactEmail: merged.emergencyContactEmail ?? null,
        emergencyContacts: merged.emergencyContacts ?? current.emergencyContacts ?? [],
        medicalConditions: merged.medicalConditions ?? null,
        bloodGroup: merged.bloodGroup ?? null,
        insurancePolicyNumber: merged.insurancePolicyNumber ?? null,

        employeeAadhaar: merged.employeeAadhaar ?? null,
        employeePan: merged.employeePan ?? null,
        employeeTan: merged.employeeTan ?? null,
        bankAccountNumber: merged.bankAccountNumber ?? null,
        bankIfscCode: merged.bankIfscCode ?? null,
        bankBranch: merged.bankBranch ?? null,
        investmentDeclarations: input.investmentDeclarations
          ? { ...(current.investmentDeclarations ?? {}), ...input.investmentDeclarations }
          : (current.investmentDeclarations ?? {}),
        signature: merged.signature ?? null,
        avatarUrl: merged.avatarUrl ?? null,
        education: merged.education ?? current.education ?? [],
        certifications: merged.certifications ?? current.certifications ?? [],
        workHistory: merged.workHistory ?? current.workHistory ?? [],
        skills: merged.skills ?? current.skills ?? [],
        onboarding: input.onboarding ?? current.onboarding ?? createInitialOnboarding(),
        dateOfExit: merged.dateOfExit ?? null,

        isArchived:
          merged.status === "INACTIVE"
            ? true
            : (merged.isArchived ?? current.isArchived ?? false),

        archivedAt:
          merged.status === "INACTIVE"
            ? current.status === "INACTIVE" && current.archivedAt
              ? current.archivedAt
              : nowIso()
            : (merged.archivedAt ?? current.archivedAt ?? null),

        offboardingChecklist:
          input.offboardingChecklist ??
          current.offboardingChecklist ??
          (merged.status === "NOTICE_PERIOD"
            ? {
                assetReturn: false,
                accessRevoked: false,
                exitInterview: false,
                finalSettlement: false,
                completedAt: null,
              }
            : null),

        resignationDetails:
          input.resignationDetails ?? current.resignationDetails ?? null,

        probationExtensionDetails:
          input.probationExtensionDetails ??
          current.probationExtensionDetails ??
          null,

        terminationDetails:
          input.terminationDetails ?? current.terminationDetails ?? null,

        updatedAt: nowIso(),
      },
    },
  );
  return getEmployeeById(id);
}

export async function getOrgChart() {
  const rows = await Employee.find({
    status: {
      $in: [
        "ACTIVE",
        "ON_PROBATION",
        "ON_LEAVE",
        "NOTICE_PERIOD",
        "INACTIVE",
        "ON_HOLD",
      ],
    },
  }).lean();
  const designationIds = [...new Set(rows.map((e) => e.designationId))];
  const departmentIds = [...new Set(rows.map((e) => e.departmentId))];
  const [designations, departments] = await Promise.all([
    Designation.find({ _id: { $in: designationIds } }).lean(),
    Department.find({ _id: { $in: departmentIds } }).lean(),
  ]);
  const desMap = new Map(designations.map((d) => [d._id, d]));
  const deptMap = new Map(departments.map((d) => [d._id, d]));

  const sorted = [...rows].sort(
    (a, b) =>
      (desMap.get(b.designationId)?.level ?? 0) -
      (desMap.get(a.designationId)?.level ?? 0),
  );

  const camel = sorted.map((e) => ({
    id: e._id,
    firstName: e.firstName,
    lastName: e.lastName,
    avatarUrl: e.avatarUrl,
    managerId: e.managerId,
    status: e.status,
    designationTitle: desMap.get(e.designationId)?.title ?? null,
    departmentName: deptMap.get(e.departmentId)?.name ?? null,
    departmentColor: deptMap.get(e.departmentId)?.colorHex ?? null,
  }));

  const byId = new Map(
    camel.map((e) => [e.id, { ...e, directReports: [] as any[] }]),
  );

  // Build a clean parent map from the real managerId values. If old/restored
  // data contains a self-reference or circular chain, treat the affected
  // employee as a root instead of losing the entire branch from the chart.
  const parentMap = new Map<string, string>();
  for (const emp of byId.values()) {
    const managerId = emp.managerId ? String(emp.managerId) : "";
    if (!managerId || managerId === emp.id || !byId.has(managerId)) continue;

    const visited = new Set<string>([emp.id]);
    let cursor: string | undefined = managerId;
    let valid = true;

    while (cursor) {
      if (visited.has(cursor)) {
        valid = false;
        break;
      }
      visited.add(cursor);
      const parent = byId.get(cursor);
      cursor = parent?.managerId ? String(parent.managerId) : undefined;
    }

    if (valid) parentMap.set(emp.id, managerId);
  }

  const roots: any[] = [];
  for (const emp of byId.values()) {
    const managerId = parentMap.get(emp.id);
    if (managerId) {
      byId.get(managerId)!.directReports.push(emp);
    } else {
      roots.push(emp);
    }
  }

  return roots;
}

export async function getHeadcountByDepartment() {
  const departments = await Department.find({}).lean();
  const counts = await Employee.aggregate([
    { $match: { status: "ACTIVE" } },
    { $group: { _id: "$departmentId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id, c.count]));

  return departments
    .map((d) => ({
      department: d.name,
      color: d.colorHex,
      count: countMap.get(d._id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getGenderDiversity() {
  const rows = await Employee.aggregate([
    { $match: { status: "ACTIVE" } },
    {
      $group: {
        _id: { $ifNull: ["$gender", "Unspecified"] },
        count: { $sum: 1 },
      },
    },
  ]);
  return rows.map((r) => ({ gender: r._id, count: r.count }));
}

export async function getEmploymentTypeBreakdown() {
  const rows = await Employee.aggregate([
    { $match: { status: "ACTIVE" } },
    { $group: { _id: "$employmentType", count: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({ type: r._id, count: r.count }));
}

export async function getHeadcountTrend(months = 6) {
  const rows = await Employee.find({})
    .select("dateOfJoining dateOfExit")
    .lean();
  const trend: { month: string; headcount: number }[] = [];
  const today = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const cutoff = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const count = rows.filter((r: any) => {
      const joined = new Date(r.dateOfJoining);
      const exited = r.dateOfExit ? new Date(r.dateOfExit) : null;
      return joined <= cutoff && (!exited || exited > cutoff);
    }).length;
    trend.push({
      month: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
      headcount: count,
    });
  }
  return trend;
}

export async function getManagersList() {
  const rows = await Employee.find({
    status: {
      $in: ["ACTIVE", "ON_PROBATION", "ON_LEAVE", "NOTICE_PERIOD", "ON_HOLD"],
    },
  })
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  const designationIds = [
    ...new Set(rows.map((e) => e.designationId).filter(Boolean)),
  ];
  const userIds = [...new Set(rows.map((e) => e.userId).filter(Boolean))];

  const [designations, users, reportCounts] = await Promise.all([
    Designation.find({ _id: { $in: designationIds } }).lean(),
    User.find({ _id: { $in: userIds } }).select("_id role").lean(),
    Employee.aggregate([
      { $match: { managerId: { $ne: null } } },
      { $group: { _id: "$managerId", count: { $sum: 1 } } },
    ]),
  ]);

  const desMap = new Map(designations.map((d) => [d._id, d]));
  const userMap = new Map(users.map((u) => [u._id, u]));
  const reportMap = new Map(reportCounts.map((r) => [r._id, r.count]));

  return rows
    .filter((employee) => {
      const role = userMap.get(employee.userId)?.role;
      // Include actual managers even before their first report is assigned.
      // Also retain employees who already have reports, so restored data does
      // not disappear from the manager selector.
      return (
        role === "MANAGER" ||
        role === "HR_ADMIN" ||
        role === "SUPER_ADMIN" ||
        (reportMap.get(employee._id) ?? 0) > 0
      );
    })
    .map((employee) => ({
      id: employee._id,
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",
      designationTitle: desMap.get(employee.designationId)?.title ?? null,
      role: userMap.get(employee.userId)?.role ?? null,
      directReportCount: reportMap.get(employee._id) ?? 0,
    }));
}

export async function updateUserActiveStatus(
  userId: string,
  isActive: boolean,
) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        isActive,
        updatedAt: nowIso(),
      },
    },
  );
}
export async function getEmployeeAiContext(employeeId: string) {
  const employee = await Employee.findById(employeeId).lean();

  if (!employee) {
    return null;
  }

  const [department, designation, manager] = await Promise.all([
    employee.departmentId
      ? Department.findById(employee.departmentId)
          .select("name code")
          .lean()
      : null,

    employee.designationId
      ? Designation.findById(employee.designationId)
          .select("title level")
          .lean()
      : null,

    employee.managerId
      ? Employee.findById(employee.managerId)
          .select("employeeCode firstName lastName")
          .lean()
      : null,
  ]);

  return {
    employee: {
      id: String(employee._id),
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,

      workLocation: employee.workLocation ?? null,
      grade: employee.grade ?? null,
      employmentType: employee.employmentType ?? null,
      status: employee.status,

      dateOfJoining: employee.dateOfJoining ?? null,

      skills: (employee.skills ?? []).map((skill: any) => ({
        name: skill.name,
        category: skill.category ?? null,
        competencyLevel: skill.competencyLevel,
      })),

      education: employee.education ?? [],
      certifications: employee.certifications ?? [],
      workHistory: employee.workHistory ?? [],
    },

    department: department
      ? {
          id: String(department._id),
          name: department.name,
          code: department.code,
        }
      : null,

    designation: designation
      ? {
          id: String(designation._id),
          title: designation.title,
          level: designation.level,
        }
      : null,

    manager: manager
      ? {
          id: String(manager._id),
          employeeCode: manager.employeeCode,
          name: `${manager.firstName} ${manager.lastName}`.trim(),
        }
      : null,
  };
}

export async function getOnboarding(id: string): Promise<EmployeeOnboarding | null> {
  const employee = await Employee.findById(id).select("onboarding status").lean<any>();
  if (!employee) return null;

  const raw = employee.onboarding;

  if (raw?.stages?.length) {
    const stages: OnboardingStage[] = ONBOARDING_STAGE_DEFINITIONS.map(
      ({ stage, name }) => {
        const existing = raw.stages.find(
          (item: any) => Number(item.stage) === stage,
        );

        return {
          stage,
          name: existing?.name ?? name,
          status: existing?.status ?? "PENDING",
          startedAt: existing?.startedAt ?? null,
          completedAt: existing?.completedAt ?? null,
          completedBy: existing?.completedBy ?? null,
          remarks: existing?.remarks ?? null,
        };
      },
    );

    return {
      status:
        raw.status === "COMPLETED"
          ? "COMPLETED"
          : raw.status === "IN_PROGRESS"
            ? "IN_PROGRESS"
            : "NOT_STARTED",
      currentStage:
        raw.currentStage != null
          ? Number(raw.currentStage)
          : stages.find((stage) => stage.status !== "COMPLETED")?.stage ?? null,
      stages,
      startedAt: raw.startedAt ?? null,
      completedAt: raw.completedAt ?? null,
    };
  }

  return {
    status: "NOT_STARTED",
    currentStage: employee.status === "ONBOARDING" ? 1 : null,
    stages: buildOnboardingStages(),
    startedAt: null,
    completedAt: null,
  };
}

function resolveOnboardingStageNumber(stage: number | string): number | null {
  if (
    typeof stage === "number" &&
    Number.isInteger(stage) &&
    stage >= 1 &&
    stage <= 8
  ) {
    return stage;
  }

  if (typeof stage === "string") {
    const numeric = Number(stage);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 8) {
      return numeric;
    }

    return (
      ONBOARDING_STAGE_DEFINITIONS.find((item) => item.key === stage)?.stage ??
      null
    );
  }

  return null;
}

function normalizeStoredOnboarding(raw: any): EmployeeOnboarding {
  if (!raw?.stages?.length) {
    return {
      status: "NOT_STARTED",
      currentStage: 1,
      stages: buildOnboardingStages(),
      startedAt: null,
      completedAt: null,
    };
  }

  return {
    status:
      raw.status === "COMPLETED"
        ? "COMPLETED"
        : raw.status === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : "NOT_STARTED",
    currentStage:
      raw.currentStage != null
        ? Number(raw.currentStage)
        : raw.stages.find((item: any) => item.status !== "COMPLETED")?.stage ??
          null,
    stages: ONBOARDING_STAGE_DEFINITIONS.map(({ stage, name }) => {
      const existing = raw.stages.find(
        (item: any) => Number(item.stage) === stage,
      );

      return {
        stage,
        name: existing?.name ?? name,
        status: existing?.status ?? "PENDING",
        startedAt: existing?.startedAt ?? null,
        completedAt: existing?.completedAt ?? null,
        completedBy: existing?.completedBy ?? null,
        remarks: existing?.remarks ?? null,
      };
    }),
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
  };
}

export async function startOnboarding(id: string) {
  const employee = await Employee.findById(id).lean<any>();
  if (!employee) return undefined;

  const now = nowIso();
  const onboarding = normalizeStoredOnboarding(employee.onboarding);

  if (onboarding.status === "IN_PROGRESS" && onboarding.startedAt) {
    return getOnboarding(id);
  }

  onboarding.status = "IN_PROGRESS";
  onboarding.startedAt = onboarding.startedAt ?? now;
  onboarding.completedAt = null;

  const stage1 = onboarding.stages.find((stage) => stage.stage === 1)!;
  stage1.status = "COMPLETED";
  stage1.startedAt = stage1.startedAt ?? onboarding.startedAt;
  stage1.completedAt = stage1.completedAt ?? now;

  const stage2 = onboarding.stages.find((stage) => stage.stage === 2)!;
  stage2.status = "IN_PROGRESS";
  stage2.startedAt = stage2.startedAt ?? now;
  stage2.completedAt = null;

  onboarding.currentStage = 2;

  await Employee.updateOne(
    { _id: id },
    {
      $set: {
        onboarding,
        status: "ONBOARDING",
        updatedAt: now,
      },
    },
  );

  return getOnboarding(id);
}

export async function updateOnboardingStage(
  id: string,
  stage: number | string,
  status: OnboardingStageStatus,
  remarks?: string | null,
) {
  const employee = await Employee.findById(id).lean<any>();
  if (!employee) return undefined;

  const stageNumber = resolveOnboardingStageNumber(stage);
  if (!stageNumber) return undefined;

  const onboarding = normalizeStoredOnboarding(employee.onboarding);
  const now = nowIso();

  if (status === "COMPLETED" && stageNumber > 1) {
    const previousIncomplete = onboarding.stages.find(
      (item) => item.stage < stageNumber && item.status !== "COMPLETED",
    );

    if (previousIncomplete) {
      return {
        success: false,
        reason: "PREVIOUS_STAGE_INCOMPLETE",
        blockedByStage: previousIncomplete.stage,
        employee: await getEmployeeById(id),
      };
    }
  }

  const target = onboarding.stages.find((item) => item.stage === stageNumber)!;

  if (status === "IN_PROGRESS") {
    target.status = "IN_PROGRESS";
    target.startedAt = target.startedAt ?? now;
    target.completedAt = null;
  } else if (status === "COMPLETED") {
    target.status = "COMPLETED";
    target.startedAt = target.startedAt ?? now;
    target.completedAt = target.completedAt ?? now;
  } else {
    target.status = "PENDING";
    target.completedAt = null;
  }

  if (remarks !== undefined) {
    target.remarks = remarks?.trim() || null;
  }

  const nextStage = onboarding.stages.find(
    (item) => item.status !== "COMPLETED",
  );

  if (!nextStage) {
    onboarding.status = "COMPLETED";
    onboarding.currentStage = null;
    onboarding.completedAt = onboarding.completedAt ?? now;
  } else {
    onboarding.status = "IN_PROGRESS";
    onboarding.currentStage = nextStage.stage;

    if (nextStage.status === "PENDING") {
      nextStage.status = "IN_PROGRESS";
      nextStage.startedAt = nextStage.startedAt ?? now;
    }
  }

  await Employee.updateOne(
    { _id: id },
    { $set: { onboarding, updatedAt: now } },
  );

  return {
    success: true,
    onboarding: await getOnboarding(id),
    employee: await getEmployeeById(id),
  };
}

export async function completeOnboarding(id: string) {
  const employee = await Employee.findById(id).lean<any>();
  if (!employee) return undefined;

  const onboarding = normalizeStoredOnboarding(employee.onboarding);

  const incompleteBeforeActivation = onboarding.stages.filter(
    (stage) => stage.stage <= 7 && stage.status !== "COMPLETED",
  );

  if (incompleteBeforeActivation.length > 0) {
    return {
      success: false,
      reason: "INCOMPLETE_STAGES",
      incompleteStages: incompleteBeforeActivation.map((stage) => stage.stage),
      employee: await getEmployeeById(id),
    };
  }

  const now = nowIso();
  const stage8 = onboarding.stages.find((stage) => stage.stage === 8)!;
  stage8.status = "COMPLETED";
  stage8.startedAt = stage8.startedAt ?? now;
  stage8.completedAt = stage8.completedAt ?? now;

  onboarding.status = "COMPLETED";
  onboarding.currentStage = null;
  onboarding.completedAt = now;

  const probationMonths = Number(employee.probationPeriodMonths ?? 3);
  const probationStartDate = probationMonths > 0 ? now : null;
  const probationEnd = new Date(now);

  if (probationMonths > 0) {
    probationEnd.setMonth(probationEnd.getMonth() + probationMonths);
  }

  const updated = await Employee.findByIdAndUpdate(
    id,
    {
      $set: {
        status: probationMonths > 0 ? "ON_PROBATION" : "ACTIVE",
        probationStartDate,
        probationEndDate:
          probationMonths > 0 ? probationEnd.toISOString() : null,
        onboarding,
        updatedAt: now,
      },
    },
    { new: true },
  ).lean();

  return {
    success: true,
    employee: updated ? await getEmployeeById(id) : undefined,
  };
}
