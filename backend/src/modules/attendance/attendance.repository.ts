import {
  Attendance,
  AttendanceRegularizationRequest,
  Employee,
  User,
  Department,
} from "@/db/models";
import { nowIso } from "@/db/connection";
import { notify } from "@/modules/notifications/notifications.repository";
import {
  sendRegularizationDecisionEmail,
} from "@/services/email.service";
import { AppError } from "@/utils/errors";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function toApiRecord(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// ===========================================================================
// TODAY
// ===========================================================================

export async function getTodayRecord(employeeId: string) {
  const row = await Attendance.findOne({
    employeeId,
    date: todayDateString(),
  }).lean();

  return toApiRecord(row);
}

// ===========================================================================
// CHECK IN
// ===========================================================================

export async function checkIn(employeeId: string) {
  const existing = await getTodayRecord(employeeId);

  if (existing) return existing;

  const now = nowIso();

  await Attendance.create({
    employeeId,
    date: todayDateString(),
    checkIn: now,
    status: "PRESENT",
    createdAt: now,
  });

  return getTodayRecord(employeeId);
}

// ===========================================================================
// CHECK OUT
// ===========================================================================

export async function checkOut(employeeId: string) {
  const existing = (await getTodayRecord(employeeId)) as any;

  if (!existing || !existing.checkIn) {
    return undefined;
  }

  const now = new Date();

  const checkInTime = new Date(existing.checkIn);

  const hours =
    Math.round(
      ((now.getTime() - checkInTime.getTime()) / 3_600_000) * 100,
    ) / 100;

  await Attendance.updateOne(
    { _id: existing.id },
    {
      $set: {
        checkOut: now.toISOString(),
        workHours: hours,
      },
    },
  );

  return getTodayRecord(employeeId);
}

// ===========================================================================
// LIST EMPLOYEE ATTENDANCE
// ===========================================================================

export async function listForEmployee(
  employeeId: string,
  month?: number,
  year?: number,
) {
  const now = new Date();

  const m = month ?? now.getMonth() + 1;
  const y = year ?? now.getFullYear();

  const prefix = `${y}-${String(m).padStart(2, "0")}-`;

  const rows = await Attendance.find({
    employeeId,
    date: { $regex: `^${prefix}` },
  })
    .sort({ date: 1 })
    .lean();

  return rows.map(toApiRecord);
}

// ===========================================================================
// LIST ATTENDANCE BY DATE
// ===========================================================================

export async function listForDate(
  date: string,
  managerId?: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid attendance date.");
  }

  let employeeIds: string[] | undefined;

  // If a managerId is provided, restrict results to direct reports.
  if (managerId) {
    const employees = await Employee.find({
      managerId,
      status: "ACTIVE",
    })
      .select("_id")
      .lean();

    employeeIds = employees.map(
      (employee) => employee._id,
    );

    if (employeeIds.length === 0) {
      return [];
    }
  }

  const query: Record<string, any> = {
    date,
  };

  if (employeeIds) {
    query.employeeId = {
      $in: employeeIds,
    };
  }

  const rows = await Attendance.find(query)
    .sort({ checkIn: 1 })
    .lean();

  if (rows.length === 0) {
    return [];
  }

  const attendanceEmployeeIds = [
    ...new Set(rows.map((r) => r.employeeId)),
  ];

  const employees = await Employee.find({
    _id: {
      $in: attendanceEmployeeIds,
    },
  }).lean();

  const empMap = new Map(
    employees.map((e) => [e._id, e]),
  );

  const departmentIds = [
    ...new Set(
      employees
        .map((e) => e.departmentId)
        .filter(Boolean),
    ),
  ];

  const departments = await Department.find({
    _id: {
      $in: departmentIds,
    },
  }).lean();

  const deptMap = new Map(
    departments.map((d) => [d._id, d]),
  );

  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);

    const { _id, ...rest } = r;

    return {
      id: _id,
      ...rest,

      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode: emp?.employeeCode ?? null,

      departmentName: emp
        ? (deptMap.get(emp.departmentId)?.name ?? null)
        : null,
    };
  });
}

// ===========================================================================
// TODAY SUMMARY
// ===========================================================================

export async function getTodaySummary() {
  const today = todayDateString();

  const recentRow = await Attendance.findOne({
    date: { $lte: today },
  })
    .sort({ date: -1 })
    .lean();

  const date = recentRow?.date ?? today;

  const [present, total] = await Promise.all([
    Attendance.countDocuments({
      date,
      status: {
        $in: [
          "PRESENT",
          "WORK_FROM_HOME",
          "HALF_DAY",
        ],
      },
    }),

    Employee.countDocuments({
      status: "ACTIVE",
    }),
  ]);

  return {
    present,
    total,
    date,
    isToday: date === today,
  };
}

// ===========================================================================
// REQUEST REGULARIZATION
// ===========================================================================

export async function requestRegularization(
  employeeId: string,
  date: string,
  note: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid attendance date.");
  }

  const reason = note.trim();

  if (!reason) {
    throw new Error("Regularization reason is required.");
  }

  if (reason.length > 1000) {
    throw new Error(
      "Regularization reason must not exceed 1000 characters.",
    );
  }

  const existingPending =
    await AttendanceRegularizationRequest.findOne({
      employeeId,
      date,
      status: "PENDING",
    }).lean();

  if (existingPending) {
    throw AppError.conflict(
      "A regularization request is already pending for this date.",
    );
  }

  const attendance = await Attendance.findOne({
    employeeId,
    date,
  }).lean();

  const requestedCheckIn = attendance?.checkIn ?? null;
  const requestedCheckOut = attendance?.checkOut ?? null;
  const requestedStatus = attendance?.status ?? "PRESENT";
  const now = nowIso();

  const request =
    await AttendanceRegularizationRequest.create({
      employeeId,
      attendanceId: attendance?._id ?? null,
      date,
      requestedCheckIn,
      requestedCheckOut,
      requestedStatus,
      reason,
      status: "PENDING",
      approverId: null,
      decisionNote: null,
      requestedAt: now,
      decidedAt: null,
    });

  const employee = await Employee.findById(employeeId)
    .select(
      "_id userId firstName lastName employeeCode managerId",
    )
    .lean();

  if (!employee) {
    console.error(
      "[Regularization] Employee not found:",
      employeeId,
    );

    return toApiRecord(request.toObject());
  }

  const employeeName =
    `${employee.firstName} ${employee.lastName}`.trim();

  const message =
    `${employeeName} has submitted an attendance regularization request for ${date}.`;

  // -------------------------------------------------------------------------
  // Notify employee's manager
  // -------------------------------------------------------------------------

  if (employee.managerId) {
    try {
      const manager = await Employee.findById(
        employee.managerId,
      )
        .select("_id userId firstName lastName")
        .lean();

      if (manager?.userId) {
        try {
          await notify({
            userId: manager.userId,
            type: "ATTENDANCE_REGULARIZATION_REQUEST",
            title: "New Regularization Request",
            message,
            link: "/app/attendance?tab=exceptions",

          });

          console.log(
            "[Regularization] Manager notification created:",
            manager.userId,
          );
        } catch (error) {
          console.error(
            "[Regularization] Manager notification failed:",
            error,
          );
        }
      }
    } catch (error) {
      console.error(
        "[Regularization] Failed to load manager:",
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Notify all active HR Admins and Super Admins
  // -------------------------------------------------------------------------

  try {
    const approverUsers = await User.find({
      role: {
        $in: ["HR_ADMIN", "SUPER_ADMIN"],
      },
      isActive: true,
    })
      .select("_id email role")
      .lean();

    console.log(
      "[Regularization] HR/Super Admin recipients:",
      approverUsers.map((user) => ({
        userId: user._id,
        email: user.email,
        role: user.role,
      })),
    );

    if (approverUsers.length === 0) {
      console.warn(
        "[Regularization] No active HR_ADMIN or SUPER_ADMIN users found.",
      );
    }

    for (const approver of approverUsers) {
      try {
        await notify({
          userId: approver._id,
          type: "ATTENDANCE_REGULARIZATION_REQUEST",
          title: "New Regularization Request",
          message,
          link: "/app/attendance?tab=exceptions",
        });

        console.log(
          `[Regularization] ${approver.role} notification created for ${approver._id}`,
        );
      } catch (error) {
        console.error(
          `[Regularization] Failed to notify ${approver.role}:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error(
      "[Regularization] Failed to load HR/Super Admin users:",
      error,
    );
  }

  return toApiRecord(request.toObject());
}

// ===========================================================================
// TEAM REGULARIZATION REQUESTS
// ===========================================================================


export async function listTeamRegularizationRequests(
  managerId: string,
  status?: string,
  includeAll = false,
) {
  const employees = await Employee.find(
    includeAll
      ? {}
      : {
          managerId,
        },
  )
    .select(
      "_id firstName lastName employeeCode departmentId",
    )
    .lean();

  if (employees.length === 0) {
    return [];
  }

  const employeeIds = employees.map(
    (employee) => employee._id,
  );

  const query: Record<string, any> = {
    employeeId: {
      $in: employeeIds,
    },
  };

  if (status) {
    const allowedStatuses = [
      "PENDING",
      "APPROVED",
      "REJECTED",
      "CANCELLED",
    ];

    if (!allowedStatuses.includes(status)) {
      throw new Error(
        "Invalid regularization request status.",
      );
    }

    query.status = status;
  }

  const requests =
    await AttendanceRegularizationRequest.find(query)
      .sort({ requestedAt: -1 })
      .lean();

  const employeeMap = new Map(
    employees.map((employee) => [
      employee._id,
      employee,
    ]),
  );

  return requests.map((request) => {
    const employee = employeeMap.get(
      request.employeeId,
    );

    return {
      ...toApiRecord(request),

      firstName:
        employee?.firstName ?? null,

      lastName:
        employee?.lastName ?? null,

      employeeCode:
        employee?.employeeCode ?? null,
    };
  });
}
// ===========================================================================
// APPROVE REGULARIZATION
// ===========================================================================

export async function approveRegularization(
  requestId: string,
  managerId: string,
  decisionNote = "",
  includeAll = false,
) {
  const request =
    await AttendanceRegularizationRequest.findOne({
      _id: requestId,
      status: "PENDING",
    }).lean();

  if (!request) {
    throw new Error(
      "Pending regularization request not found.",
    );
  }

 const employee = await Employee.findOne(
  includeAll
    ? {
        _id: request.employeeId,
      }
    : {
        _id: request.employeeId,
        managerId,
      },
).lean();
  if (!employee) {
    throw new Error(
      "You are not authorized to approve this regularization request.",
    );
  }

  const now = nowIso();

  const note = decisionNote.trim();

  let attendance = request.attendanceId
    ? await Attendance.findOne({
        _id: request.attendanceId,
      }).lean()
    : await Attendance.findOne({
        employeeId: request.employeeId,
        date: request.date,
      }).lean();

  if (attendance) {
    await Attendance.updateOne(
      {
        _id: attendance._id,
      },
      {
        $set: {
          checkIn: request.requestedCheckIn,
          checkOut: request.requestedCheckOut,
          status: request.requestedStatus,
          isRegularized: true,
          note: request.reason,
        },
      },
    );
  } else {
    attendance =
      await Attendance.create({
        employeeId: request.employeeId,
        date: request.date,
        checkIn: request.requestedCheckIn,
        checkOut: request.requestedCheckOut,
        status: request.requestedStatus,
        isRegularized: true,
        note: request.reason,
        createdAt: now,
      });
  }

  const updatedRequest =
    await AttendanceRegularizationRequest.findOneAndUpdate(
      {
        _id: requestId,
        status: "PENDING",
      },
      {
        $set: {
          status: "APPROVED",
          approverId: managerId,
          decisionNote: note || null,
          decidedAt: now,
        },
      },
      {
        new: true,
      },
    ).lean();

  if (!updatedRequest) {
    throw new Error(
      "Regularization request was already processed.",
    );
  }

  // -------------------------------------------------------------------------
  // Notify employee about approval
  //
  // Notification/email failures must NOT make an already-approved
  // regularization fail.
  // -------------------------------------------------------------------------

  const employeeUser = await Employee.findById(
    updatedRequest.employeeId,
  )
    .select(
      "userId firstName lastName",
    )
    .lean();

  if (employeeUser?.userId) {
    try {
      await notify({
        userId: employeeUser.userId,
        type: "ATTENDANCE_REGULARIZATION_DECISION",
        title: "Regularization Approved",
        message: `Your attendance regularization request for ${updatedRequest.date} has been approved.`,
        link: "/app/attendance",
      });
    } catch (error) {
      console.error(
        "[Regularization Notification] Failed to notify employee:",
        error,
      );
    }

    try {
      const employeeAccount = await User.findById(
        employeeUser.userId,
      )
        .select("email")
        .lean();

      if (employeeAccount?.email) {
        void sendRegularizationDecisionEmail({
          to: employeeAccount.email,
          employeeName: `${employeeUser.firstName} ${employeeUser.lastName}`,
          date: updatedRequest.date,
          status: "APPROVED",
          decisionNote: updatedRequest.decisionNote,
        }).catch((error) => {
          console.error(
            "[Regularization Email] Failed to notify employee:",
            error,
          );
        });
      }
    } catch (error) {
      console.error(
        "[Regularization Email] Failed to load employee email:",
        error,
      );
    }
  }

  return {
    request: toApiRecord(updatedRequest),
    attendance: toApiRecord(attendance),
  };
}

// ===========================================================================
// REJECT REGULARIZATION
// ===========================================================================

export async function rejectRegularization(
  requestId: string,
  managerId: string,
  decisionNote: string,
  includeAll = false,
) {
  const note = decisionNote.trim();

  if (!note) {
    throw new Error(
      "A rejection reason is required.",
    );
  }

  if (note.length > 1000) {
    throw new Error(
      "Rejection reason must not exceed 1000 characters.",
    );
  }

  const request =
    await AttendanceRegularizationRequest.findOne({
      _id: requestId,
      status: "PENDING",
    }).lean();

  if (!request) {
    throw new Error(
      "Pending regularization request not found.",
    );
  }

  const employee = await Employee.findOne(
  includeAll
    ? {
        _id: request.employeeId,
      }
    : {
        _id: request.employeeId,
        managerId,
      },
).lean();
  if (!employee) {
    throw new Error(
      "You are not authorized to reject this regularization request.",
    );
  }

  const updatedRequest =
    await AttendanceRegularizationRequest.findOneAndUpdate(
      {
        _id: requestId,
        status: "PENDING",
      },
      {
        $set: {
          status: "REJECTED",
          approverId: managerId,
          decisionNote: note,
          decidedAt: nowIso(),
        },
      },
      {
        new: true,
      },
    ).lean();

  if (!updatedRequest) {
    throw new Error(
      "Regularization request was already processed.",
    );
  }

  // -------------------------------------------------------------------------
  // Notify employee about rejection
  //
  // Notification/email failures must NOT make an already-rejected
  // regularization fail.
  // -------------------------------------------------------------------------

  const employeeUser = await Employee.findById(
    updatedRequest.employeeId,
  )
    .select(
      "userId firstName lastName",
    )
    .lean();

  if (employeeUser?.userId) {
    try {
      await notify({
        userId: employeeUser.userId,
        type: "ATTENDANCE_REGULARIZATION_DECISION",
        title: "Regularization Rejected",
        message: `Your attendance regularization request for ${updatedRequest.date} has been rejected. Reason: ${note}`,
        link: "/app/attendance",
      });
    } catch (error) {
      console.error(
        "[Regularization Notification] Failed to notify employee:",
        error,
      );
    }

    try {
      const employeeAccount = await User.findById(
        employeeUser.userId,
      )
        .select("email")
        .lean();

      if (employeeAccount?.email) {
        void sendRegularizationDecisionEmail({
          to: employeeAccount.email,
          employeeName: `${employeeUser.firstName} ${employeeUser.lastName}`,
          date: updatedRequest.date,
          status: "REJECTED",
          decisionNote: updatedRequest.decisionNote,
        }).catch((error) => {
          console.error(
            "[Regularization Email] Failed to notify employee:",
            error,
          );
        });
      }
    } catch (error) {
      console.error(
        "[Regularization Email] Failed to load employee email:",
        error,
      );
    }
  }

  return toApiRecord(updatedRequest);
}

// ===========================================================================
// MONTHLY ATTENDANCE TREND
// ===========================================================================

export async function getMonthlyAttendanceTrend(
  months = 6,
  managerId?: string,
) {
  if (
    !Number.isInteger(months) ||
    months < 1 ||
    months > 24
  ) {
    throw new Error(
      "Months must be an integer between 1 and 24.",
    );
  }

  let employeeIds: string[] | undefined;

  // Restrict Manager analytics to active direct reports only.
  if (managerId) {
    const employees = await Employee.find({
      managerId,
      status: "ACTIVE",
    })
      .select("_id")
      .lean();

    employeeIds = employees.map(
      (employee) => employee._id,
    );

    if (employeeIds.length === 0) {
      return Array.from(
        { length: months },
        (_, index) => {
          const today = new Date();

          const d = new Date(
            today.getFullYear(),
            today.getMonth() -
              (months - 1 - index),
            1,
          );

          return {
            month: d.toLocaleString("en-IN", {
              month: "short",
            }),
            presentRate: 0,
          };
        },
      );
    }
  }

  const query: Record<string, any> = {};

  if (employeeIds) {
    query.employeeId = {
      $in: employeeIds,
    };
  }

  const rows = await Attendance.find(query)
    .select(
      "employeeId date status",
    )
    .lean();

  const result: {
    month: string;
    presentRate: number;
  }[] = [];

  const today = new Date();

  for (
    let i = months - 1;
    i >= 0;
    i--
  ) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth() - i,
      1,
    );

    const monthKey = `${d.getFullYear()}-${String(
      d.getMonth() + 1,
    ).padStart(2, "0")}`;

    const monthRows = rows.filter(
      (r) => r.date.startsWith(monthKey),
    );

    const presentCount =
      monthRows.filter((r) =>
        [
          "PRESENT",
          "WORK_FROM_HOME",
          "HALF_DAY",
        ].includes(r.status),
      ).length;

    const rate = monthRows.length
      ? Math.round(
          (presentCount / monthRows.length) * 100,
        )
      : 0;

    result.push({
      month: d.toLocaleString("en-IN", {
        month: "short",
      }),
      presentRate: rate,
    });
  }

  return result;
}

// ===========================================================================
// AI ATTENDANCE INSIGHTS
// ===========================================================================
// Uses the startDate and endDate selected by the employee.
//
// Same date:
//   startDate = 2026-09-04
//   endDate   = 2026-09-04
//
// Range:
//   startDate = 2026-09-01
//   endDate   = 2026-09-04
//
// ===========================================================================

export async function getAiAttendanceInsights(
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  // -------------------------------------------------------------------------
  // Validate date format
  // -------------------------------------------------------------------------

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    throw new Error("Invalid attendance date range.");
  }

  // -------------------------------------------------------------------------
  // Validate date values
  // -------------------------------------------------------------------------

  const parsedStart = new Date(
    `${startDate}T00:00:00.000Z`,
  );

  const parsedEnd = new Date(
    `${endDate}T00:00:00.000Z`,
  );

  if (
    Number.isNaN(parsedStart.getTime()) ||
    Number.isNaN(parsedEnd.getTime())
  ) {
    throw new Error("Invalid attendance date range.");
  }

  // -------------------------------------------------------------------------
  // Validate order
  // -------------------------------------------------------------------------

  if (startDate > endDate) {
    throw new Error(
      "End date cannot be before start date.",
    );
  }

  // -------------------------------------------------------------------------
  // Get employee
  // -------------------------------------------------------------------------

  const employee = await Employee.findById(
    employeeId,
  )
    .select(
      "_id firstName lastName employeeCode dateOfJoining dateOfExit",
    )
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  // -------------------------------------------------------------------------
  // Respect employee employment period
  // -------------------------------------------------------------------------

  const effectiveStart =
    startDate < employee.dateOfJoining
      ? employee.dateOfJoining
      : startDate;

  const effectiveEnd =
    employee.dateOfExit &&
    endDate > employee.dateOfExit
      ? employee.dateOfExit
      : endDate;

  // Employee was not employed during selected period
  if (effectiveStart > effectiveEnd) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: [
        "No attendance data is available for the selected period.",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Get attendance records
  // -------------------------------------------------------------------------

  const records = await Attendance.find({
    employeeId,

    date: {
      $gte: effectiveStart,
      $lte: effectiveEnd,
    },
  })
    .sort({ date: 1 })
    .lean();

  // -------------------------------------------------------------------------
  // No attendance records
  // -------------------------------------------------------------------------

  if (!records.length) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: [
        "No attendance data is available for the selected date range.",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Status counts
  // -------------------------------------------------------------------------

  const presentDays = records.filter(
    (r) => r.status === "PRESENT",
  ).length;

  const wfhDays = records.filter(
    (r) => r.status === "WORK_FROM_HOME",
  ).length;

  const leaveDays = records.filter(
    (r) => r.status === "ON_LEAVE",
  ).length;

  const absentDays = records.filter(
    (r) => r.status === "ABSENT",
  ).length;

  const halfDays = records.filter(
    (r) => r.status === "HALF_DAY",
  ).length;

  const regularizedDays = records.filter(
    (r) => r.isRegularized,
  ).length;

  // -------------------------------------------------------------------------
  // Attendance eligibility
  //
  // ON_LEAVE, HOLIDAY and WEEKEND are excluded.
  //
  // Missing records are NOT treated as absent.
  // -------------------------------------------------------------------------

  const eligibleRecords = records.filter(
    (r) =>
      r.status !== "ON_LEAVE" &&
      r.status !== "HOLIDAY" &&
      r.status !== "WEEKEND",
  );

  // -------------------------------------------------------------------------
  // Attendance equivalent
  //
  // PRESENT       = 1
  // WORK_FROM_HOME = 1
  // HALF_DAY      = 0.5
  // ABSENT        = 0
  // -------------------------------------------------------------------------

  const attendanceEquivalent =
    eligibleRecords.reduce(
      (total, record) => {
        if (
          record.status === "PRESENT" ||
          record.status === "WORK_FROM_HOME"
        ) {
          return total + 1;
        }

        if (record.status === "HALF_DAY") {
          return total + 0.5;
        }

        return total;
      },
      0,
    );

  const attendanceRate =
    eligibleRecords.length > 0
      ? Math.round(
          (attendanceEquivalent /
            eligibleRecords.length) *
            100,
        )
      : 0;

  // -------------------------------------------------------------------------
  // Working hours
  // -------------------------------------------------------------------------

  const workingRecords = records.filter(
    (r) =>
      (
        r.status === "PRESENT" ||
        r.status === "WORK_FROM_HOME" ||
        r.status === "HALF_DAY"
      ) &&
      r.workHours !== null &&
      r.workHours !== undefined,
  );

  const totalHours =
    workingRecords.reduce(
      (sum, record) =>
        sum + Number(record.workHours ?? 0),
      0,
    );

  const averageWorkHours =
    workingRecords.length > 0
      ? Math.round(
          (totalHours /
            workingRecords.length) *
            100,
        ) / 100
      : 0;

  // -------------------------------------------------------------------------
  // Timing analysis
  //
  // IMPORTANT:
  // We do NOT assume a universal 9:30 AM / 5:30 PM schedule.
  //
  // Therefore:
  // - lateCheckIns = 0
  // - earlyCheckOuts = 0
  //
  // until actual employee shift/grace-period data is available.
  // -------------------------------------------------------------------------

  const lateCheckIns = 0;
  const lateCheckInRate = 0;

  const earlyCheckOuts = 0;
  const earlyCheckoutRate = 0;

  // -------------------------------------------------------------------------
  // Missing checkout
  // -------------------------------------------------------------------------

  const missingCheckoutDays =
    workingRecords.filter(
      (r) =>
        r.checkIn &&
        !r.checkOut,
    ).length;

  // -------------------------------------------------------------------------
  // Trend calculation
  // -------------------------------------------------------------------------

  let recentRate = attendanceRate;
  let previousRate = attendanceRate;
  let trendChange = 0;

  let trendDirection:
    | "IMPROVING"
    | "DECLINING"
    | "STABLE" = "STABLE";

  if (
    startDate !== endDate &&
    eligibleRecords.length >= 2
  ) {
    const midpoint =
      parsedStart.getTime() +
      (
        parsedEnd.getTime() -
        parsedStart.getTime()
      ) / 2;

    const previousRecords =
      eligibleRecords.filter(
        (record) =>
          new Date(
            `${record.date}T00:00:00.000Z`,
          ).getTime() < midpoint,
      );

    const recentRecords =
      eligibleRecords.filter(
        (record) =>
          new Date(
            `${record.date}T00:00:00.000Z`,
          ).getTime() >= midpoint,
      );

    const calculateRate = (
      items: typeof eligibleRecords,
    ) => {
      if (!items.length) {
        return 0;
      }

      const equivalent =
        items.reduce(
          (total, record) => {
            if (
              record.status === "PRESENT" ||
              record.status ===
                "WORK_FROM_HOME"
            ) {
              return total + 1;
            }

            if (
              record.status === "HALF_DAY"
            ) {
              return total + 0.5;
            }

            return total;
          },
          0,
        );

      return Math.round(
        (equivalent /
          items.length) *
          100,
      );
    };

    if (
      previousRecords.length > 0 &&
      recentRecords.length > 0
    ) {
      previousRate =
        calculateRate(previousRecords);

      recentRate =
        calculateRate(recentRecords);

      trendChange =
        recentRate - previousRate;

      // Stable if change is less than 2 percentage points
      if (trendChange >= 2) {
        trendDirection = "IMPROVING";
      } else if (trendChange <= -2) {
        trendDirection = "DECLINING";
      } else {
        trendDirection = "STABLE";
      }
    }
  }

  // -------------------------------------------------------------------------
  // Patterns
  // -------------------------------------------------------------------------

  const patterns: {
    type:
      | "POSITIVE"
      | "WARNING"
      | "INFO";

    title: string;
    description: string;
  }[] = [];

  const recommendations: string[] = [];

  // -------------------------------------------------------------------------
  // Attendance pattern
  // -------------------------------------------------------------------------

  if (attendanceRate >= 90) {
    patterns.push({
      type: "POSITIVE",

      title: "Strong attendance",

      description:
        `Your attendance rate is ${attendanceRate}%, indicating a consistent attendance pattern.`,
    });
  } else if (attendanceRate >= 75) {
    patterns.push({
      type: "INFO",

      title: "Moderate attendance",

      description:
        `Your attendance rate is ${attendanceRate}%. There is some room to improve consistency.`,
    });
  } else {
    patterns.push({
      type: "WARNING",

      title: "Attendance needs attention",

      description:
        `Your attendance rate is ${attendanceRate}%, which indicates lower attendance consistency during the selected period.`,
    });

    recommendations.push(
      "Try to maintain consistent attendance and review any recorded absence patterns.",
    );
  }

  // -------------------------------------------------------------------------
  // Working hours
  // -------------------------------------------------------------------------

  if (averageWorkHours >= 8) {
    patterns.push({
      type: "POSITIVE",

      title: "Healthy working hours",

      description:
        `Your average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  } else if (averageWorkHours > 0) {
    patterns.push({
      type: "INFO",

      title: "Working hours",

      description:
        `Your average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  }

  // -------------------------------------------------------------------------
  // Missing checkout
  // -------------------------------------------------------------------------

  if (missingCheckoutDays > 0) {
    patterns.push({
      type: "WARNING",

      title: "Missing checkout records",

      description:
        `${missingCheckoutDays} working day(s) have a check-in but no check-out.`,
    });

    recommendations.push(
      "Remember to check out at the end of your workday so your working hours are recorded accurately.",
    );
  }

  // -------------------------------------------------------------------------
  // Regularization
  // -------------------------------------------------------------------------

  if (regularizedDays > 2) {
    patterns.push({
      type: "INFO",

      title: "Regularization activity",

      description:
        `${regularizedDays} attendance record(s) were regularized during this period.`,
    });

    recommendations.push(
      "Try to record your attendance correctly on the day itself to reduce the need for regularization.",
    );
  }

  // -------------------------------------------------------------------------
  // Improving trend
  // -------------------------------------------------------------------------

  if (trendDirection === "IMPROVING") {
    patterns.push({
      type: "POSITIVE",

      title: "Attendance is improving",

      description:
        `Your recent attendance rate improved by ${trendChange} percentage points compared with the earlier period.`,
    });
  }

  // -------------------------------------------------------------------------
  // Declining trend
  // -------------------------------------------------------------------------

  if (trendDirection === "DECLINING") {
    patterns.push({
      type: "WARNING",

      title: "Attendance trend is declining",

      description:
        `Your recent attendance rate decreased by ${Math.abs(
          trendChange,
        )} percentage points.`,
    });

    recommendations.push(
      "Pay attention to your recent attendance pattern and try to maintain consistency.",
    );
  }

  // -------------------------------------------------------------------------
  // WFH
  // -------------------------------------------------------------------------

  if (wfhDays > 0) {
    patterns.push({
      type: "INFO",

      title: "Work-from-home usage",

      description:
        `You recorded ${wfhDays} work-from-home day(s) during the selected period.`,
    });
  }

  // -------------------------------------------------------------------------
  // Leave
  // -------------------------------------------------------------------------

  if (leaveDays > 0) {
    patterns.push({
      type: "INFO",

      title: "Leave records",

      description:
        `${leaveDays} leave day(s) were recorded during the selected period.`,
    });
  }

  // -------------------------------------------------------------------------
  // Default recommendation
  // -------------------------------------------------------------------------

  if (!recommendations.length) {
    recommendations.push(
      "Your attendance pattern looks healthy. Continue maintaining your current consistency.",
    );
  }

  // -------------------------------------------------------------------------
  // Final response
  // -------------------------------------------------------------------------

  return {
    period: {
      start: startDate,
      end: endDate,
      daysAnalyzed: records.length,
    },

    summary: {
      attendanceRate,
      presentDays,
      wfhDays,
      leaveDays,
      absentDays,
      halfDays,
      averageWorkHours,
      regularizedDays,
    },

    timing: {
      lateCheckIns,
      lateCheckInRate,
      earlyCheckOuts,
      earlyCheckoutRate,
      missingCheckoutDays,
    },

    trend: {
      direction: trendDirection,
      change: trendChange,
      recentRate,
      previousRate,
    },

    patterns,

    recommendations,
  };

}
// ===========================================================================
// AI ATTENDANCE INSIGHTS - MULTI EMPLOYEE
// ===========================================================================
// Used by management views.
//
// employeeIds:
//   [employeeId]     -> selected employee
//   [id1, id2, ...]  -> overall/team analytics
//
// Existing getAiAttendanceInsights() remains unchanged.
// ===========================================================================

export async function getAiAttendanceInsightsForEmployees(
  employeeIds: string[],
  startDate: string,
  endDate: string,
) {
  if (!employeeIds.length) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: [
        "No employees are available for attendance analysis.",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Validate dates
  // -------------------------------------------------------------------------

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    throw new Error("Invalid attendance date range.");
  }

  if (startDate > endDate) {
    throw new Error(
      "End date cannot be before start date.",
    );
  }

  // -------------------------------------------------------------------------
  // Get employees
  // -------------------------------------------------------------------------

  const employees = await Employee.find({
    _id: {
      $in: employeeIds,
    },
  })
    .select(
      "_id firstName lastName employeeCode dateOfJoining dateOfExit",
    )
    .lean();

  if (!employees.length) {
    return {
      period: {
        start: startDate,
        end: endDate,
        daysAnalyzed: 0,
      },

      summary: {
        attendanceRate: 0,
        presentDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        absentDays: 0,
        halfDays: 0,
        averageWorkHours: 0,
        regularizedDays: 0,
      },

      timing: {
        lateCheckIns: 0,
        lateCheckInRate: 0,
        earlyCheckOuts: 0,
        earlyCheckoutRate: 0,
        missingCheckoutDays: 0,
      },

      trend: {
        direction: "STABLE" as const,
        change: 0,
        recentRate: 0,
        previousRate: 0,
      },

      patterns: [],

      recommendations: [
        "No attendance data is available for the selected employees.",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Get attendance records
  // -------------------------------------------------------------------------

  const records = await Attendance.find({
    employeeId: {
      $in: employees.map((employee) => employee._id),
    },

    date: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({
      date: 1,
    })
    .lean();

  // -------------------------------------------------------------------------
  // Employee employment-period filtering
  // -------------------------------------------------------------------------

  const employeeMap = new Map(
    employees.map((employee) => [
      employee._id,
      employee,
    ]),
  );

  const validRecords = records.filter((record) => {
    const employee = employeeMap.get(
      record.employeeId,
    );

    if (!employee) {
      return false;
    }

    if (record.date < employee.dateOfJoining) {
      return false;
    }

    if (
      employee.dateOfExit &&
      record.date > employee.dateOfExit
    ) {
      return false;
    }

    return true;
  });

  // -------------------------------------------------------------------------
  // Status counts
  // -------------------------------------------------------------------------

  const presentDays = validRecords.filter(
    (r) => r.status === "PRESENT",
  ).length;

  const wfhDays = validRecords.filter(
    (r) => r.status === "WORK_FROM_HOME",
  ).length;

  const leaveDays = validRecords.filter(
    (r) => r.status === "ON_LEAVE",
  ).length;

  const absentDays = validRecords.filter(
    (r) => r.status === "ABSENT",
  ).length;

  const halfDays = validRecords.filter(
    (r) => r.status === "HALF_DAY",
  ).length;

  const regularizedDays = validRecords.filter(
    (r) => r.isRegularized,
  ).length;

  // -------------------------------------------------------------------------
  // Attendance eligibility
  //
  // ON_LEAVE, HOLIDAY and WEEKEND are excluded.
  // Missing records are NOT treated as absent.
  // -------------------------------------------------------------------------

  const eligibleRecords = validRecords.filter(
    (r) =>
      r.status !== "ON_LEAVE" &&
      r.status !== "HOLIDAY" &&
      r.status !== "WEEKEND",
  );

  // -------------------------------------------------------------------------
  // Attendance equivalent
  //
  // PRESENT        = 1
  // WORK_FROM_HOME = 1
  // HALF_DAY       = 0.5
  // ABSENT         = 0
  // -------------------------------------------------------------------------

  const attendanceEquivalent =
    eligibleRecords.reduce(
      (total, record) => {
        if (
          record.status === "PRESENT" ||
          record.status === "WORK_FROM_HOME"
        ) {
          return total + 1;
        }

        if (record.status === "HALF_DAY") {
          return total + 0.5;
        }

        return total;
      },
      0,
    );

  const attendanceRate =
    eligibleRecords.length > 0
      ? Math.round(
          (attendanceEquivalent /
            eligibleRecords.length) *
            100,
        )
      : 0;

  // -------------------------------------------------------------------------
  // Working hours
  // -------------------------------------------------------------------------

  const workingRecords = validRecords.filter(
    (r) =>
      (
        r.status === "PRESENT" ||
        r.status === "WORK_FROM_HOME" ||
        r.status === "HALF_DAY"
      ) &&
      r.workHours !== null &&
      r.workHours !== undefined,
  );

  const totalHours =
    workingRecords.reduce(
      (sum, record) =>
        sum + Number(record.workHours ?? 0),
      0,
    );

  const averageWorkHours =
    workingRecords.length > 0
      ? Math.round(
          (totalHours /
            workingRecords.length) *
            100,
        ) / 100
      : 0;

  // -------------------------------------------------------------------------
  // Timing
  //
  // We intentionally do not assume a universal shift time.
  // -------------------------------------------------------------------------

  const lateCheckIns = 0;
  const lateCheckInRate = 0;

  const earlyCheckOuts = 0;
  const earlyCheckoutRate = 0;

  // -------------------------------------------------------------------------
  // Missing checkout
  // -------------------------------------------------------------------------

  const missingCheckoutDays =
    workingRecords.filter(
      (r) =>
        r.checkIn &&
        !r.checkOut,
    ).length;

  // -------------------------------------------------------------------------
  // Trend
  // -------------------------------------------------------------------------

  let recentRate = attendanceRate;
  let previousRate = attendanceRate;
  let trendChange = 0;

  let trendDirection:
    | "IMPROVING"
    | "DECLINING"
    | "STABLE" = "STABLE";

  if (
    startDate !== endDate &&
    eligibleRecords.length >= 2
  ) {
    const startTime =
      new Date(
        `${startDate}T00:00:00.000Z`,
      ).getTime();

    const endTime =
      new Date(
        `${endDate}T00:00:00.000Z`,
      ).getTime();

    const midpoint =
      startTime +
      (endTime - startTime) / 2;

    const previousRecords =
      eligibleRecords.filter(
        (record) =>
          new Date(
            `${record.date}T00:00:00.000Z`,
          ).getTime() < midpoint,
      );

    const recentRecords =
      eligibleRecords.filter(
        (record) =>
          new Date(
            `${record.date}T00:00:00.000Z`,
          ).getTime() >= midpoint,
      );

    const calculateRate = (
      items: typeof eligibleRecords,
    ) => {
      if (!items.length) {
        return 0;
      }

      const equivalent =
        items.reduce(
          (total, record) => {
            if (
              record.status === "PRESENT" ||
              record.status === "WORK_FROM_HOME"
            ) {
              return total + 1;
            }

            if (
              record.status === "HALF_DAY"
            ) {
              return total + 0.5;
            }

            return total;
          },
          0,
        );

      return Math.round(
        (equivalent /
          items.length) *
          100,
      );
    };

    if (
      previousRecords.length &&
      recentRecords.length
    ) {
      previousRate =
        calculateRate(previousRecords);

      recentRate =
        calculateRate(recentRecords);

      trendChange =
        recentRate - previousRate;

      if (trendChange >= 2) {
        trendDirection = "IMPROVING";
      } else if (trendChange <= -2) {
        trendDirection = "DECLINING";
      } else {
        trendDirection = "STABLE";
      }
    }
  }

  // -------------------------------------------------------------------------
  // Patterns
  // -------------------------------------------------------------------------

  const patterns: {
    type: "POSITIVE" | "WARNING" | "INFO";
    title: string;
    description: string;
  }[] = [];

  const recommendations: string[] = [];

  if (attendanceRate >= 90) {
    patterns.push({
      type: "POSITIVE",
      title: "Strong overall attendance",
      description:
        `The selected employee group has an overall attendance rate of ${attendanceRate}%.`,
    });
  } else if (attendanceRate >= 75) {
    patterns.push({
      type: "INFO",
      title: "Moderate overall attendance",
      description:
        `The selected employee group has an overall attendance rate of ${attendanceRate}%.`,
    });
  } else {
    patterns.push({
      type: "WARNING",
      title: "Attendance needs attention",
      description:
        `The selected employee group has an overall attendance rate of ${attendanceRate}%.`,
    });

    recommendations.push(
      "Review attendance patterns for employees with repeated absences or half-days.",
    );
  }

  if (averageWorkHours >= 8) {
    patterns.push({
      type: "POSITIVE",
      title: "Healthy working hours",
      description:
        `Average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  } else if (averageWorkHours > 0) {
    patterns.push({
      type: "INFO",
      title: "Working hours",
      description:
        `Average recorded working time is ${averageWorkHours} hours per working day.`,
    });
  }

  if (missingCheckoutDays > 0) {
    patterns.push({
      type: "WARNING",
      title: "Missing checkout records",
      description:
        `${missingCheckoutDays} working day(s) have a check-in but no check-out.`,
    });

    recommendations.push(
      "Review missing checkout records and remind employees to complete their attendance.",
    );
  }

  if (regularizedDays > 0) {
    patterns.push({
      type: "INFO",
      title: "Regularization activity",
      description:
        `${regularizedDays} attendance record(s) were regularized during this period.`,
    });
  }

  if (trendDirection === "IMPROVING") {
    patterns.push({
      type: "POSITIVE",
      title: "Attendance is improving",
      description:
        `Recent attendance improved by ${trendChange} percentage points.`,
    });
  }

  if (trendDirection === "DECLINING") {
    patterns.push({
      type: "WARNING",
      title: "Attendance trend is declining",
      description:
        `Recent attendance decreased by ${Math.abs(
          trendChange,
        )} percentage points.`,
    });

    recommendations.push(
      "Review recent attendance trends and identify employees who may need attention.",
    );
  }

  if (wfhDays > 0) {
    patterns.push({
      type: "INFO",
      title: "Work-from-home usage",
      description:
        `${wfhDays} work-from-home attendance record(s) were recorded.`,
    });
  }

  if (leaveDays > 0) {
    patterns.push({
      type: "INFO",
      title: "Leave records",
      description:
        `${leaveDays} leave day(s) were recorded.`,
    });
  }

  if (!recommendations.length) {
    recommendations.push(
      "Overall attendance looks healthy. Continue monitoring consistency and attendance exceptions.",
    );
  }

  return {
    period: {
      start: startDate,
      end: endDate,
      daysAnalyzed: validRecords.length,
    },

    summary: {
      attendanceRate,
      presentDays,
      wfhDays,
      leaveDays,
      absentDays,
      halfDays,
      averageWorkHours,
      regularizedDays,
    },

    timing: {
      lateCheckIns,
      lateCheckInRate,
      earlyCheckOuts,
      earlyCheckoutRate,
      missingCheckoutDays,
    },

    trend: {
      direction: trendDirection,
      change: trendChange,
      recentRate,
      previousRate,
    },

    patterns,

    recommendations,
  };
}