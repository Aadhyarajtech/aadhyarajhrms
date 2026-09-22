import bcrypt from "bcryptjs";
import { Employee, User, Department, Designation } from "@/db/models";
import { nowIso } from "@/db/connection";
import { AppError } from "@/utils/errors";

export const EMPLOYEE_ONBOARDING_STAGES = [
  "HR Creates Employee Account in System",
  "Personal & Professional Details Entry",
  "Document Upload & Verification",
  "Department & Role Assignment",
  "Payroll Structure Configuration",
  "System Login Credentials Issued",
  "Employee Orientation & Policy Briefing",
  "Profile Activated — Employee Successfully Onboarded",
] as const;

export function buildDefaultOnboarding(status?: string) {
  const completedLegacy = Boolean(status && status !== "ONBOARDING");
  const stages = EMPLOYEE_ONBOARDING_STAGES.map((name, index) => ({
    stage: index + 1,
    name,
    status: completedLegacy || index === 0 ? "COMPLETED" : "PENDING",
    completedAt: completedLegacy || index === 0 ? nowIso() : null,
    completedBy: null,
    remarks: null,
  }));

  return {
    currentStage: completedLegacy ? 8 : 2,
    status: completedLegacy ? "COMPLETED" : "IN_PROGRESS",
    stages,
    startedAt: nowIso(),
    completedAt: completedLegacy ? nowIso() : null,
  };
}

function normalizeOnboarding(onboarding: any, employeeStatus?: string) {
  if (!onboarding || !Array.isArray(onboarding.stages) || onboarding.stages.length < 8) {
    return buildDefaultOnboarding(employeeStatus);
  }
  return onboarding;
}

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
    const onboarding = normalizeOnboarding(e.onboarding, e.status);
    return {
      id: _id,
      ...rest,
      onboarding,
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
      .sort({ createdAt: -1, _id: 1 })
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
  employeeTan?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankBranch?: string | null;
  investmentDeclarations?: Record<string, unknown>;
  employeePan?: string | null;
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

  const normalizedEmail = input.email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail })
    .select("_id")
    .lean();
  if (existingUser) {
    throw AppError.conflict(
      "An account with this login email already exists. Use the existing employee record or a different email.",
    );
  }

  const user = await User.create({
    email: normalizedEmail,
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
    employeeTan: input.employeeTan ?? null,
    bankAccountNumber: input.bankAccountNumber ?? null,
    bankIfscCode: input.bankIfscCode ?? null,
    bankBranch: input.bankBranch ?? null,
    investmentDeclarations: input.investmentDeclarations ?? {},
    employeePan: input.employeePan ?? null,
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
    probationStartDate:
      input.probationPeriodMonths && input.probationPeriodMonths > 0
        ? input.dateOfJoining
        : null,
    probationEndDate:
      input.probationPeriodMonths && input.probationPeriodMonths > 0
        ? (() => {
            const date = new Date(input.dateOfJoining);
            date.setMonth(date.getMonth() + input.probationPeriodMonths);
            return date.toISOString();
          })()
        : null,
    probationReminderSentAt: null,

    // New employees stay in the onboarding lifecycle until all 8 stages
    // are completed. This keeps account creation separate from activation.
    status: "ONBOARDING",
    onboarding: {
      currentStage: 2,
      status: "IN_PROGRESS",
      stages: EMPLOYEE_ONBOARDING_STAGES.map((name, index) => ({
        stage: index + 1,
        name,
        status: index === 0 ? "COMPLETED" : "PENDING",
        completedAt: index === 0 ? now : null,
        completedBy: null,
        remarks: null,
      })),
      startedAt: now,
      completedAt: null,
    },

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
  employeePan?: string | null;
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

export async function updateOnboardingStage(
  id: string,
  stageNumber: number,
  completedBy: string,
  remarks?: string | null,
) {
  const current = await Employee.findById(id).lean<any>();
  if (!current) return undefined;

  const onboarding = normalizeOnboarding(current.onboarding, current.status);

  if (stageNumber < 2 || stageNumber > 7) {
    throw new Error("Only onboarding stages 2 through 7 can be completed individually.");
  }

  if (current.status !== "ONBOARDING") {
    throw new Error("Only employees in ONBOARDING status can update onboarding stages.");
  }

  const currentStage = Number(onboarding.currentStage || 2);
  if (stageNumber !== currentStage) {
    throw new Error(`Complete onboarding stage ${currentStage} before stage ${stageNumber}.`);
  }

  const now = nowIso();
  const stages = onboarding.stages.map((stage: any) => {
    if (stage.stage === stageNumber) {
      return {
        ...stage,
        status: "COMPLETED",
        completedAt: now,
        completedBy,
        remarks: typeof remarks === "string" && remarks.trim() ? remarks.trim() : null,
      };
    }
    if (stage.stage === stageNumber + 1) {
      return { ...stage, status: "IN_PROGRESS" };
    }
    return stage;
  });

  const updated = await Employee.findByIdAndUpdate(
    id,
    {
      $set: {
        onboarding: {
          ...onboarding,
          currentStage: stageNumber + 1,
          status: "IN_PROGRESS",
          startedAt: onboarding.startedAt ?? now,
          stages,
        },
        updatedAt: now,
      },
    },
    { new: true },
  ).lean();

  return enrichEmployee(updated);
}

export async function completeOnboarding(id: string, completedBy: string) {
  const current = await Employee.findById(id).lean<any>();
  if (!current) return undefined;

  const onboarding = normalizeOnboarding(current.onboarding, current.status);
  const priorStagesComplete = onboarding.stages
    .filter((stage: any) => stage.stage < 8)
    .every((stage: any) => stage.status === "COMPLETED");

  if (current.status !== "ONBOARDING") {
    throw new Error("Only employees in ONBOARDING status can complete onboarding.");
  }

  if (!priorStagesComplete) {
    const nextStage = onboarding.stages.find((stage: any) => stage.status !== "COMPLETED")?.stage ?? 8;
    throw new Error(`Complete onboarding stage ${nextStage} before activation.`);
  }

  const now = nowIso();
  const probationMonths = Number(current.probationPeriodMonths ?? 0);
  const probationStartDate = probationMonths > 0
    ? (current.probationStartDate ?? current.dateOfJoining ?? now)
    : null;
  const probationEndDate = probationStartDate && probationMonths > 0
    ? (() => {
        const date = new Date(probationStartDate);
        date.setMonth(date.getMonth() + probationMonths);
        return date.toISOString();
      })()
    : null;

  const updatedOnboarding = {
    ...onboarding,
    currentStage: 8,
    status: "COMPLETED",
    completedAt: now,
    stages: onboarding.stages.map((stage: any) =>
      stage.stage === 8
        ? { ...stage, status: "COMPLETED", completedAt: now, completedBy, remarks: stage.remarks ?? null }
        : { ...stage, status: "COMPLETED" },
    ),
  };

  const updated = await Employee.findByIdAndUpdate(
    id,
    {
      $set: {
        onboarding: updatedOnboarding,
        status: probationMonths > 0 ? "ON_PROBATION" : "ACTIVE",
        probationStartDate,
        probationEndDate,
        updatedAt: now,
      },
    },
    { new: true },
  ).lean();

  return enrichEmployee(updated);
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
        employeeTan: merged.employeeTan ?? null,
        bankAccountNumber: merged.bankAccountNumber ?? null,
        bankIfscCode: merged.bankIfscCode ?? null,
        bankBranch: merged.bankBranch ?? null,
        investmentDeclarations:
          merged.investmentDeclarations ?? current.investmentDeclarations ?? {},
        employeePan: merged.employeePan ?? null,
        signature: merged.signature ?? null,
        avatarUrl: merged.avatarUrl ?? null,
        education: merged.education ?? current.education ?? [],
        certifications: merged.certifications ?? current.certifications ?? [],
        workHistory: merged.workHistory ?? current.workHistory ?? [],
        skills: merged.skills ?? current.skills ?? [],
        onboarding: merged.onboarding ?? current.onboarding ?? buildDefaultOnboarding(merged.status),
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
