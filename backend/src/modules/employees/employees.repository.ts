import bcrypt from "bcryptjs";
import { Employee, User, Department, Designation } from "@/db/models";
import { nowIso } from "@/db/connection";

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

export async function listDirectReports(managerId: string) {
  const rows = await Employee.find({ managerId }).sort({ firstName: 1 }).lean();
  return enrichEmployees(rows);
}

async function nextEmployeeCode(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await Employee.countDocuments({});
  const seq = count + 1;
  return `ART-${year}-${String(seq).padStart(4, "0")}`;
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
}

export async function createEmployee(input: CreateEmployeeInput) {
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(input.temporaryPassword, 10);
  const employeeCode = await nextEmployeeCode();

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

    status:
      input.probationPeriodMonths && input.probationPeriodMonths > 0
        ? "ON_PROBATION"
        : "ACTIVE",

    dateOfJoining: input.dateOfJoining,
    isArchived: false,
    archivedAt: null,
    offboardingChecklist: null,
    createdAt: now,
    updatedAt: now,
  });

  return getEmployeeById(employee._id);
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  gender?: string | null;
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
  probationReminderSentAt?: string | null;
  status?: string;
  phone?: string;
  personalEmail?: string;
  address?: string;
  city?: string;
  state?: string | null;
  country?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  signatureUrl?: string | null;

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

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  const current = await Employee.findById(id).lean();
  if (!current) return undefined;

  const merged = { ...current, ...input };
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
        probationReminderSentAt:
          merged.probationEndDate !== current.probationEndDate ||
          merged.probationStartDate !== current.probationStartDate
            ? null
            : (current.probationReminderSentAt ?? null),
        status: merged.status,
        gender: merged.gender ?? null,
        dateOfBirth: merged.dateOfBirth ?? null,
        phone: merged.phone ?? null,
        personalEmail: merged.personalEmail ?? null,
        address: merged.address ?? null,
        city: merged.city ?? null,
        state: merged.state ?? null,
        country: merged.country ?? "India",
        emergencyContactName: merged.emergencyContactName ?? null,
        emergencyContactPhone: merged.emergencyContactPhone ?? null,
        avatarUrl: merged.avatarUrl ?? null,
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
          merged.status === "NOTICE_PERIOD"
            ? current.status === "NOTICE_PERIOD" && current.offboardingChecklist
              ? current.offboardingChecklist
              : {
                  assetReturn: false,
                  accessRevoked: false,
                  exitInterview: false,
                  finalSettlement: false,
                  completedAt: null,
                }
            : (merged.offboardingChecklist ??
              current.offboardingChecklist ??
              null),

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
  const roots: any[] = [];

  for (const emp of byId.values()) {
    if (emp.managerId && byId.has(emp.managerId)) {
      byId.get(emp.managerId)!.directReports.push(emp);
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
  const designations = await Designation.find({ level: { $gte: 4 } }).lean();
  const designationIds = designations.map((d) => d._id);
  const desMap = new Map(designations.map((d) => [d._id, d]));
  const rows = await Employee.find({
    designationId: { $in: designationIds },
    status: "ACTIVE",
  })
    .sort({ firstName: 1 })
    .lean();

  const seen = new Set<string>();
  const result: any[] = [];
  for (const e of rows) {
    if (seen.has(e._id)) continue;
    seen.add(e._id);
    result.push({
      id: e._id,
      firstName: e.firstName,
      lastName: e.lastName,
      designationTitle: desMap.get(e.designationId)?.title ?? null,
    });
  }
  return result;
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
