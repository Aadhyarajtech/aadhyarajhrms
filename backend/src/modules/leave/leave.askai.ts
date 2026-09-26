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

  // Fetch Team context if Manager or Admin
  let teamSummary = undefined;
  if (requesterRole === "MANAGER" || requesterRole === "SUPER_ADMIN" || requesterRole === "HR_ADMIN") {
    let teamMemberIds: string[] = [];
    if (requesterRole === "MANAGER") {
      const teamEmployees = await Employee.find({ managerId: requesterId }).select("_id").lean();
      teamMemberIds = teamEmployees.map((e) => String(e._id));
    } else {
      const allEmps = await Employee.find({ status: "ACTIVE" }).select("_id").limit(50).lean();
      teamMemberIds = allEmps.map((e) => String(e._id));
    }

    if (teamMemberIds.length > 0) {
      // Upcoming 30 days leaves
      const nextMonthIso = formatDateIso(new Date(Date.now() + 30 * 86400000));
      const upcomingTeamLeaves = await LeaveRequest.find({
        employeeId: { $in: teamMemberIds },
        status: "APPROVED",
        startDate: { $lte: nextMonthIso },
        endDate: { $gte: todayIso },
      }).lean();

      const uniqueTeamEmployees = await Employee.find({
        _id: { $in: upcomingTeamLeaves.map((r) => r.employeeId) },
      }).lean();
      const teamEmpMap = new Map(uniqueTeamEmployees.map((e) => [String(e._id), e]));

      teamSummary = {
        totalTeamMembers: teamMemberIds.length,
        membersOnLeaveSoon: new Set(upcomingTeamLeaves.map((r) => r.employeeId)).size,
        upcomingLeaves: upcomingTeamLeaves.slice(0, 8).map((r) => {
          const emp = teamEmpMap.get(r.employeeId);
          const type = leaveTypeMap.get(r.leaveTypeId);
          return {
            employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Team Member",
            leaveTypeName: type?.name || "Leave",
            startDate: r.startDate || "",
            endDate: r.endDate || "",
            days: r.totalDays,
          };
        }),
      };
    }
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
   - If asking to draft a leave application or reason, provide a polite, formal reason ready for copy-pasting.
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

    return {
      answer: parsed.answer || buildFallback().answer,
      quickActions:
        Array.isArray(parsed.quickActions) && parsed.quickActions.length > 0
          ? parsed.quickActions
          : buildFallback().quickActions,
      suggestedLeave: parsed.suggestedLeave || null,
      holidayBridges: context.holidayBridges,
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
