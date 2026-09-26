import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import type { AuthUser } from "@/types/express";
import { User, Employee } from "@/db/models";

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token || null;
}

/**
 * Authenticate the current request.
 *
 * The JWT is used only to identify the User.
 * The current role and employee relationship are resolved
 * from MongoDB so that changes made in Employee Management
 * are reflected immediately.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  /*
   * ---------------------------------------------------------
   * 1. Validate Authorization header
   * ---------------------------------------------------------
   */
  if (!header || !header.startsWith("Bearer ")) {
    return next(
      AppError.unauthorized(
        "Missing or malformed Authorization header",
      ),
    );
  }

  const token = getBearerToken(req);

  if (!token) {
    return next(
      AppError.unauthorized("Missing authentication token"),
    );
  }

  let payload: AuthUser;

  /*
   * ---------------------------------------------------------
   * 2. Verify JWT
   * ---------------------------------------------------------
   */
  try {
    const decoded = jwt.verify(token, env.jwtSecret);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as JwtPayload).userId !== "string" ||
      !(decoded as JwtPayload).userId
    ) {
      return next(
        AppError.unauthorized("Invalid authentication token"),
      );
    }

    payload = decoded as AuthUser;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(
        AppError.unauthorized(
          "Authentication token has expired. Please sign in again.",
        ),
      );
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return next(
        AppError.unauthorized(
          "Invalid authentication token. Please sign in again.",
        ),
      );
    }

    return next(
      AppError.unauthorized(
        "Unable to verify authentication token",
      ),
    );
  }

  /*
   * ---------------------------------------------------------
   * 3. Load the current User from MongoDB
   * ---------------------------------------------------------
   *
   * Do not rely on role stored in an old JWT.
   */
  try {
    const user = await User.findById(payload.userId)
      .select("_id email role isActive")
      .lean<any>();

    if (!user) {
      return next(
        AppError.unauthorized("User account not found"),
      );
    }

    /*
     * -------------------------------------------------------
     * 4. Check whether the User account is active
     * -------------------------------------------------------
     */
    if (!user.isActive) {
      return next(
        AppError.unauthorized(
          "Your account is inactive or suspended. Please contact HR.",
        ),
      );
    }

    /*
     * -------------------------------------------------------
     * 5. Find the Employee profile linked to this User
     * -------------------------------------------------------
     *
     * User._id -> Employee.userId
     */
    const employee = await Employee.findOne({
      userId: user._id,
    })
      .select("_id isManager status")
      .lean<any>();

    /*
     * An authenticated employee should have an Employee profile.
     */
    if (!employee) {
      return next(
        AppError.unauthorized(
          "Employee profile is not linked to this user account.",
        ),
      );
    }

    /*
     * -------------------------------------------------------
     * 6. Determine whether this employee is currently a manager
     * -------------------------------------------------------
     *
     * Manager access is granted when ANY of the following
     * conditions is true:
     *
     * A. User.role is MANAGER
     * B. Employee.isManager is true
     * C. The employee has active direct reports
     *
     * This supports existing and newly configured managers
     * without hardcoding individual employees.
     */
    const hasDirectReports = await Employee.exists({
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
    });

    const isCurrentManager =
      user.role === "MANAGER" ||
      employee.isManager === true ||
      !!hasDirectReports;

    /*
     * -------------------------------------------------------
     * 7. Determine effective role
     * -------------------------------------------------------
     *
     * Existing administrator and other roles are preserved.
     *
     * If the employee is identified as a manager through the
     * employee hierarchy, their effective role becomes MANAGER
     * for authorization purposes.
     */
    const effectiveRole =
      user.role === "EMPLOYEE" && isCurrentManager
        ? "MANAGER"
        : user.role;

    /*
     * -------------------------------------------------------
     * 8. Set the current authentication context
     * -------------------------------------------------------
     *
     * employeeId always comes from the current Employee record,
     * not from a potentially stale JWT.
     */
    req.user = {
      userId: String(user._id),
      employeeId: String(employee._id),
      email: user.email,
      role: effectiveRole,
    } as AuthUser;

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Optional authentication.
 *
 * Attaches req.user when a valid JWT is available,
 * but never blocks the request.
 *
 * This is kept compatible with the existing implementation.
 */
export function attachUserIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = getBearerToken(req);

  if (token) {
    try {
      const decoded = jwt.verify(token, env.jwtSecret);

      if (
        typeof decoded === "object" &&
        decoded !== null &&
        typeof (decoded as JwtPayload).userId === "string"
      ) {
        req.user = decoded as AuthUser;
      }
    } catch {
      /*
       * Ignore invalid tokens in optional-auth context.
       */
    }
  }

  next();
}