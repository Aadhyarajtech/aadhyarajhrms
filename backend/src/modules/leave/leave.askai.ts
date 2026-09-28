import {
  Employee,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  Holiday,
} from "@/db/models";

export interface HolidayBridge {
  holidayName: string;
  holidayDate: string;
  dayOfWeek: string;
  bridgeStartDate: string;
  bridgeEndDate: string;
  suggestedLeaveDates: string[];
  totalConsecutiveDaysOff: number;
  leaveDaysRequired: number;
  description: string;
}

export interface LeaveBalanceSummary {
  leaveTypeName: string;
  leaveTypeId: string;
  colorHex: string;
  allotted: number;
  used: number;
  pending: number;
  available: number;
}

export interface SuggestedLeave {
  leaveTypeId?: string;
  leaveTypeName?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

export interface AskLeaveAIResult {
  answer: string;
  quickActions: string[];
  suggestedLeave?: SuggestedLeave | null;
  holidayBridges?: HolidayBridge[];
  balances?: LeaveBalanceSummary[];
  teamSummary?: {
    totalTeamMembers: number;
    membersOnLeaveSoon: number;
    upcomingLeaves: Array<{
      employeeName: string;
      leaveTypeName: string;
      startDate: string;
      endDate: string;
      days: number;
      status?: string;
    }>;
    allTeamLeaves?: Array<{
      employeeName: string;
      leaveTypeName: string;
      startDate: string;
      endDate: string;
      days: number;
      status?: string;
    }>;
  };
}

const GROQ_BASE_URL =
  process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-20b";

const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 20000);

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Extract target date mentioned in natural language questions (e.g. "28 sep", "monday", "tomorrow").
 */
function extractDateFromQuery(query: string, todayIso: string): string | null {
  const q = query.toLowerCase();
  const today = new Date(`${todayIso}T00:00:00`);

  if (q.includes("today")) {
    return todayIso;
  }
  if (q.includes("tomorrow")) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatDateIso(d);
  }
  if (q.includes("yesterday")) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return formatDateIso(d);
  }

  // ISO date format (YYYY-MM-DD)
  const isoMatch = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) return isoMatch[0];

  // Slash/dash format: DD/MM/YYYY or DD-MM-YYYY or DD/MM
  const dmyMatch = q.match(/\b([0-2]?\d|3[01])[\/\-](0?[1-9]|1[0-2])(?:[\/\-](20\d{2}))?\b/);
  if (dmyMatch) {
    const day = String(dmyMatch[1]).padStart(2, "0");
    const month = String(dmyMatch[2]).padStart(2, "0");
    const year = dmyMatch[3] || String(today.getFullYear());
    return `${year}-${month}-${day}`;
  }

  // Month day patterns: "28 sep", "28th sep", "1st of oct", "sep 28", "october 2", "2 oct"
  const monthNames = [
    { name: "jan", num: "01" }, { name: "feb", num: "02" }, { name: "mar", num: "03" },
    { name: "apr", num: "04" }, { name: "may", num: "05" }, { name: "jun", num: "06" },
    { name: "jul", num: "07" }, { name: "aug", num: "08" }, { name: "sep", num: "09" },
    { name: "oct", num: "10" }, { name: "nov", num: "11" }, { name: "dec", num: "12" },
  ];

  for (const m of monthNames) {
    if (q.includes(m.name)) {
      const m1 = q.match(new RegExp(`(\\b\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${m.name}`));
      const m2 = q.match(new RegExp(`${m.name}\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
      const dayNum = m1 ? parseInt(m1[1], 10) : m2 ? parseInt(m2[1], 10) : null;
      if (dayNum && dayNum >= 1 && dayNum <= 31) {
        const year = today.getFullYear();
        return `${year}-${m.num}-${String(dayNum).padStart(2, "0")}`;
      }
    }
  }

  // Weekdays: "monday", "tuesday", etc. in the coming 7 days
  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < weekdayNames.length; i++) {
    if (q.includes(weekdayNames[i])) {
      const targetDay = i;
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(today);
      d.setDate(d.getDate() + diff);
      return formatDateIso(d);
    }
  }

  return null;
}

/**
 * Detect smart holiday bridge vacation opportunities in the next 120 days.
 */
export function detectHolidayBridges(holidays: Array<{ name: string; date: string }>): HolidayBridge[] {
  const bridges: HolidayBridge[] = [];
  const now = new Date();
  const todayIso = formatDateIso(now);

  const upcomingHolidays = holidays
    .filter((h) => h.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const h of upcomingHolidays) {
    const d = new Date(`${h.date}T00:00:00`);
    const dayOfWeek = d.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat

    // Thursday holiday (day 4) -> take Friday (day 5) -> 4 days off (Thu-Sun)
    if (dayOfWeek === 4) {
      const fri = new Date(d);
      fri.setDate(d.getDate() + 1);
      const sun = new Date(d);
      sun.setDate(d.getDate() + 3);

      bridges.push({
        holidayName: h.name,
        holidayDate: h.date,
        dayOfWeek: "Thursday",
        bridgeStartDate: h.date,
        bridgeEndDate: formatDateIso(sun),
        suggestedLeaveDates: [formatDateIso(fri)],
        totalConsecutiveDaysOff: 4,
        leaveDaysRequired: 1,
        description: `Apply 1 day of leave on Friday (${formatDateIso(fri)}) to enjoy a 4-day mini vacation from Thursday through Sunday!`,
      });
    }

    // Tuesday holiday (day 2) -> take Monday (day 1) -> 4 days off (Sat-Tue)
    if (dayOfWeek === 2) {
      const sat = new Date(d);
      sat.setDate(d.getDate() - 3);
      const mon = new Date(d);
      mon.setDate(d.getDate() - 1);

      bridges.push({
        holidayName: h.name,
        holidayDate: h.date,
        dayOfWeek: "Tuesday",
        bridgeStartDate: formatDateIso(sat),
        bridgeEndDate: h.date,
        suggestedLeaveDates: [formatDateIso(mon)],
        totalConsecutiveDaysOff: 4,
        leaveDaysRequired: 1,
        description: `Apply 1 day of leave on Monday (${formatDateIso(mon)}) to enjoy a 4-day vacation from Saturday through Tuesday!`,
      });
    }

    // Friday holiday (day 5) -> already a 3-day weekend; take Thursday (day 4) for 4 days off
    if (dayOfWeek === 5) {
      const thu = new Date(d);
      thu.setDate(d.getDate() - 1);
      const sun = new Date(d);
      sun.setDate(d.getDate() + 2);

      bridges.push({
        holidayName: h.name,
        holidayDate: h.date,
        dayOfWeek: "Friday",
        bridgeStartDate: formatDateIso(thu),
        bridgeEndDate: formatDateIso(sun),
        suggestedLeaveDates: [formatDateIso(thu)],
        totalConsecutiveDaysOff: 4,
        leaveDaysRequired: 1,
        description: `Already a 3-day weekend! Take Thursday (${formatDateIso(thu)}) for an extended 4-day break.`,
      });
    }

    // Monday holiday (day 1) -> already a 3-day weekend; take Tuesday (day 2) for 4 days off
    if (dayOfWeek === 1) {
      const sat = new Date(d);
      sat.setDate(d.getDate() - 2);
      const tue = new Date(d);
      tue.setDate(d.getDate() + 1);

      bridges.push({
        holidayName: h.name,
        holidayDate: h.date,
        dayOfWeek: "Monday",
        bridgeStartDate: formatDateIso(sat),
        bridgeEndDate: formatDateIso(tue),
        suggestedLeaveDates: [formatDateIso(tue)],
        totalConsecutiveDaysOff: 4,
        leaveDaysRequired: 1,
        description: `Already a 3-day weekend! Take Tuesday (${formatDateIso(tue)}) for an extended 4-day holiday.`,
      });
    }

    // Wednesday holiday (day 3) -> take Thu & Fri for 5 days off (Wed-Sun)
    if (dayOfWeek === 3) {
      const thu = new Date(d);
      thu.setDate(d.getDate() + 1);
      const fri = new Date(d);
      fri.setDate(d.getDate() + 2);
      const sun = new Date(d);
      sun.setDate(d.getDate() + 4);

      bridges.push({
        holidayName: h.name,
        holidayDate: h.date,
        dayOfWeek: "Wednesday",
        bridgeStartDate: h.date,
        bridgeEndDate: formatDateIso(sun),
        suggestedLeaveDates: [formatDateIso(thu), formatDateIso(fri)],
        totalConsecutiveDaysOff: 5,
        leaveDaysRequired: 2,
        description: `Mid-week holiday! Take Thursday & Friday (${formatDateIso(thu)} & ${formatDateIso(fri)}) to get a 5-day continuous vacation.`,
      });
    }
  }

  return bridges.slice(0, 5);
}

/**
 * Resolves context for the AI Leave Assistant based on role and targeted employee.
 */
export async function buildLeaveAssistantContext(params: {
  requesterId: string;
  requesterRole: string;
  targetEmployeeId?: string;
}) {
  const { requesterId, requesterRole, targetEmployeeId } = params;

  // Determine active employee for balances
  const effectiveEmployeeId =
    (requesterRole === "SUPER_ADMIN" || requesterRole === "HR_ADMIN") && targetEmployeeId
      ? targetEmployeeId
      : requesterId;

  const currentYear = new Date().getFullYear();
  const todayIso = formatDateIso(new Date());

  // Fetch employee details
  const [employee, leaveTypes, balances, userRequests, holidays] = await Promise.all([
    Employee.findById(effectiveEmployeeId).lean(),
    LeaveType.find().lean(),
    LeaveBalance.find({ employeeId: effectiveEmployeeId, year: currentYear }).lean(),
    LeaveRequest.find({ employeeId: effectiveEmployeeId })
      .sort({ startDate: -1 })
      .limit(10)
      .lean(),
    Holiday.find({ date: { $gte: `${currentYear}-01-01` } })
      .sort({ date: 1 })
      .lean(),
  ]);

  const leaveTypeMap = new Map(leaveTypes.map((t) => [String(t._id), t]));

  // Calculate pending days per leave type for accurate available balance
  const pendingRequests = userRequests.filter((r) => r.status === "PENDING");
  const pendingMap = new Map<string, number>();
  for (const pr of pendingRequests) {
    const cur = pendingMap.get(pr.leaveTypeId) || 0;
    pendingMap.set(pr.leaveTypeId, cur + (pr.totalDays || 1));
  }

  const balanceSummaries: LeaveBalanceSummary[] = balances.map((b) => {
    const t = leaveTypeMap.get(b.leaveTypeId);
    const pendingDays = pendingMap.get(b.leaveTypeId) || 0;
    const available = Math.max(0, b.allotted + (b.carriedOver || 0) - b.used - pendingDays);
    return {
      leaveTypeId: b.leaveTypeId,
      leaveTypeName: t?.name || "Leave",
      colorHex: t?.colorHex || "#6366F1",
      allotted: b.allotted + (b.carriedOver || 0),
      used: b.used,
      pending: pendingDays,
      available,
    };
  });

  // Calculate Holiday Bridges
  const holidayBridges = detectHolidayBridges(
    holidays.map((h) => ({ name: h.name, date: h.date })),
  );

  // Fetch Team context for all roles (Admins, Managers, and Employees)
  let teamSummary = undefined;
  let teamMemberIds: string[] = [];

  if (requesterRole === "SUPER_ADMIN" || requesterRole === "HR_ADMIN") {
    const allEmps = await Employee.find({ status: "ACTIVE" }).select("_id").limit(50).lean();
    teamMemberIds = allEmps.map((e) => String(e._id));
  } else if (requesterRole === "MANAGER" || employee?.isManager) {
    const teamEmployees = await Employee.find({ managerId: requesterId }).select("_id").lean();
    teamMemberIds = teamEmployees.map((e) => String(e._id));
  } else if (employee) {
    // For regular employees: their team is their department peers and manager peers
    const query: any = { status: "ACTIVE" };
    if (employee.managerId) {
      query.managerId = employee.managerId;
    } else if (employee.departmentId) {
      query.departmentId = employee.departmentId;
    }
    const teamEmployees = await Employee.find(query).select("_id").limit(30).lean();
    teamMemberIds = teamEmployees.map((e) => String(e._id));
  }

  // Filter out requester themselves so team coverage focuses on colleagues
  teamMemberIds = teamMemberIds.filter((id) => id !== requesterId);

  if (teamMemberIds.length > 0) {
      // 30 days past and 30 days upcoming leaves to support historical & future queries
      const pastMonthIso = formatDateIso(new Date(Date.now() - 30 * 86400000));
      const nextMonthIso = formatDateIso(new Date(Date.now() + 30 * 86400000));
      const teamLeaveDocs = await LeaveRequest.find({
        employeeId: { $in: teamMemberIds },
        status: { $in: ["APPROVED", "PENDING"] },
        startDate: { $lte: nextMonthIso },
        endDate: { $gte: pastMonthIso },
      }).lean();

      const uniqueTeamEmployees = await Employee.find({
        _id: { $in: teamLeaveDocs.map((r) => r.employeeId) },
      }).lean();
      const teamEmpMap = new Map(uniqueTeamEmployees.map((e) => [String(e._id), e]));

      // Deduplicate leaves with same employee, startDate, endDate, and leaveTypeId
      const seenLeaves = new Set<string>();
      const dedupedTeamLeaves = teamLeaveDocs.filter((r) => {
        const key = `${r.employeeId}_${r.startDate}_${r.endDate}_${r.leaveTypeId}`;
        if (seenLeaves.has(key)) return false;
        seenLeaves.add(key);
        return true;
      });

      const allMapped = dedupedTeamLeaves.map((r) => {
        const emp = teamEmpMap.get(r.employeeId);
        const type = leaveTypeMap.get(r.leaveTypeId);
        return {
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Team Member",
          leaveTypeName: type?.name || "Leave",
          startDate: r.startDate || "",
          endDate: r.endDate || "",
          days: r.totalDays,
          status: r.status || "APPROVED",
        };
      });

      const upcomingOnly = allMapped.filter((l) => l.endDate >= todayIso);

      teamSummary = {
        totalTeamMembers: teamMemberIds.length,
        membersOnLeaveSoon: new Set(upcomingOnly.map((r) => r.employeeName)).size,
        upcomingLeaves: upcomingOnly.slice(0, 30),
        allTeamLeaves: allMapped.slice(0, 60),
      };
    }

  return {
    employee: employee
      ? {
          id: String(employee._id),
          name: `${employee.firstName} ${employee.lastName}`,
          code: employee.employeeCode,
          designation: employee.designationId,
        }
      : null,
    currentYear,
    todayIso,
    balances: balanceSummaries,
    holidayBridges,
    allHolidays: holidays.map((h) => {
      const d = new Date(`${h.date}T00:00:00`);
      const dayOfWeek = DAY_NAMES[d.getDay()] || "";
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      return {
        name: h.name,
        date: h.date,
        dayOfWeek,
        isWeekend,
        isOptional: h.isOptional,
      };
    }),
    holidays: holidays
      .filter((h) => h.date >= todayIso)
      .slice(0, 15)
      .map((h) => {
        const d = new Date(`${h.date}T00:00:00`);
        const dayOfWeek = DAY_NAMES[d.getDay()] || "";
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        return {
          name: h.name,
          date: h.date,
          dayOfWeek,
          isWeekend,
          isOptional: h.isOptional,
        };
      }),
    recentRequests: userRequests.slice(0, 8).map((r) => {
      const t = leaveTypeMap.get(r.leaveTypeId);
      return {
        type: t?.name || "Leave",
        startDate: r.startDate,
        endDate: r.endDate,
        days: r.totalDays,
        status: r.status,
        reason: r.reason,
      };
    }),
    teamSummary,
  };
}

/**
 * Execute conversational Q&A for the AI Leave Assistant with Groq LLM & structured fallback.
 */
export async function askLeaveAI(params: {
  requesterId: string;
  requesterRole: string;
  question: string;
  targetEmployeeId?: string;
}): Promise<AskLeaveAIResult> {
  const context = await buildLeaveAssistantContext(params);
  const question = params.question.trim();

  const apiKey = process.env.GROQ_API_KEY;

  // Fallback generation if offline or API key missing
  const buildFallback = (): AskLeaveAIResult => {
    const q = question.toLowerCase();

    // Balance query
    if (q.includes("balance") || q.includes("how many") || q.includes("left")) {
      const balanceLines = context.balances.map(
        (b) => `• **${b.leaveTypeName}**: ${b.available} days available (${b.used} used, ${b.pending} pending)`,
      );
      return {
        answer: `Here is your current leave balance for **${context.currentYear}**:\n\n${balanceLines.join(
          "\n",
        )}\n\nYou can apply for any available balance by clicking **Apply for leave**.`,
        quickActions: [
          "Plan a holiday bridge vacation",
          "Check upcoming public holidays",
          "Draft a leave application",
        ],
        balances: context.balances,
        holidayBridges: context.holidayBridges,
      };
    }

    // Holiday & bridge query
    if (q.includes("holiday") || q.includes("bridge") || q.includes("weekend") || q.includes("vacation")) {
      if (context.holidayBridges.length > 0) {
        const bridge = context.holidayBridges[0];
        return {
          answer: `I found a great long-weekend opportunity for you!\n\nAround **${bridge.holidayName}** (${bridge.holidayDate}, ${bridge.dayOfWeek}), you can take **${bridge.leaveDaysRequired} day of leave** on ${bridge.suggestedLeaveDates.join(", ")} to enjoy **${bridge.totalConsecutiveDaysOff} consecutive days off** from ${bridge.bridgeStartDate} to ${bridge.bridgeEndDate}.\n\nWould you like me to prepare this leave request for you?`,
          quickActions: [
            `Apply for ${bridge.holidayName} vacation`,
            "What is my casual leave balance?",
            "Check team availability next week",
          ],
          suggestedLeave: {
            startDate: bridge.suggestedLeaveDates[0],
            endDate: bridge.suggestedLeaveDates[bridge.suggestedLeaveDates.length - 1],
            reason: `Annual vacation planned around ${bridge.holidayName}`,
          },
          holidayBridges: context.holidayBridges,
        };
      } else {
        const upcomingList = context.holidays.map((h) => `• **${h.name}**: ${h.date}`);
        return {
          answer: `Here are the upcoming public holidays:\n\n${upcomingList.join("\n")}`,
          quickActions: ["Check my leave balance", "Draft a leave application"],
        };
      }
    }

    // Leave Policy & Rules query (e.g. "Review Leave Policy", "what is the leave policy", "leave rules", "how many leaves")
    if (
      q.includes("policy") ||
      q.includes("rule") ||
      q.includes("guideline") ||
      q.includes("handbook") ||
      q.includes("how many days") ||
      q.includes("types of leave") ||
      q.includes("leave type") ||
      q.includes("carry forward")
    ) {
      return {
        answer: `### 📋 Aadhyaraj HRMS Leave Policy & Entitlements\n\nOur company provides structured paid and statutory leaves to maintain employee well-being, work-life balance, and operational continuity:\n\n| Leave Type | Annual Allotment | Carry Forward | Purpose & Key Rules |\n|---|---|---|---|\n| **Privilege Leave (PL)** | **18 Days** | Up to 10 Days | Planned vacations and personal rest. Apply at least 3 business days in advance. |\n| **Sick Leave (SL)** | **12 Days** | No (Lapses Dec 31) | Medical conditions and doctor-advised recovery. Medical certificate required if > 2 consecutive days. |\n| **Casual Leave (CL)** | **8 Days** | No (Lapses Dec 31) | Urgent or unforeseen personal obligations. Can be taken as half-day. |\n| **Maternity Leave** | **182 Days (26 Weeks)** | Statutory | Fully paid leave for eligible female employees as per statutory norms. |\n| **Paternity Leave** | **15 Days** | N/A | Fully paid leave for new fathers, applicable within 6 months of childbirth/adoption. |\n| **Loss of Pay (LOP)** | Discretionary | N/A | Applied when all paid leave quotas are exhausted. Requires HR and manager approval. |\n\n#### 📌 Key Policy Highlights:\n1. **5-Day Work Week:** Working days are **Monday to Friday**. Saturdays and Sundays are regular weekly offs and are **never** deducted from your leave balances.\n2. **Public Holidays:** Any official company holiday falling within your approved leave dates is excluded from the leave count.\n3. **Half-Day Option:** Supported for both **First Half** (morning) and **Second Half** (afternoon) for Casual and Sick leave.\n4. **Approval Flow:** All leave requests must be submitted through this portal and approved by your reporting manager.\n\nWould you like me to check your available balances or draft a formal leave application for you?`,
        quickActions: [
          "What is my remaining leave balance?",
          "Find upcoming holiday bridge opportunities",
          "Who in my team is scheduled to be on leave during the next 14 days?",
          "Draft a 2-day medical leave application",
        ],
        balances: context.balances,
        holidayBridges: context.holidayBridges,
        teamSummary: context.teamSummary,
      };
    }

    // Draft leave application / letter query (e.g. "Help me draft a formal 3-day leave request", "draft medical leave", "leave application")
    if (
      q.includes("draft") ||
      q.includes("write a leave") ||
      q.includes("leave application") ||
      q.includes("leave letter") ||
      q.includes("leave request for") ||
      q.includes("email to manager") ||
      q.includes("family event") ||
      q.includes("reason for leave")
    ) {
      // Determine duration (e.g. "3-day", "2 days", etc.)
      const daysMatch = q.match(/(\d+)\s*[- ]?(?:day|days)/);
      const requestedDays = daysMatch ? Math.min(30, Math.max(1, parseInt(daysMatch[1], 10))) : 1;

      // Determine leave type and reason
      let selectedType = "Casual Leave";
      let reasonText = "personal family commitments";

      if (
        q.includes("medical") ||
        q.includes("sick") ||
        q.includes("doctor") ||
        q.includes("health") ||
        q.includes("fever") ||
        q.includes("surgery")
      ) {
        selectedType = "Sick Leave";
        reasonText = "medical rest and recovery";
      } else if (
        q.includes("vacation") ||
        q.includes("trip") ||
        q.includes("holiday") ||
        q.includes("travel")
      ) {
        selectedType = "Privilege Leave";
        reasonText = "annual vacation with family";
      } else if (
        q.includes("family") ||
        q.includes("wedding") ||
        q.includes("function") ||
        q.includes("emergency")
      ) {
        selectedType = "Casual Leave";
        reasonText = "an important family event";
      }

      const matchingBalance =
        context.balances.find((b) =>
          b.leaveTypeName.toLowerCase().includes(selectedType.toLowerCase()),
        ) || context.balances[0];

      // Calculate future working dates (starting from tomorrow or next Monday if weekend)
      const startDateObj = new Date(`${context.todayIso}T00:00:00`);
      startDateObj.setDate(startDateObj.getDate() + 1);
      if (startDateObj.getDay() === 0) startDateObj.setDate(startDateObj.getDate() + 1);
      if (startDateObj.getDay() === 6) startDateObj.setDate(startDateObj.getDate() + 2);

      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(startDateObj.getDate() + (requestedDays - 1));

      const startIso = formatDateIso(startDateObj);
      const endIso = formatDateIso(endDateObj);
      const empName = context.employee?.name || "Employee";

      return {
        answer: `### ✉️ Formal Leave Application Draft\n\nHere is a professionally written leave application tailored for **${empName}** ready to submit to your manager:\n\n---\n\n**Subject:** Leave Application: ${selectedType} – ${empName} (${startIso} to ${endIso})\n\nDear [Manager Name],\n\nI am writing to formally request **${requestedDays} working day${requestedDays > 1 ? "s" : ""} of ${selectedType}** from **${startIso}** to **${endIso}** due to **${reasonText}**.\n\nI have planned my work schedule to ensure all deliverables are up-to-date prior to my departure. I will hand over critical ongoing tasks to my team members and will remain reachable via phone or email for any urgent escalations.\n\nThank you for considering and approving my leave request.\n\nWarm regards,  \n**${empName}**  \n${context.employee?.code ? `Employee Code: ${context.employee.code}` : "Aadhyaraj Technologies"}\n\n---\n\n💡 *Tip: You can click the quick action below to immediately apply for this leave.*`,
        quickActions: [
          `Apply for ${requestedDays}-day ${selectedType}`,
          "What is my remaining leave balance?",
          "Who in my team is scheduled to be on leave during the next 14 days?",
          "Review Leave Policy",
        ],
        suggestedLeave: {
          startDate: startIso,
          endDate: endIso,
          leaveTypeId: matchingBalance?.leaveTypeId,
          leaveTypeName: matchingBalance?.leaveTypeName || selectedType,
          reason: `Requested for ${reasonText}`,
        },
        balances: context.balances,
        holidayBridges: context.holidayBridges,
        teamSummary: context.teamSummary,
      };
    }

    // Same-day leave or date-specific conflict query (e.g. "is anyone on leave on 28 sep", "who was on leave on 1 sep")
    const targetDate = extractDateFromQuery(q, context.todayIso);
    const isSameDayQuery =
      q.includes("same day") ||
      q.includes("conflict") ||
      q.includes("anyone on leave") ||
      q.includes("who is on leave on") ||
      q.includes("can i take leave on") ||
      q.includes("leave on the same day") ||
      q.includes("on leave on");

    if (isSameDayQuery || (targetDate && (q.includes("leave") || q.includes("who")))) {
      const checkDate = targetDate || context.todayIso;
      const allAvailableLeaves = context.teamSummary?.allTeamLeaves || context.teamSummary?.upcomingLeaves || [];
      const sameDayLeaves = allAvailableLeaves.filter(
        (l) => l.startDate <= checkDate && l.endDate >= checkDate,
      );

      if (sameDayLeaves.length > 0) {
        const rows = sameDayLeaves.map((l) => {
          const dateStr = l.startDate === l.endDate ? l.startDate : `${l.startDate} – ${l.endDate}`;
          const durationStr = l.days > 0 ? `${l.days}d` : "1d (Weekend/Holiday)";
          return `| ${l.employeeName} | ${l.leaveTypeName} | ${dateStr} (${durationStr}) | **${l.status || "APPROVED"}** |`;
        });
        const rolePrefix =
          params.requesterRole === "SUPER_ADMIN" || params.requesterRole === "HR_ADMIN"
            ? "Across the organization / department"
            : "In your team";

        return {
          answer: `⚠️ **Leave Alert for ${checkDate}:**\n\n${rolePrefix}, **${sameDayLeaves.length} colleague${sameDayLeaves.length === 1 ? " is" : "s are"}** on leave on this date:\n\n| Employee | Leave Type | Date Range | Status |\n|---|---|---|---|\n${rows.join(
            "\n",
          )}\n\n*Note: Taking leave on this day may reduce team coverage.*`,
          quickActions: [
            "What is my remaining leave balance?",
            "Who in my team is scheduled to be on leave during the next 14 days?",
            "Find upcoming holiday bridge opportunities",
          ],
          balances: context.balances,
          teamSummary: context.teamSummary,
        };
      } else if (targetDate) {
        return {
          answer: `✅ **No Conflicts for ${checkDate}:**\n\nNone of your team members are on leave on **${checkDate}**. Team coverage is at **100%**, so you can plan your time off smoothly!`,
          quickActions: [
            `Apply for leave on ${checkDate}`,
            "What is my remaining leave balance?",
            "Find upcoming holiday bridge opportunities",
          ],
          suggestedLeave: {
            startDate: checkDate,
            endDate: checkDate,
            reason: "Personal time off",
          },
          balances: context.balances,
          teamSummary: context.teamSummary,
        };
      }
    }

    // Team & Coverage query (e.g. "Who in my team is scheduled to be on leave during the next 14 days?", "next week", "this week")
    if (
      q.includes("team") ||
      q.includes("colleague") ||
      q.includes("who is on leave") ||
      q.includes("who in my team") ||
      q.includes("scheduled to be on leave") ||
      q.includes("coverage")
    ) {
      const allLeaves = context.teamSummary?.allTeamLeaves || context.teamSummary?.upcomingLeaves || [];
      const today = new Date(`${context.todayIso}T00:00:00`);
      const currentDay = today.getDay(); // 0 is Sun, 1 is Mon...

      const isNextWeek = q.includes("next week");
      const isThisWeek = q.includes("this week");

      let filteredLeaves = context.teamSummary?.upcomingLeaves || [];
      let periodLabel = "in the upcoming days";

      if (isNextWeek) {
        // Calculate next week's Monday and Friday
        const daysToNextMon = currentDay === 0 ? 1 : 8 - currentDay;
        const nextMon = new Date(today);
        nextMon.setDate(today.getDate() + daysToNextMon);
        const nextFri = new Date(nextMon);
        nextFri.setDate(nextMon.getDate() + 4);

        const nextMonIso = formatDateIso(nextMon);
        const nextFriIso = formatDateIso(nextFri);
        periodLabel = `for next week (${nextMonIso} to ${nextFriIso})`;

        filteredLeaves = allLeaves.filter(
          (l) => l.startDate <= nextFriIso && l.endDate >= nextMonIso,
        );
      } else if (isThisWeek) {
        // Calculate this week's Monday and Friday
        const daysFromMon = currentDay === 0 ? -6 : 1 - currentDay;
        const thisMon = new Date(today);
        thisMon.setDate(today.getDate() + daysFromMon);
        const thisFri = new Date(thisMon);
        thisFri.setDate(thisMon.getDate() + 4);

        const thisMonIso = formatDateIso(thisMon);
        const thisFriIso = formatDateIso(thisFri);
        periodLabel = `for this week (${thisMonIso} to ${thisFriIso})`;

        filteredLeaves = allLeaves.filter(
          (l) => l.startDate <= thisFriIso && l.endDate >= thisMonIso,
        );
      }

      if (filteredLeaves.length > 0) {
        const rows = filteredLeaves.map((l) => {
          const dateStr = l.startDate === l.endDate ? l.startDate : `${l.startDate} – ${l.endDate}`;
          const durationStr = l.days > 0 ? `${l.days}d` : "1d";
          return `| ${l.employeeName} | ${l.leaveTypeName} | ${dateStr} (${durationStr}) | ${l.status || "APPROVED"} |`;
        });
        return {
          answer: `Here is the leave schedule for your team **${periodLabel}**:\n\n| Employee Name | Leave Type | Dates | Status |\n|---|---|---|---|\n${rows.join(
            "\n",
          )}\n\n*Note: All dates fall on working days (Monday-Friday). All other team members are available.*`,
          quickActions: [
            "What is my remaining leave balance?",
            "Find upcoming holiday bridge opportunities",
            "Review Leave Policy",
          ],
          balances: context.balances,
          teamSummary: context.teamSummary,
        };
      } else {
        return {
          answer: `Good news! None of your team members are scheduled to be on leave **${periodLabel}**. Team coverage is at **100%**.`,
          quickActions: [
            "What is my remaining leave balance?",
            "Find upcoming holiday bridge opportunities",
            "Review Leave Policy",
          ],
          balances: context.balances,
          teamSummary: context.teamSummary,
        };
      }
    }

    // Specific month query (e.g. "show me leave for nov", "leaves in december")
    const months = [
      { name: "January", keys: ["january", "jan"], num: "01" },
      { name: "February", keys: ["february", "feb"], num: "02" },
      { name: "March", keys: ["march", "mar"], num: "03" },
      { name: "April", keys: ["april", "apr"], num: "04" },
      { name: "May", keys: ["may"], num: "05" },
      { name: "June", keys: ["june", "jun"], num: "06" },
      { name: "July", keys: ["july", "jul"], num: "07" },
      { name: "August", keys: ["august", "aug"], num: "08" },
      { name: "September", keys: ["september", "sep", "sept"], num: "09" },
      { name: "October", keys: ["october", "oct"], num: "10" },
      { name: "November", keys: ["november", "nov"], num: "11" },
      { name: "December", keys: ["december", "dec"], num: "12" },
    ];
    const targetMonth = months.find((m) => m.keys.some((k) => q.includes(k)));
    if (targetMonth) {
      const monthPrefix = `${context.currentYear}-${targetMonth.num}`;
      const monthHolidays = context.allHolidays.filter((h) => h.date.startsWith(monthPrefix));
      const monthRequests = context.recentRequests.filter(
        (r) => String(r.startDate).startsWith(monthPrefix) || String(r.endDate).startsWith(monthPrefix),
      );

      const lines: string[] = [];
      lines.push(
        `Here is your leave & holiday summary for **${targetMonth.name} ${context.currentYear}**:\n`,
      );
      if (monthHolidays.length > 0) {
        const workdayHolidays = monthHolidays.filter((h) => !h.isWeekend);
        const weekendHolidays = monthHolidays.filter((h) => h.isWeekend);

        if (workdayHolidays.length > 0) {
          lines.push(`**Official Working-Day Holidays (Monday to Friday):**`);
          workdayHolidays.forEach((h) =>
            lines.push(`• **${h.name}**: ${h.date} (${h.dayOfWeek})`),
          );
        } else {
          lines.push(
            `• **Working-Day Holidays:** No Monday–Friday company holidays scheduled in ${targetMonth.name}.`,
          );
        }

        if (weekendHolidays.length > 0) {
          lines.push(`\n*Note on Weekend Festivals:*`);
          weekendHolidays.forEach((h) =>
            lines.push(
              `• ${h.name} falls on ${h.date} (${h.dayOfWeek}), which is already a regular weekly off.`,
            ),
          );
        }
      } else {
        lines.push(
          `• **Company Holidays:** No public holidays scheduled in ${targetMonth.name}.`,
        );
      }

      if (monthRequests.length > 0) {
        lines.push(`\n**Your Leave Requests in ${targetMonth.name}:**`);
        monthRequests.forEach((r) =>
          lines.push(`• **${r.type}**: ${r.startDate} to ${r.endDate} (${r.days}d) - Status: **${r.status}**`),
        );
      } else {
        lines.push(`\n• **Your Leave Requests:** You do not have any leave scheduled or applied for in ${targetMonth.name}.`);
      }

      const availableBalances = context.balances
        .filter((b) => b.available > 0)
        .map((b) => `**${b.leaveTypeName}** (${b.available}d)`)
        .join(", ");
      if (availableBalances) {
        lines.push(`\n**Available Balances:** ${availableBalances}`);
      }

      return {
        answer: lines.join("\n"),
        quickActions: [
          `Apply for leave in ${targetMonth.name}`,
          "What is my remaining leave balance?",
          "Find upcoming holiday bridge opportunities",
        ],
        balances: context.balances,
        holidayBridges: context.holidayBridges,
        teamSummary: context.teamSummary,
      };
    }

    // Default polite response
    return {
      answer: `Hello ${context.employee?.name || "there"}! I am your **AI Leave Assistant**.\n\nI can help you with:\n• **Checking your leave balances** and available days\n• **Finding holiday bridge vacations** to maximize your time off with minimum leave\n• **Drafting professional leave reasons**\n• **Checking team coverage and holiday calendars**\n\nHow can I help you plan your time off today?`,
      quickActions: [
        "What is my remaining leave balance?",
        "Find upcoming holiday bridge opportunities",
        "Who is on leave in my team next week?",
        "Draft a 2-day medical leave request",
      ],
      balances: context.balances,
      holidayBridges: context.holidayBridges,
      teamSummary: context.teamSummary,
    };
  };

  if (!apiKey) {
    return buildFallback();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const prompt = `
You are the AI Leave Assistant for Aadhyaraj HRMS.
Analyze the user's question with the provided live HRMS context and respond with helpful, empathetic, and professional advice.

LIVE HRMS CONTEXT:
- Employee: ${context.employee?.name || "Employee"} (Code: ${context.employee?.code || "N/A"})
- Current Date: ${context.todayIso} (Year: ${context.currentYear})
- Leave Balances:
${context.balances.map((b) => `  * ${b.leaveTypeName} (ID: ${b.leaveTypeId}): Available: ${b.available}, Used: ${b.used}, Pending: ${b.pending}, Total: ${b.allotted}`).join("\n")}
- Discovered Holiday Bridges:
${context.holidayBridges.map((hb) => `  * Around ${hb.holidayName} (${hb.holidayDate}): Take ${hb.suggestedLeaveDates.join(", ")} -> ${hb.totalConsecutiveDaysOff} days off (${hb.description})`).join("\n")}
- Standard Working Schedule: Monday to Friday (5-day work week). Saturday and Sunday are regular weekly offs.
- All Company Holidays for ${context.currentYear}:
${context.allHolidays.map((h) => `  * ${h.name} on ${h.date} (${h.dayOfWeek}${h.isWeekend ? " - Weekend Weekly Off" : " - Workday Holiday"}${h.isOptional ? ", Optional" : ""})`).join("\n")}
- Recent User Leave Requests:
${context.recentRequests.map((r) => `  * ${r.type} from ${r.startDate} to ${r.endDate} (${r.days}d) - Status: ${r.status}${r.reason ? ` (${r.reason})` : ""}`).join("\n")}
- Team Coverage & Leaves (if available):
${context.teamSummary ? `  * Total Team Members: ${context.teamSummary.totalTeamMembers}\n  * Members off soon: ${context.teamSummary.membersOnLeaveSoon}\n  * Leaves: ${JSON.stringify(context.teamSummary.upcomingLeaves)}` : "Not applicable"}

USER QUESTION: "${question}"

INSTRUCTIONS:
1. Provide a direct, courteous, and nicely formatted answer using GitHub markdown.
2. Carefully answer the user's question:
   - WORKDAY AWARENESS (Mon–Fri): The company operates on a Monday–Friday schedule with Saturday and Sunday as regular weekly offs.
   - When asked about company holidays or time off in a month, focus on working-day holidays (Monday to Friday) that grant employees a day off from work. Always mention the day of the week (e.g. "Monday, November 9").
   - If a holiday falls on a Saturday or Sunday, explicitly clarify that it falls on a weekend (regular weekly off). If a month has no Monday to Friday holidays, state that there are no working-day holidays scheduled for that month.
   - If asking for balances, list available days per leave type.
   - If asking for long weekends or bridge vacations, suggest exact dates from Discovered Holiday Bridges.
   - LEAVE POLICY & RULES:
     * When asked about company leave policy, rules, guidelines, or leave types (e.g. "Review Leave Policy"):
     * Provide a clear, beautifully structured overview: Privilege Leave (18 days/year, up to 10 days carry-forward), Sick Leave (12 days/year), Casual Leave (8 days/year), Maternity Leave (182 days / 26 weeks), Paternity Leave (15 days), Loss of Pay (unpaid).
     * Clarify that weekends (Sat/Sun) and public holidays are not deducted from leaves. Mention that applications require manager approval and half-day leaves are supported.
   - SAME-DAY LEAVE & CONFLICT ALERTS (CRUCIAL):
     * When a user (HR or Employee) asks about taking leave on a specific day/date (or asks "Is anyone on leave on the same day?", "Who is on leave on [date]?", "Can I take leave on [date]?"):
     * Cross-reference the requested date with "Team Coverage & Leaves".
     * If ANY colleague has approved or pending leave on that date, you MUST explicitly alert the user:
       "⚠️ **Same-day Leave Alert**: On [Date], [Colleague Name] is scheduled for [Leave Type] (Status: [Status]). Taking leave on this day will reduce your team coverage."
     * If NO colleagues have leave on that date, confirm: "✅ **No Conflicts**: No team members are currently on leave on [Date]. Team coverage is at 100%."
     * For HR POV: Always provide a full Markdown table of every employee on leave on that date with their status (Approved or Pending).
3. If the user's question suggests planning or taking leave, populate "suggestedLeave" with { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "leaveTypeId": "...", "leaveTypeName": "...", "reason": "..." }. Otherwise set "suggestedLeave": null.
4. Provide 3-4 concise, relevant follow-up "quickActions".
5. Return ONLY a valid JSON object with keys: "answer" (string), "quickActions" (string array), and "suggestedLeave" (object or null).
`;

    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert HRMS Leave Copilot. You answer questions strictly based on the provided company leave and holiday data. Output only valid JSON with keys: answer, quickActions, suggestedLeave.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_completion_tokens: 700,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn("Groq request failed with status", response.status, errText);
      return buildFallback();
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return buildFallback();

    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.warn("Failed to parse Groq JSON:", parseErr);
      return buildFallback();
    }

    const isHolidayOrVacationQuery =
      question.toLowerCase().includes("holiday") ||
      question.toLowerCase().includes("bridge") ||
      question.toLowerCase().includes("weekend") ||
      question.toLowerCase().includes("vacation") ||
      question.toLowerCase().includes("trip");

    return {
      answer: parsed.answer || buildFallback().answer,
      quickActions:
        Array.isArray(parsed.quickActions) && parsed.quickActions.length > 0
          ? parsed.quickActions
          : buildFallback().quickActions,
      suggestedLeave: parsed.suggestedLeave || null,
      holidayBridges: isHolidayOrVacationQuery ? context.holidayBridges : undefined,
      balances: context.balances,
      teamSummary: context.teamSummary,
    };
  } catch (err) {
    console.error("AskLeaveAI error, falling back:", err);
    return buildFallback();
  } finally {
    clearTimeout(timeout);
  }
}
