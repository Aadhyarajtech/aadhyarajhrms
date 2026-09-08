import { Attendance, Employee } from "@/db/models";

// ===========================================================================
// SMART REGULARIZATION ASSISTANT
// ===========================================================================

export async function analyzeAttendanceForRegularization(
  employeeId: string,
  date: string,
) {
  // -------------------------------------------------------------------------
  // Validate date format
  // -------------------------------------------------------------------------

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid attendance date.");
  }

  // -------------------------------------------------------------------------
  // Validate actual date
  // -------------------------------------------------------------------------

  const parsedDate = new Date(
    `${date}T00:00:00.000Z`,
  );

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid attendance date.");
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
  // Check employee employment period
  // -------------------------------------------------------------------------

  if (date < employee.dateOfJoining) {
    return {
      date,
      eligible: false,
      issue:
        "Employee was not employed on this date.",
      suggestion: null,
      attendance: null,
    };
  }

  if (
    employee.dateOfExit &&
    date > employee.dateOfExit
  ) {
    return {
      date,
      eligible: false,
      issue:
        "Employee was not employed on this date.",
      suggestion: null,
      attendance: null,
    };
  }

  // -------------------------------------------------------------------------
  // Get attendance record
  // -------------------------------------------------------------------------

  const attendance = await Attendance.findOne({
    employeeId,
    date,
  }).lean();

  // -------------------------------------------------------------------------
  // No attendance record
  // -------------------------------------------------------------------------

  if (!attendance) {
    return {
      date,
      eligible: true,

      issue:
        "No attendance record was found for this date.",

      suggestion:
        "I was unable to record my attendance for this date and would like to request regularization.",

      attendance: null,
    };
  }

  // -------------------------------------------------------------------------
  // Holiday / Weekend
  // -------------------------------------------------------------------------

  if (
    attendance.status === "HOLIDAY" ||
    attendance.status === "WEEKEND"
  ) {
    return {
      date,
      eligible: false,

      issue:
        "Regularization is not required for a holiday or weekend.",

      suggestion: null,

      attendance: {
        status: attendance.status,
        checkIn: attendance.checkIn ?? null,
        checkOut: attendance.checkOut ?? null,
        workHours:
          attendance.workHours ?? null,
        isRegularized:
          attendance.isRegularized ?? false,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Leave
  // -------------------------------------------------------------------------

  if (attendance.status === "ON_LEAVE") {
    return {
      date,
      eligible: false,

      issue:
        "This date is already marked as leave. Regularization is not required.",

      suggestion: null,

      attendance: {
        status: attendance.status,
        checkIn: attendance.checkIn ?? null,
        checkOut: attendance.checkOut ?? null,
        workHours:
          attendance.workHours ?? null,
        isRegularized:
          attendance.isRegularized ?? false,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Already regularized
  // -------------------------------------------------------------------------

  if (attendance.isRegularized) {
    return {
      date,
      eligible: false,

      issue:
        "This attendance record has already been regularized.",

      suggestion: null,

      attendance: {
        status: attendance.status,
        checkIn: attendance.checkIn ?? null,
        checkOut: attendance.checkOut ?? null,
        workHours:
          attendance.workHours ?? null,
        isRegularized: true,
        note: attendance.note ?? null,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Detect attendance issue
  // -------------------------------------------------------------------------

  let issue = "";
  let suggestion = "";

  // -------------------------------------------------------------------------
  // Missing checkout
  // -------------------------------------------------------------------------

  if (
    attendance.checkIn &&
    !attendance.checkOut
  ) {
    issue =
      "Check-in is recorded, but checkout is missing.";

    suggestion =
      "I forgot to record my checkout for this date. Please regularize my attendance based on my actual working hours.";
  }

  // -------------------------------------------------------------------------
  // Absent
  // -------------------------------------------------------------------------

  else if (
    attendance.status === "ABSENT"
  ) {
    issue =
      "The attendance record is marked as absent.";

    suggestion =
      "My attendance was incorrectly marked as absent. Please review and regularize my attendance for this date.";
  }

  // -------------------------------------------------------------------------
  // Half day
  // -------------------------------------------------------------------------

  else if (
    attendance.status === "HALF_DAY"
  ) {
    issue =
      "The attendance record is marked as half-day.";

    suggestion =
      "My attendance was recorded as a half-day. Please review my attendance and regularize it if required.";
  }

  // -------------------------------------------------------------------------
  // Present / WFH with complete attendance
  // -------------------------------------------------------------------------

  else {
    return {
      date,
      eligible: false,

      issue:
        "No attendance issue was detected for this date. Your attendance record appears complete.",

      suggestion: null,

      attendance: {
        status: attendance.status,
        checkIn: attendance.checkIn ?? null,
        checkOut: attendance.checkOut ?? null,
        workHours:
          attendance.workHours ?? null,
        isRegularized:
          attendance.isRegularized ?? false,
        note: attendance.note ?? null,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Return issue analysis
  // -------------------------------------------------------------------------

  return {
    date,
    eligible: true,

    issue,
    suggestion,

    attendance: {
      status: attendance.status,
      checkIn: attendance.checkIn ?? null,
      checkOut: attendance.checkOut ?? null,
      workHours:
        attendance.workHours ?? null,
      isRegularized:
        attendance.isRegularized ?? false,
      note: attendance.note ?? null,
    },
  };
}