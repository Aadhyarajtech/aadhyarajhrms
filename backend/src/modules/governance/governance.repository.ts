import { AuditLog } from "@/db/models";
import { nowIso } from "@/db/connection";
import {
  GovernancePolicy,
  GovernanceRole,
  type GovernanceRoleDoc,
} from "./governance.model";

export const PERMISSION_CATALOG = [
  { key: "employees.view", module: "Employees", action: "View" },
  { key: "employees.manage", module: "Employees", action: "Manage" },
  { key: "attendance.view", module: "Attendance", action: "View" },
  { key: "attendance.manage", module: "Attendance", action: "Manage" },
  { key: "leave.view", module: "Leave", action: "View" },
  { key: "leave.manage", module: "Leave", action: "Manage" },
  { key: "payroll.view", module: "Payroll", action: "View" },
  { key: "payroll.manage", module: "Payroll", action: "Manage" },
  { key: "recruitment.view", module: "Recruitment", action: "View" },
  { key: "recruitment.manage", module: "Recruitment", action: "Manage" },
  { key: "performance.view", module: "Performance", action: "View" },
  { key: "performance.manage", module: "Performance", action: "Manage" },
  { key: "documents.view", module: "Documents & Assets", action: "View" },
  { key: "documents.manage", module: "Documents & Assets", action: "Manage" },
  { key: "tickets.view", module: "Tickets", action: "View" },
  { key: "tickets.manage", module: "Tickets", action: "Manage" },
  { key: "announcements.view", module: "Announcements", action: "View" },
  { key: "announcements.manage", module: "Announcements", action: "Manage" },
  { key: "reports.view", module: "Reports & Analytics", action: "View" },
  { key: "reports.export", module: "Reports & Analytics", action: "Export" },
  { key: "organization.manage", module: "Organization", action: "Manage" },
  { key: "settings.manage", module: "Settings", action: "Manage" },
  { key: "governance.manage", module: "Governance", action: "Manage" },
] as const;

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSION_CATALOG.map((p) => p.key),
  HR_ADMIN: PERMISSION_CATALOG.filter((p) => p.key !== "payroll.manage").map(
    (p) => p.key,
  ),
  MANAGER: [
    "employees.view",
    "attendance.view",
    "attendance.manage",
    "leave.view",
    "leave.manage",
    "performance.view",
    "performance.manage",
    "tickets.view",
    "tickets.manage",
    "announcements.view",
    "reports.view",
  ],
  RECRUITER: [
    "employees.view",
    "recruitment.view",
    "recruitment.manage",
    "documents.view",
    "tickets.view",
    "announcements.view",
    "reports.view",
  ],
  FINANCE: [
    "employees.view",
    "attendance.view",
    "leave.view",
    "payroll.view",
    "payroll.manage",
    "reports.view",
    "reports.export",
    "announcements.view",
  ],
  IT_SUPPORT: [
    "employees.view",
    "documents.view",
    "tickets.view",
    "tickets.manage",
    "announcements.view",
  ],
  EMPLOYEE: [
    "employees.view",
    "attendance.view",
    "leave.view",
    "payroll.view",
    "documents.view",
    "tickets.view",
    "announcements.view",
    "performance.view",
  ],
};

const DEFAULT_ROLE_META: Record<
  string,
  { label: string; description: string }
> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    description: "Full system governance and configuration access.",
  },
  HR_ADMIN: {
    label: "HR Admin",
    description:
      "HR operations, people management and organization administration.",
  },
  MANAGER: {
    label: "Manager",
    description:
      "Team-level workforce, leave, attendance and performance access.",
  },
  RECRUITER: {
    label: "Recruiter",
    description: "Recruitment lifecycle and candidate management access.",
  },
  FINANCE: {
    label: "Finance",
    description: "Payroll, finance reporting and related employee data access.",
  },
  IT_SUPPORT: {
    label: "IT Support",
    description: "IT support, tickets and assigned employee/document access.",
  },
  EMPLOYEE: {
    label: "Employee",
    description: "Self-service employee access to permitted HRMS features.",
  },
};

export const DEFAULT_POLICIES = [
  {
    key: "security.enforceStrongPasswords",
    label: "Enforce strong passwords",
    description: "Require passwords to be at least 8 characters long.",
    type: "BOOLEAN",
    value: true,
    category: "SECURITY",
  },
  {
    key: "workflow.requireLeaveApproval",
    label: "Require leave approval",
    description:
      "Leave requests must be approved by an authorized manager or HR administrator.",
    type: "BOOLEAN",
    value: true,
    category: "WORKFLOW",
  },
  {
    key: "workflow.requireAttendanceRegularizationApproval",
    label: "Require attendance regularization approval",
    description:
      "Attendance regularization changes require an approval workflow.",
    type: "BOOLEAN",
    value: true,
    category: "WORKFLOW",
  },
  {
    key: "workflow.requirePayrollApproval",
    label: "Require payroll approval before payment",
    description:
      "Payroll runs must be reviewed and approved before being marked paid.",
    type: "BOOLEAN",
    value: true,
    category: "WORKFLOW",
  },
  {
    key: "hrPolicy.allowEmployeeSelfRegistration",
    label: "Allow employee self-registration",
    description:
      "Allow new employees to create an account through the registration flow.",
    type: "BOOLEAN",
    value: true,
    category: "HR_POLICY",
  },
  {
    key: "governance.enableAuditLogging",
    label: "Enable governance audit logging",
    description: "Record governance and permission changes in the audit log.",
    type: "BOOLEAN",
    value: true,
    category: "GOVERNANCE",
  },
  {
    key: "governance.sessionTimeoutMinutes",
    label: "Session timeout (minutes)",
    description:
      "Target session timeout for future session-policy enforcement.",
    type: "NUMBER",
    value: 60,
    category: "SECURITY",
  },
] as const;

function toApi(doc: any) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function ensureDefaults() {
  const now = nowIso();
  await Promise.all(
    Object.entries(DEFAULT_PERMISSIONS).map(async ([role, permissions]) => {
      const meta = DEFAULT_ROLE_META[role];
      await GovernanceRole.updateOne(
        { role },
        {
          $setOnInsert: {
            role,
            label: meta.label,
            description: meta.description,
            permissions,
            isSystem: true,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    }),
  );
  await Promise.all(
    DEFAULT_POLICIES.map((policy) =>
      GovernancePolicy.updateOne(
        { key: policy.key },
        { $setOnInsert: { ...policy, updatedBy: null, updatedAt: now } },
        { upsert: true },
      ),
    ),
  );
}

export async function getGovernance() {
  await ensureDefaults();
  const [roles, policies] = await Promise.all([
    GovernanceRole.find({}).sort({ role: 1 }).lean(),
    GovernancePolicy.find({}).sort({ category: 1, label: 1 }).lean(),
  ]);
  return {
    roles: roles.map(toApi),
    policies: policies.map(toApi),
    permissions: PERMISSION_CATALOG,
  };
}

export async function updateRole(
  role: string,
  permissions: string[],
  actorId: string,
) {
  const current = await GovernanceRole.findOne({ role }).lean();
  if (!current) return undefined;
  const allowed = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));
  const nextPermissions = [...new Set(permissions)].filter((permission) =>
    allowed.has(permission),
  );
  if (role === "SUPER_ADMIN") {
    throw new Error("Super Admin permissions cannot be reduced.");
  }
  const now = nowIso();
  await GovernanceRole.updateOne(
    { role },
    { $set: { permissions: nextPermissions, updatedAt: now } },
  );
  await AuditLog.create({
    userId: actorId,
    action: "GOVERNANCE_ROLE_PERMISSIONS_UPDATED",
    entity: "GovernanceRole",
    entityId: current._id,
    metadata: JSON.stringify({ role, permissions: nextPermissions }),
    ipAddress: null,
    createdAt: now,
  });
  return getRole(role);
}

export async function getRole(role: string) {
  const doc = await GovernanceRole.findOne({ role }).lean();
  return doc ? toApi(doc) : undefined;
}

export async function updatePolicies(
  updates: Array<{ key: string; value: boolean | number | string }>,
  actorId: string,
) {
  const known = new Map<string, (typeof DEFAULT_POLICIES)[number]>(
    DEFAULT_POLICIES.map((p) => [p.key, p]),
  );
  const now = nowIso();
  for (const update of updates) {
    const definition = known.get(update.key);
    if (!definition) continue;
    let value: boolean | number | string = update.value;
    if (definition.type === "BOOLEAN") value = Boolean(value);
    if (definition.type === "NUMBER") value = Number(value);
    await GovernancePolicy.updateOne(
      { key: update.key },
      { $set: { value, updatedBy: actorId, updatedAt: now } },
    );
  }
  await AuditLog.create({
    userId: actorId,
    action: "GOVERNANCE_POLICIES_UPDATED",
    entity: "GovernancePolicy",
    entityId: null,
    metadata: JSON.stringify({ keys: updates.map((u) => u.key) }),
    ipAddress: null,
    createdAt: now,
  });
  const { policies } = await getGovernance();
  return policies;
}

export async function getRolePermissions(role: string) {
  await ensureDefaults();
  const doc = await GovernanceRole.findOne({ role }).lean();
  return doc?.permissions ?? [];
}

export async function hasPermission(role: string, permission: string) {
  if (role === "SUPER_ADMIN") return true;
  const permissions = await getRolePermissions(role);
  if (permissions.includes(permission)) return true;
  // Manage access implies view access for the same module.
  if (permission.endsWith(".view")) {
    const managePermission = `${permission.slice(0, -5)}.manage`;
    return permissions.includes(managePermission);
  }
  return false;
}
