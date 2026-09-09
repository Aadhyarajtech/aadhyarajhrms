import {
  Attendance,
  AttendanceDoc,
  Employee,
  EmployeeDoc,
} from "@/db/models";

// ============================================================================
// TYPES
// ============================================================================

export type AttendanceAnomalyType =
  | "LATE_CHECK_IN"
  | "MISSING_CHECKOUT"
  | "UNUSUAL_WORKING_HOURS"
  | "FREQUENT_ABSENCE"
  | "ATTENDANCE_DECLINE"
  | "REPEATED_HALF_DAYS";

export type AttendanceAnomalySeverity =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface AttendanceAnomaly {
  id: string;
  type: AttendanceAnomalyType;
  severity: AttendanceAnomalySeverity;
  date: string | null;
  title: string;
  description: string;
  actualValue: number | string | null;
  expectedValue: number | string | null;
  deviation: number | null;
}

export interface AttendanceAnomalyResult {
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
  };

  anomalies: AttendanceAnomaly[];

  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };

  baseline: {
    averageWorkingHours: number | null;
    averageCheckInMinutes: number | null;
    previousAttendanceRate: number | null;
    currentAttendanceRate: number | null;
  };

  dataQuality: {
    currentRecords: number;
    previousRecords: number;
    workingHoursSamples: number;
    checkInSamples: number;
    lateCheckInAvailable: boolean;
  };

  ai: {
    summary: string;
    recommendation: string;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function isEligibleRecord(record: AttendanceDoc): boolean {
  return (
    record.status === "PRESENT" ||
    record.status === "WORK_FROM_HOME" ||
    record.status === "HALF_DAY" ||
    record.status === "ABSENT"
  );
}

function isWithinEmploymentPeriod(
  record: AttendanceDoc,
  employee: EmployeeDoc,
): boolean {
  const date = String(record.date).slice(0, 10);

  const joiningDate = employee.dateOfJoining
    ? String(employee.dateOfJoining).slice(0, 10)
    : null;

  const exitDate = employee.dateOfExit
    ? String(employee.dateOfExit).slice(0, 10)
    : null;

  if (joiningDate && date < joiningDate) {
    return false;
  }

  if (exitDate && date > exitDate) {
    return false;
  }

  return true;
}

function filterEmploymentRecords(
  records: AttendanceDoc[],
  employee: EmployeeDoc,
): AttendanceDoc[] {
  return records.filter((record) =>
    isWithinEmploymentPeriod(record, employee),
  );
}

function timeToMinutes(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const raw = String(value);

  const match = raw.match(
    /(?:T|\s|^)(\d{1,2}):(\d{2})/,
  );

  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return hours * 60 + minutes;
    }
  }

  const amPmMatch = raw.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );

  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2]);
    const period = amPmMatch[3].toUpperCase();

    if (period === "AM" && hours === 12) {
      hours = 0;
    }

    if (period === "PM" && hours !== 12) {
      hours += 12;
    }

    if (
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return hours * 60 + minutes;
    }
  }

  return null;
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length
  );
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort(
    (a, b) => a - b,
  );

  const middle = Math.floor(
    sorted.length / 2,
  );

  if (sorted.length % 2 === 0) {
    return (
      (sorted[middle - 1] +
        sorted[middle]) /
      2
    );
  }

  return sorted[middle];
}

function round(
  value: number,
  decimals = 2,
): number {
  const factor = 10 ** decimals;

  return (
    Math.round(value * factor) /
    factor
  );
}

function getSeverity(
  deviation: number,
): AttendanceAnomalySeverity {
  if (deviation >= 50) {
    return "HIGH";
  }

  if (deviation >= 25) {
    return "MEDIUM";
  }

  return "LOW";
}

function getPreviousMonth(
  month: number,
  year: number,
) {
  if (month === 1) {
    return {
      month: 12,
      year: year - 1,
    };
  }

  return {
    month: month - 1,
    year,
  };
}

function calculateAttendanceRate(
  records: AttendanceDoc[],
): number | null {
  const eligible = records.filter(
    isEligibleRecord,
  );

  if (!eligible.length) {
    return null;
  }

  const equivalent =
    eligible.reduce(
      (sum, record) => {
        if (
          record.status ===
            "PRESENT" ||
          record.status ===
            "WORK_FROM_HOME"
        ) {
          return sum + 1;
        }

        if (
          record.status ===
          "HALF_DAY"
        ) {
          return sum + 0.5;
        }

        return sum;
      },
      0,
    );

  return round(
    (equivalent /
      eligible.length) *
      100,
  );
}

// ============================================================================
// LATE CHECK-IN
// ============================================================================

function detectLateCheckIns(
  currentRecords: AttendanceDoc[],
  previousRecords: AttendanceDoc[],
): AttendanceAnomaly[] {
  const historicalCheckIns =
    previousRecords
      .filter(
        (record) =>
          isEligibleRecord(record) &&
          record.status !== "ABSENT",
      )
      .map((record) =>
        timeToMinutes(record.checkIn),
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  const currentCheckIns =
    currentRecords
      .filter(
        (record) =>
          isEligibleRecord(record) &&
          record.status !== "ABSENT",
      )
      .map((record) => ({
        date: String(record.date).slice(
          0,
          10,
        ),
        minutes: timeToMinutes(
          record.checkIn,
        ),
      }))
      .filter(
        (
          record,
        ): record is {
          date: string;
          minutes: number;
        } =>
          record.minutes !== null,
      );

  const baselineValues = [
    ...historicalCheckIns,
    ...currentCheckIns.map(
      (record) => record.minutes,
    ),
  ];

  if (baselineValues.length < 5) {
    return [];
  }

  const baseline =
    median(baselineValues);

  if (baseline === null) {
    return [];
  }

  return currentCheckIns
    .map((record) => ({
      record,
      deviation:
        record.minutes - baseline,
    }))
    .filter(
      ({ deviation }) =>
        deviation >= 30,
    )
    .map(
      ({
        record,
        deviation,
      }) => ({
        id: `late-check-in-${record.date}`,

        type: "LATE_CHECK_IN" as const,

        severity:
          getSeverity(deviation),

        date: record.date,

        title:
          "Unusual late check-in",

        description:
          `Check-in was ${Math.round(
            deviation,
          )} minutes later than the employee's usual check-in pattern.`,

        actualValue:
          record.minutes,

        expectedValue:
          Math.round(baseline),

        deviation:
          Math.round(deviation),
      }),
    );
}

// ============================================================================
// MISSING CHECKOUT
// ============================================================================

function detectMissingCheckouts(
  records: AttendanceDoc[],
): AttendanceAnomaly[] {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  return records
    .filter((record) => {
      const date =
        String(record.date).slice(
          0,
          10,
        );

      if (date === today) {
        return false;
      }

      return (
        isEligibleRecord(record) &&
        record.status !== "ABSENT" &&
        !!record.checkIn &&
        !record.checkOut
      );
    })
    .map((record) => {
      const date =
        String(record.date).slice(
          0,
          10,
        );

      return {
        id: `missing-checkout-${date}`,

        type:
          "MISSING_CHECKOUT" as const,

        severity: "MEDIUM" as const,

        date,

        title:
          "Missing checkout",

        description:
          "A check-in was recorded but no checkout time was recorded for this attendance day.",

        actualValue: null,

        expectedValue:
          "Checkout time",

        deviation: null,
      };
    });
}

// ============================================================================
// UNUSUAL WORKING HOURS
// ============================================================================

function detectUnusualWorkingHours(
  currentRecords: AttendanceDoc[],
  previousRecords: AttendanceDoc[],
): AttendanceAnomaly[] {
  const historicalHours =
    previousRecords
      .filter(
        (record) =>
          isEligibleRecord(record) &&
          typeof record.workHours ===
            "number" &&
          Number.isFinite(
            record.workHours,
          ) &&
          record.workHours >= 0,
      )
      .map(
        (record) =>
          record.workHours as number,
      );

  if (historicalHours.length < 5) {
    return [];
  }

  const baseline =
    median(historicalHours);

  if (
    baseline === null ||
    baseline <= 0
  ) {
    return [];
  }

  return currentRecords
    .filter(
      (record) =>
        isEligibleRecord(record) &&
        typeof record.workHours ===
          "number" &&
        Number.isFinite(
          record.workHours,
        ) &&
        record.workHours >= 0,
    )
    .map((record) => {
      const hours =
        record.workHours as number;

      const difference =
        hours - baseline;

      const percentage =
        Math.abs(
          difference / baseline,
        ) * 100;

      return {
        record,
        difference,
        percentage,
      };
    })
    .filter(
      ({ percentage }) =>
        percentage >= 30,
    )
    .map(
      ({
        record,
        difference,
        percentage,
      }) => ({
        id: `working-hours-${String(
          record.date,
        ).slice(0, 10)}`,

        type:
          "UNUSUAL_WORKING_HOURS" as const,

        severity:
          percentage >= 50
            ? ("HIGH" as const)
            : ("MEDIUM" as const),

        date: String(
          record.date,
        ).slice(0, 10),

        title:
          difference > 0
            ? "Unusually high working hours"
            : "Unusually low working hours",

        description:
          difference > 0
            ? `Working hours were ${round(
                percentage,
              )}% higher than the employee's usual pattern.`
            : `Working hours were ${round(
                percentage,
              )}% lower than the employee's usual pattern.`,

        actualValue:
          round(
            record.workHours as number,
          ),

        expectedValue:
          round(baseline),

        deviation:
          round(difference),
      }),
    );
}

// ============================================================================
// FREQUENT ABSENCE
// ============================================================================

function detectFrequentAbsence(
  currentRecords: AttendanceDoc[],
  previousRecords: AttendanceDoc[],
): AttendanceAnomaly[] {
  const currentAbsent =
    currentRecords.filter(
      (record) =>
        record.status ===
        "ABSENT",
    ).length;

  const previousAbsent =
    previousRecords.filter(
      (record) =>
        record.status ===
        "ABSENT",
    ).length;

  if (
    currentAbsent < 3 ||
    currentAbsent <
      previousAbsent + 2
  ) {
    return [];
  }

  const increase =
    currentAbsent -
    previousAbsent;

  return [
    {
      id: "frequent-absence",

      type:
        "FREQUENT_ABSENCE",

      severity:
        currentAbsent >= 5
          ? "HIGH"
          : "MEDIUM",

      date: null,

      title:
        "Frequent absence pattern",

      description:
        `The current month has ${currentAbsent} recorded absence days compared with ${previousAbsent} in the previous month.`,

      actualValue:
        currentAbsent,

      expectedValue:
        previousAbsent,

      deviation:
        increase,
    },
  ];
}

// ============================================================================
// REPEATED HALF DAYS
// ============================================================================

function detectRepeatedHalfDays(
  records: AttendanceDoc[],
): AttendanceAnomaly[] {
  const halfDays =
    records.filter(
      (record) =>
        record.status ===
        "HALF_DAY",
    ).length;

  if (halfDays < 3) {
    return [];
  }

  return [
    {
      id: "repeated-half-days",

      type:
        "REPEATED_HALF_DAYS",

      severity:
        halfDays >= 5
          ? "MEDIUM"
          : "LOW",

      date: null,

      title:
        "Repeated half-day pattern",

      description:
        `There are ${halfDays} recorded half-day attendance entries in the selected month.`,

      actualValue:
        halfDays,

      expectedValue:
        "< 3",

      deviation:
        halfDays - 2,
    },
  ];
}

// ============================================================================
// ATTENDANCE DECLINE
// ============================================================================

function detectAttendanceDecline(
  currentRecords: AttendanceDoc[],
  previousRecords: AttendanceDoc[],
): AttendanceAnomaly[] {
  const currentRate =
    calculateAttendanceRate(
      currentRecords,
    );

  const previousRate =
    calculateAttendanceRate(
      previousRecords,
    );

  if (
    currentRate === null ||
    previousRate === null
  ) {
    return [];
  }

  const decline =
    previousRate -
    currentRate;

  if (decline < 10) {
    return [];
  }

  return [
    {
      id: "attendance-decline",

      type:
        "ATTENDANCE_DECLINE",

      severity:
        decline >= 20
          ? "HIGH"
          : "MEDIUM",

      date: null,

      title:
        "Attendance rate declined",

      description:
        `Attendance rate decreased by ${round(
          decline,
        )} percentage points compared with the previous month.`,

      actualValue:
        currentRate,

      expectedValue:
        previousRate,

      deviation:
        round(decline),
    },
  ];
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

export async function getEmployeeAttendanceAnomalies(
  employeeId: string,
  month?: number,
  year?: number,
): Promise<AttendanceAnomalyResult> {
  const now = new Date();

  const resolvedMonth =
    month ?? now.getMonth() + 1;

  const resolvedYear =
    year ?? now.getFullYear();

  if (
    !Number.isInteger(resolvedMonth) ||
    resolvedMonth < 1 ||
    resolvedMonth > 12
  ) {
    throw new Error(
      "Invalid attendance month.",
    );
  }

  if (
    !Number.isInteger(resolvedYear) ||
    resolvedYear < 2000 ||
    resolvedYear > 2100
  ) {
    throw new Error(
      "Invalid attendance year.",
    );
  }

  const employee =
    await Employee.findOne({
      _id: employeeId,
    }).lean();

  if (!employee) {
    throw new Error(
      "Employee not found.",
    );
  }

  const previous =
    getPreviousMonth(
      resolvedMonth,
      resolvedYear,
    );

  const startDate =
    `${resolvedYear}-${String(
      resolvedMonth,
    ).padStart(2, "0")}-01`;

  const endDate =
    new Date(
      resolvedYear,
      resolvedMonth,
      0,
    )
      .toISOString()
      .slice(0, 10);

  const currentPrefix =
  `${resolvedYear}-${String(resolvedMonth).padStart(2, "0")}-`;

const previousPrefix =
  `${previous.year}-${String(previous.month).padStart(2, "0")}-`;

const [
  currentRecordsRaw,
  previousRecordsRaw,
] = await Promise.all([
  Attendance.find({
    employeeId,
    date: {
      $regex: `^${currentPrefix}`,
    },
  })
    .sort({ date: 1 })
    .lean(),

  Attendance.find({
    employeeId,
    date: {
      $regex: `^${previousPrefix}`,
    },
  })
    .sort({ date: 1 })
    .lean(),
]);

  const currentRecords =
    filterEmploymentRecords(
      currentRecordsRaw,
      employee,
    );

  const previousRecords =
    filterEmploymentRecords(
      previousRecordsRaw,
      employee,
    );

  const anomalies: AttendanceAnomaly[] =
    [
      ...detectLateCheckIns(
        currentRecords,
        previousRecords,
      ),

      ...detectMissingCheckouts(
        currentRecords,
      ),

      ...detectUnusualWorkingHours(
        currentRecords,
        previousRecords,
      ),

      ...detectFrequentAbsence(
        currentRecords,
        previousRecords,
      ),

      ...detectRepeatedHalfDays(
        currentRecords,
      ),

      ...detectAttendanceDecline(
        currentRecords,
        previousRecords,
      ),
    ];

  const uniqueAnomalies =
    Array.from(
      new Map(
        anomalies.map(
          (anomaly) => [
            anomaly.id,
            anomaly,
          ],
        ),
      ).values(),
    );

  const workingHourValues =
    previousRecords
      .filter(
        (record) =>
          typeof record.workHours ===
            "number" &&
          Number.isFinite(
            record.workHours,
          ) &&
          record.workHours >= 0,
      )
      .map(
        (record) =>
          record.workHours as number,
      );

  const checkInValues =
    previousRecords
      .map((record) =>
        timeToMinutes(
          record.checkIn,
        ),
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  const currentAttendanceRate =
    calculateAttendanceRate(
      currentRecords,
    );

  const previousAttendanceRate =
    calculateAttendanceRate(
      previousRecords,
    );

  return {
    period: {
      month: resolvedMonth,
      year: resolvedYear,
      startDate,
      endDate,
    },

    anomalies:
      uniqueAnomalies,

    summary: {
      total:
        uniqueAnomalies.length,

      high:
        uniqueAnomalies.filter(
          (item) =>
            item.severity ===
            "HIGH",
        ).length,

      medium:
        uniqueAnomalies.filter(
          (item) =>
            item.severity ===
            "MEDIUM",
        ).length,

      low:
        uniqueAnomalies.filter(
          (item) =>
            item.severity ===
            "LOW",
        ).length,
    },

    baseline: {
      averageWorkingHours:
        average(
          workingHourValues,
        ),

      averageCheckInMinutes:
        average(
          checkInValues,
        ),

      previousAttendanceRate,

      currentAttendanceRate,
    },

    dataQuality: {
      currentRecords:
        currentRecords.length,

      previousRecords:
        previousRecords.length,

      workingHoursSamples:
        workingHourValues.length,

      checkInSamples:
        checkInValues.length,

      lateCheckInAvailable:
        checkInValues.length >= 5,
    },

    ai: {
      summary:
        uniqueAnomalies.length > 0
          ? "Attendance anomalies were detected from the available attendance records."
          : "No significant attendance anomalies were detected from the available attendance records.",

      recommendation:
        uniqueAnomalies.length > 0
          ? "Review the detected attendance patterns and verify any unusual records."
          : "Continue maintaining the current attendance pattern.",
    },
  };
}