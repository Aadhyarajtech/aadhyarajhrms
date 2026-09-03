import {
  Asset,
  Attendance,
  Candidate,
  Department,
  DocumentRecord,
  DocumentRequest,
  Employee,
  JobPosting,
  LeaveRequest,
  PayrollRun,
  Payslip,
  PerformanceReview,
  PerformanceOutcome,
  Ticket,
} from "@/db/models";

export interface ReportFilters {
  from?: string;
  to?: string;
  departmentId?: string;
}

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
}

function inScope(field: string, ids?: string[]) {
  return ids?.length ? { [field]: { $in: ids } } : {};
}

async function scopeEmployeeIds(role: string, employeeId: string | null) {
  if (role !== "MANAGER" || !employeeId) return undefined;
  const rows = await Employee.find({ managerId: employeeId }).select("_id").lean();
  return rows.map((row) => row._id);
}

async function workforce(filters: ReportFilters, employeeIds?: string[]) {
  const query: any = {
    ...inScope("_id", employeeIds),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  };
  const [total, active, byStatus, byDepartment, byEmploymentType, recentHires, exits] = await Promise.all([
    Employee.countDocuments(query),
    Employee.countDocuments({ ...query, status: "ACTIVE" }),
    Employee.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Employee.aggregate([
      { $match: query },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Employee.aggregate([
      { $match: query },
      { $group: { _id: "$employmentType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Employee.countDocuments({ ...query, dateOfJoining: dateRange(filters.from, filters.to) ?? { $exists: true } }),
    Employee.countDocuments({ ...query, dateOfExit: { $ne: null, ...(dateRange(filters.from, filters.to) ?? {}) } }),
  ]);
  const departments = await Department.find().select("_id name").lean();
  const names = new Map(departments.map((d) => [d._id, d.name]));
  return {
    total,
    active,
    recentHires,
    exits,
    byStatus: byStatus.map((x) => ({ label: x._id, value: x.count })),
    byDepartment: byDepartment.map((x) => ({ label: names.get(x._id) ?? x._id, value: x.count })),
    byEmploymentType: byEmploymentType.map((x) => ({ label: x._id, value: x.count })),
  };
}

async function attendance(filters: ReportFilters, employeeIds?: string[]) {
  const query: any = {
    ...inScope("employeeId", employeeIds),
    ...(dateRange(filters.from, filters.to) ? { date: dateRange(filters.from, filters.to) } : {}),
  };
  const [total, byStatus, workHours, regularized] = await Promise.all([
    Attendance.countDocuments(query),
    Attendance.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Attendance.aggregate([
      { $match: query },
      { $match: { workHours: { $ne: null } } },
      { $group: { _id: null, total: { $sum: "$workHours" }, average: { $avg: "$workHours" } } },
    ]),
    Attendance.countDocuments({ ...query, isRegularized: true }),
  ]);
  const present = byStatus.filter((x) => ["PRESENT", "WORK_FROM_HOME"].includes(x._id)).reduce((s, x) => s + x.count, 0);
  return {
    total,
    present,
    attendanceRate: total ? Math.round((present / total) * 1000) / 10 : 0,
    regularized,
    totalWorkHours: Math.round((workHours[0]?.total ?? 0) * 100) / 100,
    averageWorkHours: Math.round((workHours[0]?.average ?? 0) * 100) / 100,
    byStatus: byStatus.map((x) => ({ label: x._id, value: x.count })),
  };
}

async function leave(filters: ReportFilters, employeeIds?: string[]) {
  const query: any = {
    ...inScope("employeeId", employeeIds),
    ...(dateRange(filters.from, filters.to) ? { startDate: { $lte: filters.to ?? "9999-12-31" }, endDate: { $gte: filters.from ?? "0000-01-01" } } : {}),
  };
  const [total, days, byStatus, byType] = await Promise.all([
    LeaveRequest.countDocuments(query),
    LeaveRequest.aggregate([{ $match: query }, { $group: { _id: null, total: { $sum: "$totalDays" } } }]),
    LeaveRequest.aggregate([{ $match: query }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    LeaveRequest.aggregate([{ $match: query }, { $group: { _id: "$leaveTypeId", count: { $sum: 1 }, days: { $sum: "$totalDays" } } }, { $sort: { count: -1 } }]),
  ]);
  return {
    total,
    totalDays: days[0]?.total ?? 0,
    byStatus: byStatus.map((x) => ({ label: x._id, value: x.count })),
    byType: byType.map((x) => ({ label: x._id, value: x.count, days: x.days })),
  };
}

async function payroll(filters: ReportFilters, employeeIds?: string[]) {
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;
  const runs = await PayrollRun.find().sort({ year: -1, month: -1 }).lean();
  const filteredRuns = runs.filter((r) => {
    const date = new Date(Date.UTC(r.year, r.month - 1, 1));
    return (!from || date >= from) && (!to || date <= to);
  });
  const runIds = filteredRuns.map((r) => r._id);
  const query: any = { ...(runIds.length ? { payrollRunId: { $in: runIds } } : { _id: { $in: [] } }), ...inScope("employeeId", employeeIds) };
  const [aggregate, byRun] = await Promise.all([
    Payslip.aggregate([{ $match: query }, { $group: { _id: null, gross: { $sum: "$grossEarnings" }, deductions: { $sum: "$totalDeductions" }, net: { $sum: "$netPay" }, lop: { $sum: "$lop" }, count: { $sum: 1 } } }]),
    Payslip.aggregate([{ $match: query }, { $group: { _id: "$payrollRunId", gross: { $sum: "$grossEarnings" }, net: { $sum: "$netPay" }, headcount: { $sum: 1 } } }, { $sort: { _id: -1 } }]),
  ]);
  const runMap = new Map(filteredRuns.map((r) => [r._id, `${String(r.month).padStart(2, "0")}/${r.year}`]));
  return {
    runs: filteredRuns.length,
    totalGross: aggregate[0]?.gross ?? 0,
    totalDeductions: aggregate[0]?.deductions ?? 0,
    totalNet: aggregate[0]?.net ?? 0,
    totalLop: aggregate[0]?.lop ?? 0,
    payslipCount: aggregate[0]?.count ?? 0,
    byRun: byRun.map((x) => ({ label: runMap.get(x._id) ?? x._id, gross: x.gross, net: x.net, headcount: x.headcount })),
  };
}

async function recruitment(filters: ReportFilters) {
  const query: any = dateRange(filters.from, filters.to) ? { appliedAt: dateRange(filters.from, filters.to) } : {};
  const [applications, byStage, bySource, openRoles, offersAccepted, hired, offersSent] = await Promise.all([
    Candidate.countDocuments(query),
    Candidate.aggregate([{ $match: query }, { $group: { _id: "$stage", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Candidate.aggregate([{ $match: query }, { $group: { _id: "$source", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    JobPosting.countDocuments({ status: "OPEN" }),
    Candidate.countDocuments({ ...query, "offer.status": "ACCEPTED" }),
    Candidate.countDocuments({ ...query, stage: "HIRED" }),
    Candidate.countDocuments({ ...query, "offer.status": { $in: ["SENT", "ACCEPTED", "DECLINED"] } }),
  ]);
  return {
    applications,
    openRoles,
    offersAccepted,
    hired,
    offerAcceptanceRate: offersSent ? Math.round((offersAccepted / offersSent) * 1000) / 10 : 0,
    byStage: byStage.map((x) => ({ label: x._id, value: x.count })),
    bySource: bySource.map((x) => ({ label: x._id, value: x.count })),
  };
}

async function performance(filters: ReportFilters, employeeIds?: string[]) {
  const query: any = { ...inScope("revieweeId", employeeIds) };
  if (filters.from || filters.to) {
    query.submittedAt = dateRange(filters.from, filters.to);
  }
  const [reviews, ratings, outcomes] = await Promise.all([
    PerformanceReview.countDocuments(query),
    PerformanceReview.aggregate([{ $match: { ...query, finalRating: { $ne: null } } }, { $group: { _id: "$finalRating", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    PerformanceOutcome.aggregate([{ $lookup: { from: "performancereviews", localField: "reviewId", foreignField: "_id", as: "review" } }, { $unwind: "$review" }, { $match: inScope("review.revieweeId", employeeIds) }, { $group: { _id: "$incrementRecommendation", count: { $sum: 1 } } }]),
  ]);
  const avg = await PerformanceReview.aggregate([{ $match: { ...query, finalRating: { $ne: null } } }, { $group: { _id: null, average: { $avg: "$finalRating" } } }]);
  return {
    reviews,
    averageRating: Math.round((avg[0]?.average ?? 0) * 100) / 100,
    ratingDistribution: ratings.map((x) => ({ label: `${x._id}/5`, value: x.count })),
    outcomes: outcomes.map((x) => ({ label: x._id, value: x.count })),
  };
}

async function tickets(filters: ReportFilters, employeeIds?: string[]) {
  const query: any = { ...inScope("employeeId", employeeIds) };
  if (filters.from || filters.to) query.createdAt = dateRange(filters.from, filters.to);
  const [total, byStatus, byPriority, byCategory] = await Promise.all([
    Ticket.countDocuments(query),
    Ticket.aggregate([{ $match: query }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: query }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: query }, { $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  return { total, byStatus: byStatus.map((x) => ({ label: x._id, value: x.count })), byPriority: byPriority.map((x) => ({ label: x._id, value: x.count })), byCategory: byCategory.map((x) => ({ label: x._id, value: x.count })) };
}

async function documents(filters: ReportFilters, employeeIds?: string[]) {
  const query: any = { ...inScope("employeeId", employeeIds) };
  if (filters.from || filters.to) query.uploadedAt = dateRange(filters.from, filters.to);
  const [total, verified, pending, requests, assets] = await Promise.all([
    DocumentRecord.countDocuments(query),
    DocumentRecord.countDocuments({ ...query, status: "VERIFIED" }),
    DocumentRecord.countDocuments({ ...query, status: "PENDING" }),
    DocumentRequest.countDocuments({ ...inScope("employeeId", employeeIds) }),
    Asset.countDocuments({ ...inScope("employeeId", employeeIds), status: "ASSIGNED" }),
  ]);
  return { total, verified, pending, requests, assignedAssets: assets };
}

export async function getReports(filters: ReportFilters, role: string, employeeId: string | null) {
  const employeeIds = await scopeEmployeeIds(role, employeeId);
  const [workforceData, attendanceData, leaveData, payrollData, performanceData, ticketsData, documentsData] = await Promise.all([
    workforce(filters, employeeIds),
    attendance(filters, employeeIds),
    leave(filters, employeeIds),
    payroll(filters, employeeIds),
    performance(filters, employeeIds),
    tickets(filters, employeeIds),
    documents(filters, employeeIds),
  ]);
  const canViewRecruitment = role === "SUPER_ADMIN" || role === "HR_ADMIN";
  return {
    filters,
    scope: role === "MANAGER" ? "TEAM" : "ORGANIZATION",
    workforce: workforceData,
    attendance: attendanceData,
    leave: leaveData,
    payroll: payrollData,
    performance: performanceData,
    tickets: ticketsData,
    documents: documentsData,
    recruitment: canViewRecruitment ? await recruitment(filters) : null,
  };
}
