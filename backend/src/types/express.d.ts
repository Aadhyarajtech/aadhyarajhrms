import "express";

export interface AuthUser {
  userId: string;
  employeeId: string | null;
  email: string;
  role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "RECRUITER" | "FINANCE" | "EMPLOYEE";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
