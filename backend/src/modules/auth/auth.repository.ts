import { User, Employee, Department, Designation } from "@/db/models";
import { nowIso } from "@/db/connection";

export interface UserRow {
  id: string;
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
  passwordResetOtpHash: string | null;
  passwordResetOtpExpiresAt: string | null;
  passwordResetOtpRequestedAt: string | null;
  passwordResetOtpAttempts: number;
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
  isManager: boolean;
}

export async function findUserByEmail(
  email: string,
): Promise<UserRow | undefined> {
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
    passwordResetOtpHash: doc.passwordResetOtpHash ?? null,
    passwordResetOtpExpiresAt: doc.passwordResetOtpExpiresAt ?? null,
    passwordResetOtpRequestedAt: doc.passwordResetOtpRequestedAt ?? null,
    passwordResetOtpAttempts: doc.passwordResetOtpAttempts ?? 0,
  };
}

export async function findAuthProfile(
  userId: string,
): Promise<AuthProfileRow | undefined> {
  const user = await User.findById(userId).lean();
  if (!user) return undefined;

  const employee = await Employee.findOne({ userId }).lean();

  const hasDirectReports = employee
    ? !!(await Employee.exists({
        managerId: employee._id,
        status: {
          $in: [
            "ACTIVE",
            "ON_PROBATION",
            "ON_LEAVE",
            "NOTICE_PERIOD",
            "ON_HOLD",
          ],
        },
      }))
    : false;

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

    passwordResetOtpHash: user.passwordResetOtpHash ?? null,
    passwordResetOtpExpiresAt: user.passwordResetOtpExpiresAt ?? null,
    passwordResetOtpRequestedAt: user.passwordResetOtpRequestedAt ?? null,
    passwordResetOtpAttempts: user.passwordResetOtpAttempts ?? 0,

    employeeId: employee?._id ?? null,
    employeeCode: employee?.employeeCode ?? null,
    firstName: employee?.firstName ?? null,
    lastName: employee?.lastName ?? null,
    avatarUrl: employee?.avatarUrl ?? null,
    departmentId: employee?.departmentId ?? null,
    departmentName,
    designationTitle,
    isManager:
      !!employee &&
      (employee.isManager === true ||
        hasDirectReports ||
        user.role === "MANAGER"),
  };
}

export async function touchLastLogin(userId: string) {
  await User.updateOne(
    { _id: userId },
    { $set: { lastLoginAt: nowIso() } },
  );
}

export async function updatePassword(userId: string, passwordHash: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        passwordHash,
        mustResetPwd: false,
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpRequestedAt: null,
        passwordResetOtpAttempts: 0,
        updatedAt: nowIso(),
      },
    },
  );
}

/**
 * Existing admin password-reset operation.
 *
 * This is intentionally preserved separately from the new credential-update
 * operation below because the reset-password workflow may intentionally force
 * the employee to choose another password after signing in.
 */
export async function adminResetPassword(
  userId: string,
  passwordHash: string,
) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        passwordHash,
        mustResetPwd: true,
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpRequestedAt: null,
        passwordResetOtpAttempts: 0,
        updatedAt: nowIso(),
      },
    },
  );
}

/**
 * Updates an employee's login credentials from an administrator action.
 *
 * The employee document is linked to this User document through `userId`.
 * The password must already be bcrypt-hashed before reaching this function.
 *
 * `mustResetPwd` is set to false because the administrator explicitly supplied
 * the new login password. This means the employee can immediately sign in
 * using the credentials supplied by the administrator.
 */
export async function updateAdminUserCredentials(
  userId: string,
  email: string,
  passwordHash: string,
) {
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  })
    .select("_id")
    .lean();

  if (
    existingUser &&
    String(existingUser._id) !== String(userId)
  ) {
    throw new Error(
      "An account with this email already exists. Please use a different email.",
    );
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        email: normalizedEmail,
        passwordHash,
        mustResetPwd: false,

        // Invalidate any previously issued password-reset OTP.
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpRequestedAt: null,
        passwordResetOtpAttempts: 0,

        updatedAt: nowIso(),
      },
    },
    {
      new: true,
    },
  )
    .select(
      "_id email role isActive mustResetPwd lastLoginAt createdAt updatedAt",
    )
    .lean();

  return updated;
}

export async function savePasswordResetOtp(input: {
  userId: string;
  otpHash: string;
  expiresAt: string;
  requestedAt: string;
}) {
  await User.updateOne(
    { _id: input.userId },
    {
      $set: {
        passwordResetOtpHash: input.otpHash,
        passwordResetOtpExpiresAt: input.expiresAt,
        passwordResetOtpRequestedAt: input.requestedAt,
        passwordResetOtpAttempts: 0,
      },
    },
  );
}

export async function incrementPasswordResetOtpAttempts(userId: string) {
  await User.updateOne(
    { _id: userId },
    { $inc: { passwordResetOtpAttempts: 1 } },
  );
}

export async function clearPasswordResetOtp(userId: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpRequestedAt: null,
        passwordResetOtpAttempts: 0,
        updatedAt: nowIso(),
      },
    },
  );
}
