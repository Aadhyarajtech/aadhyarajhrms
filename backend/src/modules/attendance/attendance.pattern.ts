import { Attendance, Employee } from "@/db/models";

// ===========================================================================
// ATTENDANCE PATTERN ANALYSIS
// ===========================================================================

export async function getAttendancePatterns(
  employeeId: string,
  months = 6,
) {
  if (
    !Number.isInteger(months) ||
    months < 3 ||
    months > 12
  ) {
    throw new Error(
      "Months must be an integer between 3 and 12.",
    );
  }

  // -------------------------------------------------------------------------
  // Get employee
  // -------------------------------------------------------------------------

  const employee = await Employee.findById(employeeId)
    .select(
      "_id firstName lastName employeeCode dateOfJoining dateOfExit",
    )
    .lean();

  if (!employee) {
    throw new Error("Employee not found.");
  }

  // -------------------------------------------------------------------------
  // Calculate date range
  // -------------------------------------------------------------------------

  const today = new Date();

  const start = new Date(
    today.getFullYear(),
    today.getMonth() - (months - 1),
    1,
  );

  const startDate = start.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  // -------------------------------------------------------------------------
  // Respect employment period
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

  if (effectiveStart > effectiveEnd) {
    return emptyPatternResult(
      startDate,
      endDate,
      months,
    );
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

  if (!records.length) {
    return emptyPatternResult(
      startDate,
      endDate,
      months,
    );
  }

  // -------------------------------------------------------------------------
  // Eligible attendance records
  //
  // ON_LEAVE, HOLIDAY and WEEKEND are excluded.
  // -------------------------------------------------------------------------

  const eligibleRecords = records.filter(
    (record) =>
      record.status !== "ON_LEAVE" &&
      record.status !== "HOLIDAY" &&
      record.status !== "WEEKEND",
  );

  // -------------------------------------------------------------------------
  // Weekday names
  // -------------------------------------------------------------------------

  const weekdays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // -------------------------------------------------------------------------
  // Group attendance by weekday
  // -------------------------------------------------------------------------

  const weekdayData = weekdays.map((day) => ({
    day,
    totalDays: 0,
    attendedEquivalent: 0,
    attendanceRate: 0,
    averageCheckInMinutes: null as number | null,
    averageWorkHours: null as number | null,
  }));

  for (const record of eligibleRecords) {
    const date = new Date(
      `${record.date}T00:00:00.000Z`,
    );

    // JS: Sunday = 0
    const jsDay = date.getUTCDay();

    // Convert to Monday = 0
    const weekdayIndex =
      jsDay === 0 ? 6 : jsDay - 1;

    const item = weekdayData[weekdayIndex];

    item.totalDays += 1;

    // Attendance equivalent
    if (
      record.status === "PRESENT" ||
      record.status === "WORK_FROM_HOME"
    ) {
      item.attendedEquivalent += 1;
    } else if (
      record.status === "HALF_DAY"
    ) {
      item.attendedEquivalent += 0.5;
    }

    // Check-in time
    if (record.checkIn) {
      const checkIn = new Date(record.checkIn);

      if (!Number.isNaN(checkIn.getTime())) {
        const minutes =
          checkIn.getHours() * 60 +
          checkIn.getMinutes();

        if (item.averageCheckInMinutes === null) {
          item.averageCheckInMinutes = minutes;
        } else {
          item.averageCheckInMinutes =
            item.averageCheckInMinutes + minutes;
        }
      }
    }

    // Work hours
    if (
      record.workHours !== null &&
      record.workHours !== undefined &&
      Number(record.workHours) > 0
    ) {
      if (item.averageWorkHours === null) {
        item.averageWorkHours = Number(
          record.workHours,
        );
      } else {
        item.averageWorkHours =
          item.averageWorkHours +
          Number(record.workHours);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Finalize weekday calculations
  // -------------------------------------------------------------------------

  const checkInCounts = new Map<
    string,
    number
  >();

  const workHourCounts = new Map<
    string,
    number
  >();

  for (const record of eligibleRecords) {
    const date = new Date(
      `${record.date}T00:00:00.000Z`,
    );

    const jsDay = date.getUTCDay();

    const weekdayIndex =
      jsDay === 0 ? 6 : jsDay - 1;

    const day = weekdays[weekdayIndex];

    if (record.checkIn) {
      const checkIn = new Date(record.checkIn);

      if (!Number.isNaN(checkIn.getTime())) {
        checkInCounts.set(
          day,
          (checkInCounts.get(day) ?? 0) + 1,
        );
      }
    }

    if (
      record.workHours !== null &&
      record.workHours !== undefined &&
      Number(record.workHours) > 0
    ) {
      workHourCounts.set(
        day,
        (workHourCounts.get(day) ?? 0) + 1,
      );
    }
  }

  for (const item of weekdayData) {
    if (item.totalDays > 0) {
      item.attendanceRate = Math.round(
        (item.attendedEquivalent /
          item.totalDays) *
          100,
      );
    }

    const checkInCount =
      checkInCounts.get(item.day) ?? 0;

    if (
      checkInCount > 0 &&
      item.averageCheckInMinutes !== null
    ) {
      item.averageCheckInMinutes = Math.round(
        item.averageCheckInMinutes /
          checkInCount,
      );
    } else {
      item.averageCheckInMinutes = null;
    }

    const workHourCount =
      workHourCounts.get(item.day) ?? 0;

    if (
      workHourCount > 0 &&
      item.averageWorkHours !== null
    ) {
      item.averageWorkHours =
        Math.round(
          (item.averageWorkHours /
            workHourCount) *
            100,
        ) / 100;
    } else {
      item.averageWorkHours = null;
    }
  }

  // -------------------------------------------------------------------------
  // Days with actual data
  // -------------------------------------------------------------------------

  const activeWeekdays =
    weekdayData.filter(
      (item) => item.totalDays > 0,
    );

  // -------------------------------------------------------------------------
  // Strongest / weakest attendance days
  // -------------------------------------------------------------------------

  let strongestDay: string | null = null;
  let weakestDay: string | null = null;

  if (activeWeekdays.length > 0) {
    strongestDay = [
      ...activeWeekdays,
    ].sort(
      (a, b) =>
        b.attendanceRate -
        a.attendanceRate,
    )[0].day;

    weakestDay = [
      ...activeWeekdays,
    ].sort(
      (a, b) =>
        a.attendanceRate -
        b.attendanceRate,
    )[0].day;
  }

  // -------------------------------------------------------------------------
  // Attendance variation
  // -------------------------------------------------------------------------

  const attendanceRates =
    activeWeekdays.map(
      (item) => item.attendanceRate,
    );

  const highestAttendance =
    attendanceRates.length
      ? Math.max(...attendanceRates)
      : 0;

  const lowestAttendance =
    attendanceRates.length
      ? Math.min(...attendanceRates)
      : 0;

  const attendanceVariation =
    highestAttendance -
    lowestAttendance;

  // -------------------------------------------------------------------------
  // Check-in variation
  // -------------------------------------------------------------------------

  const checkInValues =
    activeWeekdays
      .filter(
        (item) =>
          item.averageCheckInMinutes !==
          null,
      )
      .map(
        (item) =>
          item.averageCheckInMinutes!,
      );

  const checkInVariation =
    checkInValues.length
      ? Math.max(...checkInValues) -
        Math.min(...checkInValues)
      : 0;

  // -------------------------------------------------------------------------
  // Work-hour variation
  // -------------------------------------------------------------------------

  const workHourValues =
    activeWeekdays
      .filter(
        (item) =>
          item.averageWorkHours !== null,
      )
      .map(
        (item) =>
          item.averageWorkHours!,
      );

  const workHourVariation =
    workHourValues.length
      ? Math.max(...workHourValues) -
        Math.min(...workHourValues)
      : 0;

  // -------------------------------------------------------------------------
  // Detect recurring patterns
  // -------------------------------------------------------------------------

  const patterns: {
    type:
      | "POSITIVE"
      | "WARNING"
      | "INFO";
    title: string;
    description: string;
  }[] = [];

  // Attendance variation
  if (attendanceVariation >= 15) {
    patterns.push({
      type: "WARNING",
      title: "Weekday attendance variation",
      description:
        `Attendance varies by ${attendanceVariation} percentage points across weekdays. ${strongestDay} is your strongest attendance day, while ${weakestDay} is your weakest.`,
    });
  }

  // Check-in variation
  if (checkInVariation >= 30) {
    patterns.push({
      type: "INFO",
      title: "Different check-in habits",
      description:
        "Your average check-in time changes noticeably depending on the weekday.",
    });
  }

  // Work-hour variation
  if (workHourVariation >= 1.5) {
    patterns.push({
      type: "INFO",
      title: "Working-hour variation",
      description:
        "Your recorded working hours vary noticeably across different weekdays.",
    });
  }

  // Strong attendance
  if (
    strongestDay &&
    attendanceVariation < 15
  ) {
    patterns.push({
      type: "POSITIVE",
      title: "Consistent weekday attendance",
      description:
        "Your attendance remains relatively consistent across weekdays.",
    });
  }

  // -------------------------------------------------------------------------
  // Overall attendance rate
  // -------------------------------------------------------------------------

  const totalEquivalent =
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

  const overallAttendanceRate =
    eligibleRecords.length > 0
      ? Math.round(
          (totalEquivalent /
            eligibleRecords.length) *
            100,
        )
      : 0;

  // -------------------------------------------------------------------------
  // Recent 30-day attendance
  // -------------------------------------------------------------------------

  const recentStart = new Date();
  recentStart.setDate(
    recentStart.getDate() - 29,
  );

  const recentStartDate =
    recentStart.toISOString().slice(0, 10);

  const recentRecords =
    eligibleRecords.filter(
      (record) =>
        record.date >= recentStartDate,
      );

  const recentEquivalent =
    recentRecords.reduce(
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

  const recentAttendanceRate =
    recentRecords.length > 0
      ? Math.round(
          (recentEquivalent /
            recentRecords.length) *
            100,
        )
      : 0;

  // -------------------------------------------------------------------------
  // Recommendations
  // -------------------------------------------------------------------------

  const recommendations: string[] = [];

  if (attendanceVariation >= 15) {
    recommendations.push(
      `Pay attention to your attendance on ${weakestDay}, where your attendance rate is relatively lower.`,
    );
  }

  if (checkInVariation >= 30) {
    recommendations.push(
      "Try to maintain a consistent check-in routine across weekdays.",
    );
  }

  if (workHourVariation >= 1.5) {
    recommendations.push(
      "Review your working-hour pattern on weekdays with lower recorded work hours.",
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      "Your attendance pattern is relatively consistent. Continue maintaining the same routine.",
    );
  }

  // -------------------------------------------------------------------------
  // Return result
  // -------------------------------------------------------------------------

  return {
    period: {
      start: startDate,
      end: endDate,
      months,
    },

    summary: {
      attendanceRate: overallAttendanceRate,
      recent30DayRate: recentAttendanceRate,
      strongestDay,
      weakestDay,
    },

    weekdayAnalysis: weekdayData,

    variations: {
      attendancePercentagePoints:
        attendanceVariation,
      checkInMinutes:
        checkInVariation,
      workHours:
        Math.round(
          workHourVariation * 100,
        ) / 100,
    },

    patterns,

    recommendations,
  };
}

// ===========================================================================
// EMPTY RESULT
// ===========================================================================

function emptyPatternResult(
  startDate: string,
  endDate: string,
  months: number,
) {
  return {
    period: {
      start: startDate,
      end: endDate,
      months,
    },

    summary: {
      attendanceRate: 0,
      recent30DayRate: 0,
      strongestDay: null,
      weakestDay: null,
    },

    weekdayAnalysis: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ].map((day) => ({
      day,
      totalDays: 0,
      attendedEquivalent: 0,
      attendanceRate: 0,
      averageCheckInMinutes: null,
      averageWorkHours: null,
    })),

    variations: {
      attendancePercentagePoints: 0,
      checkInMinutes: 0,
      workHours: 0,
    },

    patterns: [],

    recommendations: [
      "No attendance data is available for the selected period.",
    ],
  };
}