import { Employee } from "@/db/models";
import { AppError } from "@/utils/errors";

export type AttendanceScopeRole =
  | "SUPER_ADMIN"
  | "HR_ADMIN"
  | "MANAGER"
  | "RECRUITER"
  | "FINANCE"
  | "IT_SUPPORT"
  | "EMPLOYEE";

export interface AttendanceScopeUser {
  userId: string;
  employeeId?: string | null;
  role: AttendanceScopeRole;
}

export interface AttendanceScope {
  mode: "OVERALL" | "EMPLOYEE";
  employeeIds: string[];
  employeeId: string | null;
  label: string;
}

// ============================================================
// GET CURRENT EMPLOYEE
// ============================================================
//
// Find the Employee using the authenticated User ID first.
// We intentionally do NOT filter isArchived here.
//
// This allows us to distinguish:
//   1. Employee does not exist
//   2. Employee exists but is archived
//   3. Employee exists and is active
//
// The caller decides whether an archived employee is allowed
// to access Attendance analytics.
//

async function getCurrentEmployee(user: AttendanceScopeUser) {
  console.log(
    "========== ATTENDANCE SCOPE DEBUG ==========",
  );

  console.log("User ID:", user.userId);
  console.log("JWT Employee ID:", user.employeeId);
  console.log("Role:", user.role);

  // ----------------------------------------------------------
  // 1. PRIMARY: User -> Employee relationship
  // ----------------------------------------------------------

  const employeeByUserId = await Employee.findOne({
    userId: user.userId,
  });

  if (employeeByUserId) {
    console.log("Employee found using userId:", {
      id: employeeByUserId._id,
      userId: employeeByUserId.userId,
      name: `${employeeByUserId.firstName} ${employeeByUserId.lastName}`,
      isArchived: employeeByUserId.isArchived,
    });

    console.log(
      "=============================================",
    );

    return employeeByUserId;
  }

  // ----------------------------------------------------------
  // 2. FALLBACK: JWT employeeId
  // ----------------------------------------------------------

  if (user.employeeId) {
    const employeeById = await Employee.findOne({
      _id: user.employeeId,
    });

    if (employeeById) {
      console.log("Employee found using JWT employeeId:", {
        id: employeeById._id,
        userId: employeeById.userId,
        name: `${employeeById.firstName} ${employeeById.lastName}`,
        isArchived: employeeById.isArchived,
      });

      console.log(
        "=============================================",
      );

      return employeeById;
    }
  }

  // ----------------------------------------------------------
  // 3. Employee does not exist
  // ----------------------------------------------------------

  console.log("Employee found: null");

  console.log(
    "=============================================",
  );

  throw AppError.notFound(
    "Employee profile not found for the current user.",
  );
}

export async function resolveAttendanceScope(
  user: AttendanceScopeUser,
  requestedEmployeeId?: string,
): Promise<AttendanceScope> {
  // ============================================================
  // SUPER ADMIN
  // ============================================================

  if (user.role === "SUPER_ADMIN") {
    // Selected employee
    if (requestedEmployeeId) {
      const employee = await Employee.findOne({
        _id: requestedEmployeeId,
        isArchived: { $ne: true },
      });

      if (!employee) {
        throw AppError.notFound(
          "Employee not found or employee is archived.",
        );
      }

      return {
        mode: "EMPLOYEE",
        employeeIds: [employee._id],
        employeeId: employee._id,
        label: `${employee.firstName} ${employee.lastName}`,
      };
    }

    // All active employees
    const employees = await Employee.find({
      isArchived: { $ne: true },
    }).select("_id");

    return {
      mode: "OVERALL",
      employeeIds: employees.map(
        (employee) => employee._id,
      ),
      employeeId: null,
      label: "All Employees",
    };
  }

  // ============================================================
  // HR ADMIN
  // ============================================================

  if (user.role === "HR_ADMIN") {
    // Selected employee
    if (requestedEmployeeId) {
      const employee = await Employee.findOne({
        _id: requestedEmployeeId,
        isArchived: { $ne: true },
      });

      if (!employee) {
        throw AppError.forbidden(
          "Employee not found, archived, or access denied.",
        );
      }

      return {
        mode: "EMPLOYEE",
        employeeIds: [employee._id],
        employeeId: employee._id,
        label: `${employee.firstName} ${employee.lastName}`,
      };
    }

    // All active employees
    const employees = await Employee.find({
      isArchived: { $ne: true },
    }).select("_id");

    return {
      mode: "OVERALL",
      employeeIds: employees.map(
        (employee) => employee._id,
      ),
      employeeId: null,
      label: "All Employees",
    };
  }

  // ============================================================
  // MANAGER
  // ============================================================

  if (user.role === "MANAGER") {
    const currentEmployee = await getCurrentEmployee(user);


    const team = await Employee.find({
      managerId: currentEmployee._id,
      isArchived: { $ne: true },
    }).select("_id firstName lastName");

    const teamIds = team.map(
      (employee) => employee._id,
    );

    // Selected team employee
    if (requestedEmployeeId) {
      const employee = team.find(
        (item) =>
          String(item._id) ===
          String(requestedEmployeeId),
      );

      if (!employee) {
        throw AppError.forbidden(
          "Employee is outside your team or is archived.",
        );
      }

      return {
        mode: "EMPLOYEE",
        employeeIds: [employee._id],
        employeeId: employee._id,
        label: `${employee.firstName} ${employee.lastName}`,
      };
    }

    // Entire active team
    return {
      mode: "OVERALL",
      employeeIds: teamIds,
      employeeId: null,
      label: "My Team",
    };
  }

  // ============================================================
  // EMPLOYEE
  // ============================================================

  if (user.role === "EMPLOYEE") {
    const currentEmployee = await getCurrentEmployee(user);

    // Employee exists but has been archived
   

    // Employee can only access their own attendance
    if (
      requestedEmployeeId &&
      String(requestedEmployeeId) !==
        String(currentEmployee._id)
    ) {
      throw AppError.forbidden(
        "You can only access your own attendance.",
      );
    }

    return {
      mode: "EMPLOYEE",
      employeeIds: [currentEmployee._id],
      employeeId: currentEmployee._id,
      label: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
    };
  }

  // ============================================================
  // RECRUITER / FINANCE / IT SUPPORT
  // ============================================================

  if (
    user.role === "RECRUITER" ||
    user.role === "FINANCE" ||
    user.role === "IT_SUPPORT"
  ) {
    const currentEmployee = await getCurrentEmployee(user);

    // Employee exists but has been archived
  

    // These roles can access their own attendance only
    if (
      requestedEmployeeId &&
      String(requestedEmployeeId) !==
        String(currentEmployee._id)
    ) {
      throw AppError.forbidden(
        "You can only access your own attendance.",
      );
    }

    return {
      mode: "EMPLOYEE",
      employeeIds: [currentEmployee._id],
      employeeId: currentEmployee._id,
      label: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
    };
  }

  // ============================================================
  // UNKNOWN ROLE
  // ============================================================

  throw AppError.forbidden(
    "You do not have access to Attendance analytics.",
  );
}