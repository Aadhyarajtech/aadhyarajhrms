import {
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  Employee,
  CompOffCredit,
  Holiday,
} from "@/db/models";


import { nowIso } from "@/db/connection";
import { AppError } from "@/utils/errors";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function listLeaveTypes() {
  const rows = await LeaveType.find({}).sort({ name: 1 }).lean();
  return rows.map(toApiDoc);
}

export async function getLeaveType(id: string) {
  const row = await LeaveType.findById(id).lean();
  return toApiDoc(row);
}

export async function getOrCreateBalance(
  employeeId: string,
  leaveTypeId: string,
  year: number,
) {
  let row = await LeaveBalance.findOne({
    employeeId,
    leaveTypeId,
    year,
  }).lean();

  if (!row) {
    const leaveType = (await getLeaveType(leaveTypeId)) as any;

    if (!leaveType) {
      throw new Error("Leave type not found.");
    }

    const leaveTypeName = String(
      leaveType.name ?? "",
    )
      .trim()
      .toLowerCase();

      

    /*
     * Only EL / PL supports carry-forward.
     * Comp-Off has its own credit/expiry system.
     */
    const isEarnedLeave =
      leaveTypeName === "earned leave" ||
      leaveTypeName === "el" ||
      leaveTypeName === "privilege leave" ||
      leaveTypeName === "pl" ||
      leaveTypeName.includes("earned") ||
      leaveTypeName.includes("privilege");

    let carriedOver = 0;

    if (isEarnedLeave && year > 2000) {
      const previousBalance =
        await LeaveBalance.findOne({
          employeeId,
          leaveTypeId,
          year: year - 1,
        }).lean();

      if (previousBalance) {
        const previousAvailable =
          Number(previousBalance.allotted ?? 0) -
          Number(previousBalance.used ?? 0);

        /*
         * Requirement:
         * EL / PL carry-forward is capped at 30 days.
         */
        carriedOver = Math.min(
          Math.max(previousAvailable, 0),
          30,
        );
      }
    }

    await LeaveBalance.create({
      _id: undefined,
      employeeId,
      leaveTypeId,
      year,
      allotted:
        Number(leaveType.defaultDaysPerYear ?? 12) +
        carriedOver,
      used: 0,
      carriedOver,
    });

    row = await LeaveBalance.findOne({
      employeeId,
      leaveTypeId,
      year,
    }).lean();
  }

  return toApiDoc(row);
}

export async function getOrCreateCompOffLeaveType() {
  let leaveType = await LeaveType.findOne({
    name: { $regex: /^Compensatory Off$/i },
  }).lean();

  if (!leaveType) {
    const created = await LeaveType.create({
      _id: undefined,
      name: "Compensatory Off",
      colorHex: "#10B981",
      defaultDaysPerYear: 0,
      isPaid: true,
      requiresApproval: true,
    });

    leaveType = await LeaveType.findById(created._id).lean();
  }

  return toApiDoc(leaveType);
}

function addDays(date: string, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

export async function creditCompOff(
  employeeId: string,
  attendanceId: string | null,
  days: number,
) {
  if (days <= 0) {
    throw new Error("Comp-Off days must be greater than zero.");
  }

  const now = nowIso();
  const expiresAt = addDays(now, 30);

  const leaveType = (await getOrCreateCompOffLeaveType()) as any;

  if (!leaveType?.id) {
    throw new Error("Compensatory Off leave type could not be created.");
  }

  const year = new Date(now).getUTCFullYear();

  await getOrCreateBalance(
    employeeId,
    leaveType.id,
    year,
  );

  const credit = await CompOffCredit.create({
    employeeId,
    attendanceId,
    days,
    remainingDays: days,
    creditedAt: now,
    expiresAt,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  await LeaveBalance.updateOne(
    {
      employeeId,
      leaveTypeId: leaveType.id,
      year,
    },
    {
      $inc: {
        allotted: days,
      },
    },
  );

  return {
    id: credit._id,
    employeeId,
    attendanceId,
    days,
    remainingDays: days,
    creditedAt: now,
    expiresAt,
    leaveTypeId: leaveType.id,
  };
}


export async function expireCompOffCredits() {
  const now = nowIso();

  const expiredCredits = await CompOffCredit.find({
    status: "ACTIVE",
    expiresAt: { $lte: now },
    remainingDays: { $gt: 0 },
  }).lean();

  if (expiredCredits.length === 0) {
    return 0;
  }

  for (const credit of expiredCredits) {
    const leaveType = await LeaveType.findOne({
      name: { $regex: /^Compensatory Off$/i },
    }).lean();

    if (!leaveType) continue;

    const year = new Date(credit.creditedAt).getUTCFullYear();

    await LeaveBalance.updateOne(
      {
        employeeId: credit.employeeId,
        leaveTypeId: leaveType._id,
        year,
      },
      {
        $inc: {
          allotted: -credit.remainingDays,
        },
      },
    );

    await CompOffCredit.updateOne(
      { _id: credit._id },
      {
        $set: {
          remainingDays: 0,
          status: "EXPIRED",
          updatedAt: now,
        },
      },
    );
  }

  return expiredCredits.length;

  
}



export async function listCompOffCredits(employeeId: string) {
  await expireCompOffCredits();

  const rows = await CompOffCredit.find({
    employeeId,
  })
    .sort({ expiresAt: 1, creditedAt: -1 })
    .lean();

  return rows.map(toApiDoc);
}

export async function listBalancesForEmployee(
  employeeId: string,
  year: number,
) {
  const types = (await listLeaveTypes()) as any[];

  const balances = [];

  for (const leaveType of types) {
    const balance = (await getOrCreateBalance(
      employeeId,
      leaveType.id,
      year,
    )) as any;

    balances.push({
      ...balance,
      name: leaveType.name,
      colorHex: leaveType.colorHex,
      defaultDaysPerYear:
        leaveType.defaultDaysPerYear,
      isPaid: leaveType.isPaid,
      requiresApproval:
        leaveType.requiresApproval,
    });
  }

  return balances;
}

export async function listRequests(filters: {
  employeeId?: string;
  status?: string;
  approverId?: string;
}) {
  const query: Record<string, any> = {};
  let employeeIdsForApprover: string[] | undefined;

  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.status) query.status = filters.status;
  if (filters.approverId) {
    const reports = await Employee.find({ managerId: filters.approverId })
      .select("_id")
      .lean();
    employeeIdsForApprover = reports.map((r) => r._id);
    query.employeeId = { $in: employeeIdsForApprover };
  }

  const rows = await LeaveRequest.find(query).sort({ appliedAt: -1 }).lean();
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const leaveTypeIds = [...new Set(rows.map((r) => r.leaveTypeId))];
  const [employees, leaveTypes] = await Promise.all([
    Employee.find({ _id: { $in: employeeIds } }).lean(),
    LeaveType.find({ _id: { $in: leaveTypeIds } }).lean(),
  ]);
  const empMap = new Map(employees.map((e) => [e._id, e]));
  const typeMap = new Map(leaveTypes.map((t) => [t._id, t]));

  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const type = typeMap.get(r.leaveTypeId);
    const { _id, ...rest } = r;
    return {
      id: _id,
      ...rest,
      leaveTypeName: type?.name ?? null,
      leaveTypeColor: type?.colorHex ?? null,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode: emp?.employeeCode ?? null,
      avatarUrl: emp?.avatarUrl ?? null,
    };
  });
}
async function calculateLeaveDays(
  startDate: string,
  endDate: string,
): Promise<number> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    throw AppError.badRequest("Invalid leave date range.");
  }

  if (end.getTime() < start.getTime()) {
    throw AppError.badRequest("End date cannot be before start date.");
  }

  const startDateOnly = start.toISOString().slice(0, 10);
  const endDateOnly = end.toISOString().slice(0, 10);

  const holidays = await Holiday.find({
    date: {
      $gte: startDateOnly,
      $lte: endDateOnly,
    },
  })
    .select("date")
    .lean();

  const holidayDates = new Set(
    holidays.map((holiday) =>
      String(holiday.date).slice(0, 10),
    ),
  );

  let totalDays = 0;

  const current = new Date(
    `${startDateOnly}T00:00:00.000Z`,
  );

  const lastDate = new Date(
    `${endDateOnly}T00:00:00.000Z`,
  );

  while (current.getTime() <= lastDate.getTime()) {
    const dateString =
      current.toISOString().slice(0, 10);

    const dayOfWeek = current.getUTCDay();

    const isWeekend =
      dayOfWeek === 0 || dayOfWeek === 6;

    const isHoliday =
      holidayDates.has(dateString);

    if (!isWeekend && !isHoliday) {
      totalDays += 1;
    }

    current.setUTCDate(
      current.getUTCDate() + 1,
    );
  }

  return totalDays;
}

export async function createRequest(input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  halfDayType?: "FIRST_HALF" | "SECOND_HALF" | null;
  reason: string;
})


{

const start = new Date(input.startDate);

if (Number.isNaN(start.getTime())) {
  throw new Error("Invalid leave start date.");
}

  const leaveType = (await getLeaveType(input.leaveTypeId)) as any;

  if (!leaveType) {
    throw new Error("Leave type not found.");
  }

  const normalizedLeaveTypeName = String(
  leaveType.name ?? "",
)
  .trim()
  .toLowerCase();

  const employeeForEligibility =
  await Employee.findById(
    input.employeeId,
  )
    .select("status gender")
    .lean();

if (!employeeForEligibility) {
  throw AppError.notFound(
    "Employee not found.",
  );
}

const employeeStatus = String(
  employeeForEligibility.status ?? "",
)
  .trim()
  .toUpperCase();

const isEarnedLeave =
  normalizedLeaveTypeName ===
    "earned leave" ||
  normalizedLeaveTypeName === "el" ||
  normalizedLeaveTypeName ===
    "privilege leave" ||
  normalizedLeaveTypeName === "pl" ||
  normalizedLeaveTypeName.includes(
    "earned",
  ) ||
  normalizedLeaveTypeName.includes(
    "privilege",
  );

if (
  isEarnedLeave &&
  employeeStatus !== "ACTIVE"
) {
  throw AppError.badRequest(
    "Privilege/EL leave is available only to confirmed active employees.",
  );
}
let totalDays = await calculateLeaveDays(
  input.startDate,
  input.endDate,
);

const isHalfDay = input.halfDay === true;

if (isHalfDay) {
  if (input.halfDayType !== "FIRST_HALF" &&
      input.halfDayType !== "SECOND_HALF") {
    throw AppError.badRequest(
      "Half-day type is required.",
    );
  }

  if (input.startDate !== input.endDate) {
    throw AppError.badRequest(
      "Half-day leave can only be applied for one day.",
    );
  }

  if (totalDays !== 1) {
    throw AppError.badRequest(
      "Selected date is not a working day.",
    );
  }

  totalDays = 0.5;
} else if (input.halfDayType) {
  throw AppError.badRequest(
    "Half-day type is only allowed for half-day leave.",
  );
}

  const isPaternityLeave =
  normalizedLeaveTypeName === "paternity leave" ||
  normalizedLeaveTypeName.includes("paternity");

if (isPaternityLeave) {
  const employee = await Employee.findById(input.employeeId)
    .select("gender")
    .lean();

  if (!employee) {
    throw AppError.notFound("Employee not found.");
  }

  const gender = String(employee.gender ?? "")
    .trim()
    .toUpperCase();

  if (gender !== "MALE") {
    throw AppError.badRequest(
      "Paternity Leave is available only to male employees.",
    );
  }
}

const isBereavementLeave =
  normalizedLeaveTypeName === "bereavement leave" ||
  normalizedLeaveTypeName.includes("bereavement");

const isElectionLeave =
  normalizedLeaveTypeName === "election leave" ||
  normalizedLeaveTypeName.includes("election");

if (isBereavementLeave || isElectionLeave) {
  const employee = await Employee.findById(input.employeeId)
    .select("_id")
    .lean();

  if (!employee) {
    throw AppError.notFound("Employee not found.");
  }
}

const isMaternityLeave =
  normalizedLeaveTypeName === "maternity leave" ||
  normalizedLeaveTypeName.includes("maternity");

if (isMaternityLeave) {
  const employee = await Employee.findById(input.employeeId)
    .select("gender")
    .lean();

  if (!employee) {
    throw AppError.notFound("Employee not found.");
  }

  const gender = String(employee.gender ?? "")
    .trim()
    .toUpperCase();

  if (gender !== "FEMALE") {
    throw AppError.badRequest(
      "Maternity Leave is available only to female employees.",
    );
  }
}

if (isMaternityLeave) {
  const maxMaternityDays = 182;

  if (totalDays > maxMaternityDays) {
    throw AppError.badRequest(
      `Maternity Leave cannot exceed ${maxMaternityDays} days.`,
    );
  }
}

  const year = start.getUTCFullYear();

  const balance = (await getOrCreateBalance(
    input.employeeId,
    input.leaveTypeId,
    year,
  )) as any;

  /*
   * Count already-pending requests for the same leave type.
   * This prevents an employee from submitting multiple pending
   * requests that together exceed the available balance.
   */
  const pendingRows = await LeaveRequest.find({
    employeeId: input.employeeId,
    leaveTypeId: input.leaveTypeId,
    status: "PENDING",
  })
    .select("totalDays")
    .lean();

  const pendingDays = pendingRows.reduce(
  (sum: number, row: { totalDays?: number | null }) =>
    sum + Number(row.totalDays ?? 0),
  0,
);

 const allotted = Number(balance?.allotted ?? 0);
const used = Number(balance?.used ?? 0);

const available = Math.max(
  allotted - used - pendingDays,
  0,
);

console.log("[Leave Balance Check]", {
  employeeId: input.employeeId,
  leaveTypeId: input.leaveTypeId,
  leaveTypeName: leaveType.name,
  requestedDays: totalDays,
  allotted,
  used,
  pendingDays,
  available,
});

  /*
   * Comp-Off is handled against active credit records.
   * Do not allow a request larger than the actual active
   * Comp-Off credits.
   */
  const isCompOff =
    String(leaveType.name ?? "")
      .trim()
      .toLowerCase() === "compensatory off";

  const isLopLeave =
    normalizedLeaveTypeName === "loss of pay" ||
    normalizedLeaveTypeName === "lop" ||
    normalizedLeaveTypeName.includes("loss of pay");

  if (isCompOff) {
  await expireCompOffCredits();

  const activeCredits = await CompOffCredit.find({
    employeeId: input.employeeId,
    status: "ACTIVE",
    expiresAt: { $gt: nowIso() },
    remainingDays: { $gt: 0 },
  })
    .select("remainingDays")
    .lean();

  const compOffAvailable = activeCredits.reduce(
    (sum, credit) =>
      sum + Number(credit.remainingDays ?? 0),
    0,
  );

  const compOffAvailableAfterPending = Math.max(
    compOffAvailable - pendingDays,
    0,
  );

  if (totalDays > compOffAvailableAfterPending) {
    throw AppError.badRequest(
      `Insufficient Comp-Off balance. ` +
        `Available: ${compOffAvailableAfterPending} day(s), ` +
        `requested: ${totalDays} day(s).`,
    );
  }
} else if (!isLopLeave && totalDays > available) {
  throw AppError.badRequest(
    `Insufficient leave balance for ${leaveType.name}. ` +
      `Available: ${available} day(s), requested: ${totalDays} day(s).`,
  );
}

  const doc = await LeaveRequest.create({
    ...input,
    totalDays,
    status: "PENDING",
    appliedAt: nowIso(),
  });

  return toApiDoc(
    (await LeaveRequest.findById(doc._id).lean())!,
  );
}

export async function getRequest(id: string) {
  const row = await LeaveRequest.findById(id).lean();
  return toApiDoc(row);
}

export async function decideRequest(
  id: string,
  approverId: string,
  status: "APPROVED" | "REJECTED",
  decisionNote?: string,
  approverRole?: string,
) {
  const request = (await getRequest(id)) as any;

  if (!request) {
    return undefined;
  }


  if (request.status !== "PENDING") {
    throw new Error(
      `Leave request has already been ${String(
        request.status,
      ).toLowerCase()}.`,
    );
  }

  const employee = await Employee.findById(request.employeeId)
    .select("managerId")
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  /*
   * Only the employee's assigned manager can make
   * the decision. The authenticated employeeId is
   * supplied by the route.
   */
  const normalizedApproverRole = String(
  approverRole ?? "",
)
  .trim()
  .toUpperCase();

const isHrOrAdmin =
  normalizedApproverRole === "HR" ||
  normalizedApproverRole === "HR_ADMIN" ||
  normalizedApproverRole === "ADMIN" ||
  normalizedApproverRole === "SUPER_ADMIN" ||
  normalizedApproverRole === "SUPERADMIN";

const isDirectManager =
  String(employee.managerId ?? "") === String(approverId);

if (!isDirectManager && !isHrOrAdmin) {
  throw new Error(
    "You can only approve or reject leave requests from your direct reports.",
  );
}

  /*
   * ------------------------------------------------------------
   * REJECTION
   * ------------------------------------------------------------
   *
   * No balance changes are required for a rejection.
   * Update the request directly.
   */
  if (status === "REJECTED") {
    const updated = await LeaveRequest.findOneAndUpdate(
      {
        _id: id,
        status: "PENDING",
      },
      {
        $set: {
          status: "REJECTED",
          approverId,
          decisionNote: decisionNote ?? null,
          decidedAt: nowIso(),
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      throw new Error("Leave request has already been decided.");
    }

    return toApiDoc(updated);
  }

  /*
   * ------------------------------------------------------------
   * APPROVAL
   * ------------------------------------------------------------
   *
   * IMPORTANT:
   * Validate the balance BEFORE changing the request
   * to APPROVED.
   *
   * This prevents:
   *
   * PENDING
   *   -> APPROVED
   *   -> insufficient balance
   *
   * which could leave the database in an inconsistent state.
   */

  const leaveType = (await getLeaveType(request.leaveTypeId)) as any;

  if (!leaveType) {
    throw new Error("Leave type not found.");
  }

  const isCompOff =
    String(leaveType.name ?? "")
      .trim()
      .toLowerCase() === "compensatory off";

      const normalizedLeaveTypeName = String(
  leaveType.name ?? "",
)
  .trim()
  .toLowerCase();

const isLopLeave =
  normalizedLeaveTypeName === "loss of pay" ||
  normalizedLeaveTypeName === "lop" ||
  normalizedLeaveTypeName.includes("loss of pay");

  const year = new Date(request.startDate).getUTCFullYear();

  /*
   * ------------------------------------------------------------
   * COMP-OFF APPROVAL
   * ------------------------------------------------------------
   */

  

  if (isCompOff) {
    await expireCompOffCredits();

    const availableCredits = await CompOffCredit.find({
      employeeId: request.employeeId,
      status: "ACTIVE",
      expiresAt: { $gt: nowIso() },
      remainingDays: { $gt: 0 },
    })
      .sort({
        expiresAt: 1,
        creditedAt: 1,
      })
      .lean();

    const totalAvailable = availableCredits.reduce(
  (sum: number, credit: { remainingDays?: number | null }) =>
    sum + Number(credit.remainingDays ?? 0),
  0,
);

    /*
     * Other pending Comp-Off requests must also be
     * reserved so multiple approvals cannot consume
     * the same credit.
     */
    const pendingCompOffRequests = await LeaveRequest.find({
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      status: "PENDING",
      _id: { $ne: id },
    })
      .select("totalDays")
      .lean();

    const pendingCompOffDays =
      pendingCompOffRequests.reduce(
        (sum, row) =>
          sum + Number(row.totalDays ?? 0),
        0,
      );

    const availableAfterPending = Math.max(
      totalAvailable - pendingCompOffDays,
      0,
    );

    if (availableAfterPending < request.totalDays) {
      throw new Error(
        `Insufficient Comp-Off balance. Available: ${availableAfterPending} day(s).`,
      );
    }

    /*
     * Consume Comp-Off credits FIFO, starting with
     * the credit that expires earliest.
     */
    let remainingToConsume = request.totalDays;

    for (const credit of availableCredits) {
      if (remainingToConsume <= 0) {
        break;
      }

      const consume = Math.min(
        Number(credit.remainingDays),
        remainingToConsume,
      );

      const newRemaining =
        Number(credit.remainingDays) - consume;

      const consumedUpdate =
        await CompOffCredit.updateOne(
          {
            _id: credit._id,
            status: "ACTIVE",
            remainingDays: Number(credit.remainingDays),
          },
          {
            $set: {
              remainingDays: newRemaining,
              status:
                newRemaining <= 0
                  ? "USED"
                  : "ACTIVE",
              updatedAt: nowIso(),
            },
          },
        );

      if (consumedUpdate.modifiedCount !== 1) {
        throw new Error(
          "Comp-Off balance changed while processing approval. Please try again.",
        );
      }

      remainingToConsume -= consume;
    }

    if (remainingToConsume > 0) {
      throw new Error(
        "Unable to consume the required Comp-Off balance.",
      );
    }

    /*
     * Update used balance only after all required
     * Comp-Off credits have been consumed successfully.
     */
    const balance = (await getOrCreateBalance(
      request.employeeId,
      request.leaveTypeId,
      year,
    )) as any;

    await LeaveBalance.updateOne(
      { _id: balance.id },
      {
        $inc: {
          used: request.totalDays,
        },
      },
    );



  } else if (!isLopLeave) {
    /*
     * ----------------------------------------------------------
     * NORMAL PAID LEAVE APPROVAL
     * ----------------------------------------------------------
     */

    const balance = (await getOrCreateBalance(
      request.employeeId,
      request.leaveTypeId,
      year,
    )) as any;

    const allotted = Number(
      balance?.allotted ?? 0,
    );

    const used = Number(
      balance?.used ?? 0,
    );

    /*
     * Calculate other pending requests again at approval
     * time because balances may have changed since application.
     */
    const pendingRows = await LeaveRequest.find({
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      status: "PENDING",
      _id: { $ne: id },
    })
      .select("totalDays")
      .lean();

    const pendingDays = pendingRows.reduce(
      (sum, row) =>
        sum + Number(row.totalDays ?? 0),
      0,
    );

    const available =
      allotted -
      used -
      pendingDays;

    if (available < request.totalDays) {
      throw new Error(
        `Insufficient leave balance. Available: ${Math.max(
          available,
          0,
        )} day(s).`,
      );
    }
if (!isLopLeave) {
  await LeaveBalance.updateOne(
    {
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      year,
    },
    {
      $inc: {
        used: request.totalDays,
      },
    },
  );
}

  }

  /*
   * ------------------------------------------------------------
   * FINAL REQUEST STATUS UPDATE
   * ------------------------------------------------------------
   *
   * Only after successful balance validation and deduction
   * do we mark the request as APPROVED.
   */
  const updated = await LeaveRequest.findOneAndUpdate(
  {
    _id: id,
    status: "PENDING",
  },
  {
    $set: {
      status: "APPROVED",
      approvalStage: "COMPLETED",
      approverId,
      decisionNote: decisionNote ?? null,
      decidedAt: nowIso(),
    },
  },
  { new: true },
).lean();
  if (!updated) {
    throw new Error(
      "Leave request was changed by another action. Please refresh and try again.",
    );
  }

  return toApiDoc(updated);
}

export async function getEmployeeCompOffBalance(
  employeeId: string,
) {
  await expireCompOffCredits();

  const leaveType =
    (await getOrCreateCompOffLeaveType()) as any;

  const year = new Date().getFullYear();

  const balance = (await getOrCreateBalance(
    employeeId,
    leaveType.id,
    year,
  )) as any;

  const credits = await CompOffCredit.find({
    employeeId,
    status: "ACTIVE",
    expiresAt: { $gt: nowIso() },
    remainingDays: { $gt: 0 },
  })
    .sort({ expiresAt: 1 })
    .lean();

    const available = credits.reduce(
  (sum: number, credit: { remainingDays: number }) =>
    sum + credit.remainingDays,
  0,
);

  return {
    leaveTypeId: leaveType.id,
    leaveTypeName: leaveType.name,
    allotted: balance?.allotted ?? 0,
    used: balance?.used ?? 0,
    available,
    credits: credits.map(toApiDoc),
  };
}


export async function cancelRequest(id: string, employeeId: string) {
  await LeaveRequest.updateOne(
    { _id: id, employeeId, status: "PENDING" },
    { $set: { status: "CANCELLED", decidedAt: nowIso() } },
  );
  return getRequest(id);
}

export async function getLeaveCalendar(
  month: number,
  year: number,
  role?: string,
  employeeId?: string | null,
) {
  const pattern =
    `${year}-${String(month).padStart(2, "0")}`;

  const monthStart = `${pattern}-01`;

  const monthEndDate = new Date(
    Date.UTC(year, month, 0),
  );

  const monthEnd =
    monthEndDate.toISOString().slice(0, 10);

  const isAdmin = role === "SUPER_ADMIN" || role === "HR_ADMIN";

  let employeeFilter: Record<string, any> | null = null;

  if (!isAdmin && role === "MANAGER" && employeeId) {
    const team = await Employee.find({ managerId: employeeId })
      .select("_id")
      .lean();
    const visibleEmployeeIds = [employeeId, ...team.map((e) => String(e._id))];
    employeeFilter = { employeeId: { $in: visibleEmployeeIds } };
  } else if (!isAdmin && employeeId) {
    employeeFilter = { employeeId };
  } else if (!isAdmin) {
    employeeFilter = { employeeId: "__NO_EMPLOYEE__" };
  }

  const leaveQuery: Record<string, any> = {
    status: "APPROVED",
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
    ...(employeeFilter ?? {}),
  };

  const [rows, holidays] = await Promise.all([
    LeaveRequest.find(leaveQuery)
      .lean(),

    Holiday.find({
      date: {
        $gte: monthStart,
        $lte: monthEnd,
      },
    })
      .sort({ date: 1 })
      .lean(),
  ]);

  const employeeIds = [
    ...new Set(
      rows.map((r) => r.employeeId),
    ),
  ];

  const leaveTypeIds = [
    ...new Set(
      rows.map((r) => r.leaveTypeId),
    ),
  ];

  const [employees, leaveTypes] =
    await Promise.all([
      employeeIds.length
        ? Employee.find({
            _id: { $in: employeeIds },
          }).lean()
        : [],

      leaveTypeIds.length
        ? LeaveType.find({
            _id: { $in: leaveTypeIds },
          }).lean()
        : [],
    ]);

  const empMap = new Map(
    employees.map((e) => [e._id, e]),
  );

  const typeMap = new Map(
    leaveTypes.map((t) => [t._id, t]),
  );

  const leaveEntries = rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const type = typeMap.get(r.leaveTypeId);

    return {
      id: r._id,
      type: "LEAVE",
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode:
        emp?.employeeCode ?? null,
      avatarUrl: emp?.avatarUrl ?? null,
      leaveTypeName:
        type?.name ?? null,
      leaveTypeColor:
        type?.colorHex ?? null,
    };
  });

  const holidayEntries = holidays.map(
    (holiday) => ({
      id: holiday._id,
      type: "HOLIDAY",
      date: holiday.date,
      name: holiday.name,
      isOptional:
        holiday.isOptional ?? false,
    }),
  );

  return [
    ...leaveEntries,
    ...holidayEntries,
  ];
}

export async function onLeaveToday() {
  const today = new Date().toISOString().slice(0, 10);
  return LeaveRequest.countDocuments({
    status: "APPROVED",
    startDate: { $lte: today },
    endDate: { $gte: today },
  });
}
