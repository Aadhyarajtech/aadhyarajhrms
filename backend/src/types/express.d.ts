import "express";

export interface AuthUser {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  role:
    | "SUPER_ADMIN"
    | "HR_ADMIN"
    | "MANAGER"
    | "RECRUITER"
    | "FINANCE"
    | "IT_SUPPORT"
    | "EMPLOYEE";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}