import { User, Employee, Department, Designation } from "@/db/models";
import { nowIso } from "@/db/connection";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "RECRUITER" | "FINANCE" | "EMPLOYEE";
  isActive: boolean;
  mustResetPwd: boolean;
  lastLoginAt: string | null;
}

export interface AuthProfileRow extends UserRow {
  employeeId: string | null;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  departmentId: string | null;
  departmentName: string | null;
  designationTitle: string | null;
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const doc = await User.findOne({ email }).lean();
  if (!doc) return undefined;
  return {
    id: doc._id,
    email: doc.email,
    passwordHash: doc.passwordHash,
    role: doc.role,
    isActive: doc.isActive,
    mustResetPwd: doc.mustResetPwd,
    lastLoginAt: doc.lastLoginAt,
  };
}

export async function findAuthProfile(userId: string): Promise<AuthProfileRow | undefined> {
  const user = await User.findById(userId).lean();
  if (!user) return undefined;

  const employee = await Employee.findOne({ userId }).lean();
  let departmentName: string | null = null;
  let designationTitle: string | null = null;
  if (employee) {
    const [department, designation] = await Promise.all([
      Department.findById(employee.departmentId).lean(),
      Designation.findById(employee.designationId).lean(),
    ]);
    departmentName = department?.name ?? null;
    designationTitle = designation?.title ?? null;
  }

  return {
    id: user._id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustResetPwd: user.mustResetPwd,
    lastLoginAt: user.lastLoginAt,
    passwordHash: user.passwordHash,
    employeeId: employee?._id ?? null,
    employeeCode: employee?.employeeCode ?? null,
    firstName: employee?.firstName ?? null,
    lastName: employee?.lastName ?? null,
    avatarUrl: employee?.avatarUrl ?? null,
    departmentId: employee?.departmentId ?? null,
    departmentName,
    designationTitle,
  };
}

export async function touchLastLogin(userId: string) {
  await User.updateOne({ _id: userId }, { $set: { lastLoginAt: nowIso() } });
}

export async function updatePassword(userId: string, passwordHash: string) {
  await User.updateOne({ _id: userId }, { $set: { passwordHash, mustResetPwd: false, updatedAt: nowIso() } });
}
