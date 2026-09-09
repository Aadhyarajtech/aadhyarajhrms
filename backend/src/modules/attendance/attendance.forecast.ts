import { Attendance, Employee } from "@/db/models";

export interface AttendanceForecastResult {
  period: {
    month: number;
    year: number;
  };

  historicalData: {
    month: string;
    attendanceRate: number;
    workingDays: number;
  }[];

  forecast: {
    predictedAttendanceRate: number;
    direction: "IMPROVING" | "DECLINING" | "STABLE";
    confidence: "HIGH" | "MEDIUM" | "LOW";
  };

  summary: {
    averageAttendanceRate: number;
    bestMonth: string | null;
    lowestMonth: string | null;
  };

  recommendation: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonthName(month: number): string {
  return new Date(
    2026,
    month - 1,
    1,
  ).toLocaleString("en-IN", {
    month: "short",
  });
}

function calculateAttendanceRate(
  records: any[],
): number {
  const eligibleRecords = records.filter(
    (record) =>
      record.status !== "ON_LEAVE" &&
      record.status !== "HOLIDAY" &&
      record.status !== "WEEKEND",
  );

  if (!eligibleRecords.length) {
    return 0;
  }

  const attendanceEquivalent =
    eligibleRecords.reduce(
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
    (attendanceEquivalent /
      eligibleRecords.length) *
      100,
  );
}

// ---------------------------------------------------------------------------
// Main Forecast Service
// ---------------------------------------------------------------------------

export async function getAttendanceForecast(
  employeeId: string,
  months = 6,
): Promise<AttendanceForecastResult> {
  if (
    !Number.isInteger(months) ||
    months < 3 ||
    months > 12
  ) {
    throw new Error(
      "Forecast history must be between 3 and 12 months.",
    );
  }

  const employee =
    await Employee.findById(
      employeeId,
    )
      .select(
        "_id firstName lastName dateOfJoining dateOfExit",
      )
      .lean();

  if (!employee) {
    throw new Error(
      "Employee not found.",
    );
  }

  const today = new Date();

  const historicalData: {
    month: string;
    attendanceRate: number;
    workingDays: number;
  }[] = [];

  // -------------------------------------------------------------------------
  // Get historical monthly data
  // -------------------------------------------------------------------------

  for (
    let index = months;
    index >= 1;
    index--
  ) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth() - index,
      1,
    );

    const month =
      date.getMonth() + 1;

    const year =
      date.getFullYear();

    const startDate =
      `${year}-${String(month).padStart(
        2,
        "0",
      )}-01`;

    const endDate =
      new Date(
        year,
        month,
        0,
      )
        .toISOString()
        .slice(0, 10);

    const records =
      await Attendance.find({
        employeeId,

        date: {
          $gte: startDate,
          $lte: endDate,
        },
      })
        .select(
          "date status",
        )
        .sort({ date: 1 })
        .lean();

    // Respect employment dates
    const employmentRecords =
      records.filter((record) => {
        if (
          employee.dateOfJoining &&
          record.date <
            employee.dateOfJoining
        ) {
          return false;
        }

        if (
          employee.dateOfExit &&
          record.date >
            employee.dateOfExit
        ) {
          return false;
        }

        return true;
      });

    const eligibleRecords =
      employmentRecords.filter(
        (record) =>
          record.status !==
            "ON_LEAVE" &&
          record.status !==
            "HOLIDAY" &&
          record.status !==
            "WEEKEND",
      );

    historicalData.push({
      month: `${getMonthName(month)} ${year}`,

      attendanceRate:
        calculateAttendanceRate(
          employmentRecords,
        ),

      workingDays:
        eligibleRecords.length,
    });
  }

  // -------------------------------------------------------------------------
  // No sufficient data
  // -------------------------------------------------------------------------

  const monthsWithData =
    historicalData.filter(
      (item) =>
        item.workingDays > 0,
    );

  if (monthsWithData.length === 0) {
    return {
      period: {
        month:
          today.getMonth() + 1,
        year:
          today.getFullYear(),
      },

      historicalData,

      forecast: {
        predictedAttendanceRate: 0,
        direction: "STABLE",
        confidence: "LOW",
      },

      summary: {
        averageAttendanceRate: 0,
        bestMonth: null,
        lowestMonth: null,
      },

      recommendation:
        "There is not enough historical attendance data to generate a reliable forecast.",
    };
  }

  // -------------------------------------------------------------------------
  // Average attendance
  // -------------------------------------------------------------------------

  const averageAttendanceRate =
    Math.round(
      monthsWithData.reduce(
        (sum, item) =>
          sum + item.attendanceRate,
        0,
      ) /
        monthsWithData.length,
    );

  // -------------------------------------------------------------------------
  // Best / lowest month
  // -------------------------------------------------------------------------

  const best =
    [...monthsWithData].sort(
      (a, b) =>
        b.attendanceRate -
        a.attendanceRate,
    )[0];

  const lowest =
    [...monthsWithData].sort(
      (a, b) =>
        a.attendanceRate -
        b.attendanceRate,
    )[0];

  // -------------------------------------------------------------------------
  // Forecast
  //
  // Use a weighted average:
  // recent months receive more importance.
  // -------------------------------------------------------------------------

  let weightedTotal = 0;
  let weightTotal = 0;

  monthsWithData.forEach(
    (item, index) => {
      const weight = index + 1;

      weightedTotal +=
        item.attendanceRate *
        weight;

      weightTotal += weight;
    },
  );

  const predictedAttendanceRate =
    Math.round(
      weightedTotal /
        weightTotal,
    );

  // -------------------------------------------------------------------------
  // Direction
  // -------------------------------------------------------------------------

  let direction:
    | "IMPROVING"
    | "DECLINING"
    | "STABLE" = "STABLE";

  if (
    monthsWithData.length >= 2
  ) {
    const first =
      monthsWithData[0]
        .attendanceRate;

    const last =
      monthsWithData[
        monthsWithData.length - 1
      ].attendanceRate;

    const difference =
      last - first;

    if (difference >= 3) {
      direction = "IMPROVING";
    } else if (
      difference <= -3
    ) {
      direction = "DECLINING";
    }
  }

  // -------------------------------------------------------------------------
  // Confidence
  // -------------------------------------------------------------------------

  let confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW" = "LOW";

  if (
    monthsWithData.length >= 6
  ) {
    confidence = "HIGH";
  } else if (
    monthsWithData.length >= 3
  ) {
    confidence = "MEDIUM";
  }

  // -------------------------------------------------------------------------
  // Recommendation
  // -------------------------------------------------------------------------

  let recommendation =
    "Maintain your current attendance consistency.";

  if (direction === "IMPROVING") {
    recommendation =
      "Your attendance trend is improving. Continue maintaining this consistency.";
  }

  if (direction === "DECLINING") {
    recommendation =
      "Your attendance trend is declining. Try to maintain more consistent attendance in the coming weeks.";
  }

  if (
    predictedAttendanceRate < 75
  ) {
    recommendation =
      "The forecast indicates lower attendance consistency. Review recent attendance patterns and focus on improving consistency.";
  }

  return {
    period: {
      month:
        today.getMonth() + 1,

      year:
        today.getFullYear(),
    },

    historicalData,

    forecast: {
      predictedAttendanceRate,

      direction,

      confidence,
    },

    summary: {
      averageAttendanceRate,

      bestMonth:
        best?.month ?? null,

      lowestMonth:
        lowest?.month ?? null,
    },

    recommendation,
  };
}