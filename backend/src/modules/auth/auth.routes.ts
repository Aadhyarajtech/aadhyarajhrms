import { Router } from "express";
import { createHash, randomInt } from "node:crypto";
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
    isManager: p.isManager,
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
          isManager: p.isManager,
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

authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const profile = await findAuthProfile(req.user!.userId);
    if (!profile) throw AppError.notFound("Account not found.");
    res.json({ user: serializeProfile(profile) });
  } catch (err) {
    next(err);
  }
});

const forgotPasswordEmailSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

const resetPasswordSchema = z
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

const PASSWORD_RESET_OTP_EXPIRY_MINUTES = 10;
const PASSWORD_RESET_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5;

function hashPasswordResetOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

function generatePasswordResetOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Your new password must be at least 8 characters."),
});

/* =========================================================
   PASSWORD RESET - REQUEST OTP
   Public endpoint used by the login page.
========================================================= */

authRouter.post(
  "/forgot-password/request-otp",
  validate(forgotPasswordEmailSchema),
  async (req, res, next) => {
    try {
      const { email } = req.body as z.infer<typeof forgotPasswordEmailSchema>;
      const normalizedEmail = email.toLowerCase().trim();
      const user = await findUserByEmail(normalizedEmail);

      // Do not reveal whether an email exists in the system.
      const genericResponse = {
        message:
          "If an active account exists, an OTP has been sent to your email.",
        expiresInSeconds: PASSWORD_RESET_OTP_EXPIRY_MINUTES * 60,
      };

      if (!user || !user.isActive) {
        return res.json(genericResponse);
      }

      // Match the frontend's 60-second resend countdown and prevent OTP spam.
      if (user.passwordResetOtpRequestedAt) {
        const requestedAt = Date.parse(user.passwordResetOtpRequestedAt);
        if (Number.isFinite(requestedAt)) {
          const elapsed = Date.now() - requestedAt;
          if (elapsed < PASSWORD_RESET_OTP_RESEND_COOLDOWN_MS) {
            return res.json(genericResponse);
          }
        }
      }

      const otp = generatePasswordResetOtp();
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + PASSWORD_RESET_OTP_EXPIRY_MINUTES * 60 * 1000,
      ).toISOString();
      const requestedAt = now.toISOString();

      await savePasswordResetOtp({
        userId: user.id,
        otpHash: hashPasswordResetOtp(otp),
        expiresAt,
        requestedAt,
      });

      try {
        await sendPasswordResetOtpEmail({
          to: user.email,
          otp,
          expiresInMinutes: PASSWORD_RESET_OTP_EXPIRY_MINUTES,
        });
      } catch (emailError) {
        // Do not leave a usable OTP behind when the email could not be sent.
        await clearPasswordResetOtp(user.id);
        throw emailError;
      }

      return res.json(genericResponse);
    } catch (err) {
      next(err);
    }
  },
);

/* =========================================================
   PASSWORD RESET - VERIFY OTP AND SET PASSWORD
========================================================= */

authRouter.post(
  "/forgot-password/reset",
  validate(resetPasswordSchema),
  async (req, res, next) => {
    try {
      const { email, otp, newPassword } = req.body as z.infer<
        typeof resetPasswordSchema
      >;
      const normalizedEmail = email.toLowerCase().trim();
      const user = await findUserByEmail(normalizedEmail);

      if (!user || !user.isActive) {
        throw AppError.badRequest(
          "The OTP is invalid or has expired. Please request a new OTP.",
        );
      }

      if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
        throw AppError.badRequest(
          "The OTP is invalid or has expired. Please request a new OTP.",
        );
      }

      if (user.passwordResetOtpAttempts >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
        await clearPasswordResetOtp(user.id);
        throw AppError.badRequest(
          "Too many incorrect OTP attempts. Please request a new OTP.",
        );
      }

      const expiresAt = Date.parse(user.passwordResetOtpExpiresAt);
      if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
        await clearPasswordResetOtp(user.id);
        throw AppError.badRequest(
          "The OTP is invalid or has expired. Please request a new OTP.",
        );
      }

      const submittedOtpHash = hashPasswordResetOtp(otp);
      if (submittedOtpHash !== user.passwordResetOtpHash) {
        await incrementPasswordResetOtpAttempts(user.id);
        throw AppError.badRequest(
          "The OTP is invalid or has expired. Please request a new OTP.",
        );
      }

      const passwordHash = bcrypt.hashSync(newPassword, 10);
      await updatePassword(user.id, passwordHash);

      return res.json({
        message: "Password reset successfully. You can sign in now.",
      });
    } catch (err) {
      next(err);
    }
  },
);

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
