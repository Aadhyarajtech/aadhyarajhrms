import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "@/config/env";
import { validate } from "@/middleware/validate";
import { authenticate } from "@/middleware/auth";
import { AppError } from "@/utils/errors";
import { Department, Designation, Employee, User } from "@/db/models";
import { nowIso } from "@/db/connection";
import { findUserByEmail, findAuthProfile, touchLastLogin, updatePassword } from "./auth.repository";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
  confirmPassword: z.string().min(1, "Please confirm your password."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

function signToken(profile: { id: string; email: string; role: string; employeeId: string | null }) {
  return jwt.sign(
    { userId: profile.id, employeeId: profile.employeeId, email: profile.email, role: profile.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as any }
  );
}

function serializeProfile(p: NonNullable<Awaited<ReturnType<typeof findAuthProfile>>>) {
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

authRouter.post("/register", validate(registerSchema), async (req, res, next) => {
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

    let department = await Department.findOne({}).sort({ createdAt: 1 }).lean();
    let designation = await Designation.findOne({}).sort({ createdAt: 1 }).lean();
    if (!department) {
      department = await Department.create({
        name: "General",
        code: "GEN",
        description: "Default department created for self-registered employees.",
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

    await Employee.create({
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

    res.status(201).json({ message: "Registration successful. You can now sign in." });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user || !user.isActive) {
      throw AppError.unauthorized("We couldn't find an active account with that email and password.");
    }
    const matches = bcrypt.compareSync(password, user.passwordHash);
    if (!matches) {
      throw AppError.unauthorized("We couldn't find an active account with that email and password.");
    }

    const profile = await findAuthProfile(user.id);
    if (!profile) throw AppError.unauthorized();

    await touchLastLogin(user.id);
    const token = signToken({ id: user.id, email: user.email, role: user.role, employeeId: profile.employeeId });

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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Your new password must be at least 8 characters."),
});

authRouter.post("/change-password", authenticate, validate(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
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
});
