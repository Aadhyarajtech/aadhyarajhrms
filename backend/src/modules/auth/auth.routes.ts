import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "@/config/env";
import { validate } from "@/middleware/validate";
import { authenticate } from "@/middleware/auth";
import { AppError } from "@/utils/errors";
import { findUserByEmail, findAuthProfile, touchLastLogin, updatePassword } from "./auth.repository";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
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
