import { Router } from "express";
import { createHmac, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "@/config/env";
import { validate } from "@/middleware/validate";
import { authenticate } from "@/middleware/auth";
import { AppError } from "@/utils/errors";
import { Department, Designation, Employee, User } from "@/db/models";
import { nowIso } from "@/db/connection";
import {
  findUserByEmail,
  findAuthProfile,
  touchLastLogin,
  updatePassword,
  savePasswordResetOtp,
  incrementPasswordResetOtpAttempts,
  clearPasswordResetOtp,
} from "./auth.repository";
import { notify } from "../notifications/notifications.repository";
import { sendPasswordResetOtpEmail } from "@/services/email.service";
import { employeesRouter } from "../employees/employees.routes";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});



const forgotPasswordRequestSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

const forgotPasswordResetSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit OTP."),
    newPassword: z
      .string()
      .min(8, "Your new password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_OTP_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5;

function hashPasswordResetOtp(email: string, otp: string) {
  return createHmac("sha256", env.jwtSecret)
    .update(`${email}:${otp}`)
    .digest("hex");
}

const registerSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters long."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

function signToken(profile: {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
}) {
  return jwt.sign(
    {
      userId: profile.id,
      employeeId: profile.employeeId,
      email: profile.email,
      role: profile.role,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as any },
  );
}

function serializeProfile(
  p: NonNullable<Awaited<ReturnType<typeof findAuthProfile>>>,
) {
  return {
    id: p.id,
    email: p.email,
    role: p.role,
    isActive: !!p.isActive,
    mustResetPwd: !!p.mustResetPwd,
    employee: p.employeeId
      ? {
          id: p.employeeId,
          employeeCode: p.employeeCode,
          firstName: p.firstName,
          lastName: p.lastName,
          fullName: `${p.firstName} ${p.lastName}`,
          avatarUrl: p.avatarUrl,
          departmentId: p.departmentId,
          departmentName: p.departmentName,
          designationTitle: p.designationTitle,
        }
      : null,
  };
}

authRouter.post(
  "/register",
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body as z.infer<typeof registerSchema>;
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await findUserByEmail(normalizedEmail);
      if (existing) {
        throw AppError.badRequest("An account with this email already exists.");
      }

      const now = nowIso();
      const passwordHash = bcrypt.hashSync(password, 10);
      const user = await User.create({
        email: normalizedEmail,
        passwordHash,
        role: "EMPLOYEE",
        isActive: true,
        mustResetPwd: false,
        createdAt: now,
        updatedAt: now,
      });

      let department = await Department.findOne({})
        .sort({ createdAt: 1 })
        .lean();
      let designation = await Designation.findOne({})
        .sort({ createdAt: 1 })
        .lean();
      if (!department) {
        department = await Department.create({
          name: "General",
          code: "GEN",
          description:
            "Default department created for self-registered employees.",
          colorHex: "#5B4FE5",
          headId: null,
          createdAt: now,
        });
      }
      if (!designation) {
        designation = await Designation.create({
          title: "Employee",
          level: 1,
          departmentId: department._id,
        });
      }
      const employeeCode = `ART-${new Date().getFullYear()}-${String((await Employee.countDocuments({})) + 1).padStart(4, "0")}`;

      const employee = await Employee.create({
        employeeCode,
        userId: user._id,
        firstName: normalizedEmail.split("@")[0] || "Employee",
        lastName: "User",
        gender: null,
        dateOfBirth: null,
        personalEmail: null,
        phone: null,
        address: null,
        city: null,
        state: null,
        country: "India",
        departmentId: department._id,
        designationId: designation._id,
        managerId: null,
        employmentType: "FULL_TIME",
        status: "ACTIVE",
        dateOfJoining: now,
        dateOfExit: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        avatarUrl: null,
        createdAt: now,
        updatedAt: now,
      });

      res
        .status(201)
        .json({ message: "Registration successful. You can now sign in." });
      const hrAdmins = await User.find({
        role: "HR_ADMIN",
        isActive: true,
      })
        .select("_id")
        .lean();
      for (const hrAdmin of hrAdmins) {
        await notify({
          userId: hrAdmin._id,
          type: "SYSTEM",
          title: "New Employee Registered",
          message: `A new employee ${employee.firstName} ${employee.lastName}, has registered. Please assign the Department, Designation and Reporting Manager.`,
          link: `/employees/${employee._id}`,
        });
      }
      res.status(201).json({
        message: "Registration successful. You can sign in.",
      });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user || !user.isActive) {
      throw AppError.unauthorized(
        "We couldn't find an active account with that email and password.",
      );
    }
    const matches = bcrypt.compareSync(password, user.passwordHash);
    if (!matches) {
      throw AppError.unauthorized(
        "We couldn't find an active account with that email and password.",
      );
    }

    const profile = await findAuthProfile(user.id);
    if (!profile) throw AppError.unauthorized();

    await touchLastLogin(user.id);
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: profile.employeeId,
    });

    res.json({ token, user: serializeProfile(profile) });
  } catch (err) {
    next(err);
  }
});



authRouter.post(
  "/forgot-password/request-otp",
  validate(forgotPasswordRequestSchema),
  async (req, res, next) => {
    try {
      const { email } = req.body as z.infer<typeof forgotPasswordRequestSchema>;
      const normalizedEmail = email.toLowerCase().trim();
      const user = await findUserByEmail(normalizedEmail);

      // Always return the same response for unknown/inactive accounts so the
      // endpoint does not disclose whether an email belongs to an account.
      if (!user || !user.isActive) {
        res.json({
          message: "If an active account exists for this email, a password reset OTP has been sent.",
        });
        return;
      }

      const now = Date.now();
      const lastRequestedAt = user.passwordResetOtpRequestedAt
        ? new Date(user.passwordResetOtpRequestedAt).getTime()
        : NaN;

      if (Number.isFinite(lastRequestedAt) && now - lastRequestedAt < PASSWORD_RESET_OTP_COOLDOWN_MS) {
        res.json({
          message: "If an active account exists for this email, a password reset OTP has been sent.",
        });
        return;
      }

      const otp = String(randomInt(100000, 1000000));
      const requestedAt = new Date(now).toISOString();
      const expiresAt = new Date(now + PASSWORD_RESET_OTP_TTL_MS).toISOString();
      const otpHash = hashPasswordResetOtp(normalizedEmail, otp);

      await savePasswordResetOtp({
        userId: user.id,
        otpHash,
        expiresAt,
        requestedAt,
      });

      const emailResult = await sendPasswordResetOtpEmail({
        to: normalizedEmail,
        otp,
        expiresInMinutes: 10,
      });

      if (!emailResult.sent) {
        await clearPasswordResetOtp(user.id);
        throw new AppError(
          "We couldn't send the OTP email. Please check the HRMS SMTP configuration and try again.",
          503,
        );
      }

      res.json({
        message: "If an active account exists for this email, a password reset OTP has been sent.",
        expiresInSeconds: PASSWORD_RESET_OTP_TTL_MS / 1000,
      });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  "/forgot-password/reset",
  validate(forgotPasswordResetSchema),
  async (req, res, next) => {
    try {
      const { email, otp, newPassword } = req.body as z.infer<
        typeof forgotPasswordResetSchema
      >;
      const normalizedEmail = email.toLowerCase().trim();
      const user = await findUserByEmail(normalizedEmail);

      if (!user || !user.isActive) {
        throw AppError.badRequest("The OTP is invalid or has expired. Please request a new OTP.");
      }

      if (user.passwordResetOtpAttempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
        throw AppError.badRequest("Too many incorrect OTP attempts. Please request a new OTP.");
      }

      const expiresAt = user.passwordResetOtpExpiresAt
        ? new Date(user.passwordResetOtpExpiresAt).getTime()
        : NaN;

      if (
        !user.passwordResetOtpHash ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      ) {
        throw AppError.badRequest("The OTP is invalid or has expired. Please request a new OTP.");
      }

      const submittedHash = hashPasswordResetOtp(normalizedEmail, otp);
      if (submittedHash !== user.passwordResetOtpHash) {
        await incrementPasswordResetOtpAttempts(user.id);
        throw AppError.badRequest("The OTP is invalid or has expired. Please request a new OTP.");
      }

      const hash = bcrypt.hashSync(newPassword, 10);
      await updatePassword(user.id, hash);

      res.json({
        message: "Password reset successfully. You can now sign in with your new password.",
      });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const profile = await findAuthProfile(req.user!.userId);
    if (!profile) throw AppError.notFound("Account not found.");
    res.json({ user: serializeProfile(profile) });
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Your new password must be at least 8 characters."),
});

authRouter.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<
        typeof changePasswordSchema
      >;
      const user = await findUserByEmail(req.user!.email);
      if (!user) throw AppError.notFound();
      if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
        throw AppError.badRequest("Your current password is incorrect.");
      }
      const hash = bcrypt.hashSync(newPassword, 10);
      await updatePassword(user.id, hash);
      res.json({ message: "Password updated." });
    } catch (err) {
      next(err);
    }
  },
);
