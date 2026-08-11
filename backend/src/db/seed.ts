/* eslint-disable no-console */
import bcrypt from "bcryptjs";
import { connectDB, nowIso } from "./connection";
import { genId } from "@/utils/id";
import { fileURLToPath } from "node:url";


import {
  User,
  Department,
  Designation,
  Employee,
  Attendance,
  Holiday,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  JobPosting,
  Candidate,
  Interview,
  PerformanceCycle,
  PerformanceReview,
  Goal,
  SalaryStructure,
  PayrollRun,
  Payslip,
  Announcement,
  Notification,
  DocumentRecord,
  Asset,
  AuditLog,
} from "./models";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
const PASSWORD_HASH = bcrypt.hashSync("Welcome@123", 10);

// ---------------------------------------------------------------------------
// Name pools (generic Indian first/last names — not tied to real individuals)
// ---------------------------------------------------------------------------
const MALE_NAMES = [
  "Aarav","Vihaan","Vivaan","Aditya","Arjun","Reyansh","Krishna","Ishaan","Rohan","Karthik",
  "Siddharth","Aniket","Rahul","Nikhil","Varun","Aryan","Dhruv","Kunal","Pranav","Tanmay",
  "Akash","Yash","Sahil","Gaurav","Vikram","Rajesh","Suresh","Manoj","Deepak","Anil",
  "Vivek","Sanjay","Rakesh","Naveen","Harsh","Abhinav","Devansh","Shaurya","Ritvik","Aadi",
];
const FEMALE_NAMES = [
  "Saanvi","Ananya","Diya","Ira","Myra","Aadhya","Kiara","Anika","Navya","Pari",
  "Riya","Tanya","Sneha","Pooja","Neha","Kavya","Meera","Priya","Divya","Shreya",
  "Isha","Nisha","Aishwarya","Lakshmi","Radhika","Swati","Bhavna","Anjali","Sakshi","Ritika",
  "Simran","Pallavi","Madhavi","Gauri","Nidhi","Vidya","Tara","Aditi","Charvi","Esha",
];
const LAST_NAMES = [
  "Sharma","Verma","Gupta","Mehta","Shah","Patel","Iyer","Nair","Menon","Reddy",
  "Rao","Kulkarni","Joshi","Desai","Agarwal","Bansal","Chopra","Malhotra","Kapoor","Singh",
  "Yadav","Pillai","Krishnan","Subramaniam","Bose","Mukherjee","Banerjee","Chatterjee","Das","Ghosh",
  "Pandey","Mishra","Tiwari","Trivedi","Naidu","Chauhan","Bhatt","Saxena","Khanna","Arora",
];

const usedEmails = new Set<string>();
function makeName() {
  const gender = Math.random() > 0.46 ? "Male" : "Female";
  const first = gender === "Male" ? pick(MALE_NAMES) : pick(FEMALE_NAMES);
  const last = pick(LAST_NAMES);
  let email = `${first.toLowerCase()}.${last.toLowerCase()}@aadhyaraj.com`;
  let suffix = 1;
  while (usedEmails.has(email)) {
    suffix += 1;
    email = `${first.toLowerCase()}.${last.toLowerCase()}${suffix}@aadhyaraj.com`;
  }
  usedEmails.add(email);
  return { first, last, gender, email };
}

// ---------------------------------------------------------------------------
// Clear existing data (idempotent reseed)
// ---------------------------------------------------------------------------
async function clearDatabase() {
  await Promise.all([
    AuditLog.deleteMany({}),
    Asset.deleteMany({}),
    DocumentRecord.deleteMany({}),
    Notification.deleteMany({}),
    Announcement.deleteMany({}),
    Payslip.deleteMany({}),
    PayrollRun.deleteMany({}),
    SalaryStructure.deleteMany({}),
    Goal.deleteMany({}),
    PerformanceReview.deleteMany({}),
    PerformanceCycle.deleteMany({}),
    Interview.deleteMany({}),
    Candidate.deleteMany({}),
    JobPosting.deleteMany({}),
    LeaveRequest.deleteMany({}),
    LeaveBalance.deleteMany({}),
    LeaveType.deleteMany({}),
    Holiday.deleteMany({}),
    Attendance.deleteMany({}),
    Employee.deleteMany({}),
    Designation.deleteMany({}),
    Department.deleteMany({}),
    User.deleteMany({}),
  ]);
}

// ---------------------------------------------------------------------------
// 1. Departments & designation ladders
// ---------------------------------------------------------------------------
interface DesignationBlueprint { title: string; level: number; count: number; }
interface DepartmentBlueprint {
  name: string; code: string; description: string; colorHex: string;
  reportsToExec: "CEO" | "COO" | null;
  ladder: DesignationBlueprint[];
}

const DEPARTMENTS: DepartmentBlueprint[] = [
  {
    name: "Engineering", code: "ENG", colorHex: "#5B4FE5", reportsToExec: "CEO",
    description: "Builds and operates the Aadhyaraj product platform.",
    ladder: [
      { title: "VP of Engineering", level: 7, count: 1 },
      { title: "Director of Engineering", level: 6, count: 1 },
      { title: "Senior Engineering Manager", level: 5, count: 2 },
      { title: "Engineering Manager", level: 4, count: 4 },
      { title: "Tech Lead", level: 3, count: 6 },
      { title: "Senior Software Engineer", level: 2, count: 10 },
      { title: "Software Engineer", level: 1, count: 14 },
    ],
  },
  {
    name: "Product", code: "PRD", colorHex: "#4338CA", reportsToExec: "CEO",
    description: "Owns product strategy, discovery, and roadmap execution.",
    ladder: [
      { title: "VP of Product", level: 7, count: 1 },
      { title: "Director of Product Management", level: 6, count: 1 },
      { title: "Group Product Manager", level: 5, count: 2 },
      { title: "Senior Product Manager", level: 4, count: 3 },
      { title: "Product Manager", level: 3, count: 5 },
      { title: "Associate Product Manager", level: 2, count: 4 },
      { title: "Product Analyst", level: 1, count: 3 },
    ],
  },
  {
    name: "Design", code: "DSN", colorHex: "#C9A14A", reportsToExec: "CEO",
    description: "Crafts the end-to-end product and brand experience.",
    ladder: [
      { title: "Director of Design", level: 6, count: 1 },
      { title: "Design Manager", level: 5, count: 1 },
      { title: "Lead Product Designer", level: 4, count: 2 },
      { title: "Senior Product Designer", level: 3, count: 4 },
      { title: "Product Designer", level: 2, count: 5 },
      { title: "UX Researcher", level: 1, count: 2 },
    ],
  },
  {
    name: "Sales", code: "SAL", colorHex: "#1A9E72", reportsToExec: "COO",
    description: "Drives new business and enterprise revenue growth.",
    ladder: [
      { title: "VP of Sales", level: 7, count: 1 },
      { title: "Director of Sales", level: 6, count: 1 },
      { title: "Regional Sales Manager", level: 5, count: 2 },
      { title: "Sales Manager", level: 4, count: 3 },
      { title: "Senior Account Executive", level: 3, count: 5 },
      { title: "Account Executive", level: 2, count: 6 },
      { title: "Sales Development Representative", level: 1, count: 5 },
    ],
  },
  {
    name: "Marketing", code: "MKT", colorHex: "#D14343", reportsToExec: "COO",
    description: "Builds brand awareness and demand generation.",
    ladder: [
      { title: "Director of Marketing", level: 6, count: 1 },
      { title: "Senior Marketing Manager", level: 5, count: 2 },
      { title: "Marketing Manager", level: 4, count: 2 },
      { title: "Content Strategist", level: 3, count: 3 },
      { title: "Marketing Specialist", level: 2, count: 4 },
      { title: "Marketing Associate", level: 1, count: 3 },
    ],
  },
  {
    name: "Human Resources", code: "HR", colorHex: "#9D5CE0", reportsToExec: "CEO",
    description: "Owns talent, culture, people operations, and compliance.",
    ladder: [
      { title: "VP of Human Resources", level: 6, count: 1 },
      { title: "HR Business Partner Lead", level: 5, count: 1 },
      { title: "HR Manager", level: 4, count: 2 },
      { title: "Senior HR Generalist", level: 3, count: 2 },
      { title: "Talent Acquisition Specialist", level: 2, count: 3 },
      { title: "HR Associate", level: 1, count: 2 },
    ],
  },
  {
    name: "Finance", code: "FIN", colorHex: "#0E7490", reportsToExec: "CEO",
    description: "Manages financial planning, payroll, and compliance.",
    ladder: [
      { title: "VP of Finance", level: 6, count: 1 },
      { title: "Finance Controller", level: 5, count: 1 },
      { title: "Finance Manager", level: 4, count: 2 },
      { title: "Senior Financial Analyst", level: 3, count: 2 },
      { title: "Financial Analyst", level: 2, count: 3 },
      { title: "Accounts Executive", level: 1, count: 2 },
    ],
  },
  {
    name: "Customer Success", code: "CSM", colorHex: "#C2683B", reportsToExec: "COO",
    description: "Ensures customers achieve lasting value from the platform.",
    ladder: [
      { title: "Director of Customer Success", level: 6, count: 1 },
      { title: "Customer Success Lead", level: 5, count: 1 },
      { title: "Customer Success Manager", level: 4, count: 2 },
      { title: "Senior Customer Success Manager", level: 3, count: 3 },
      { title: "Customer Success Associate", level: 2, count: 4 },
      { title: "Support Engineer", level: 1, count: 3 },
    ],
  },
  {
    name: "IT & Security", code: "ITS", colorHex: "#475569", reportsToExec: "CEO",
    description: "Keeps internal systems, infrastructure, and data secure.",
    ladder: [
      { title: "VP of Information Technology", level: 6, count: 1 },
      { title: "IT Security Manager", level: 5, count: 1 },
      { title: "IT Manager", level: 4, count: 1 },
      { title: "Systems Administrator", level: 3, count: 2 },
      { title: "Security Analyst", level: 2, count: 2 },
      { title: "IT Support Specialist", level: 1, count: 3 },
    ],
  },
  {
    name: "Operations", code: "OPS", colorHex: "#B45309", reportsToExec: null,
    description: "Runs the business: facilities, administration, and execution.",
    ladder: [
      { title: "Chief Executive Officer", level: 10, count: 1 },
      { title: "Chief Operating Officer", level: 9, count: 1 },
      { title: "Director of Operations", level: 6, count: 1 },
      { title: "Operations Manager", level: 4, count: 2 },
      { title: "Office Administrator", level: 2, count: 2 },
      { title: "Facilities Executive", level: 1, count: 2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
export async function runSeed() {
  console.log("Connecting to MongoDB...");
  await connectDB();

  console.log("Clearing existing data...");
  await clearDatabase();

  const now = nowIso();
  const today = new Date();
  const founding = new Date(today.getFullYear() - 11, 3, 1); // company "founded" ~11 years ago

  // --- Departments & Designations -----------------------------------------
  console.log("Creating departments & designations...");
  const deptIds: Record<string, string> = {};
  const designationRows: { id: string; departmentCode: string; title: string; level: number }[] = [];

  for (const dept of DEPARTMENTS) {
    const id = genId("dept");
    deptIds[dept.code] = id;
    await Department.create({
      _id: id, name: dept.name, code: dept.code, description: dept.description, colorHex: dept.colorHex, createdAt: now,
    });
    for (const d of dept.ladder) {
      const desId = genId("desg");
      await Designation.create({ _id: desId, title: d.title, level: d.level, departmentId: id });
      designationRows.push({ id: desId, departmentCode: dept.code, title: d.title, level: d.level });
    }
  }

  // --- Employees -------------------------------------------------------------
  console.log("Generating employees & hierarchy...");

  interface SeededEmployee {
    id: string; userId: string; email: string; first: string; last: string; gender: string;
    departmentCode: string; designationId: string; designationTitle: string; level: number; managerId: string | null;
  }
  const allEmployees: SeededEmployee[] = [];
  let ceoId: string | null = null;
  let cooId: string | null = null;

  async function createEmployeeRow(opts: {
    first: string; last: string; gender: string; email: string; departmentId: string; designationId: string;
    managerId: string | null; dateOfJoining: Date; role?: string; employmentType?: string;
  }) {
    const userId = genId("usr");
    const employeeId = genId("emp");
    const idx = allEmployees.length + 1;
    const employeeCode = `ART-${opts.dateOfJoining.getFullYear()}-${String(idx).padStart(4, "0")}`;

    await User.create({
      _id: userId, email: opts.email, passwordHash: PASSWORD_HASH, role: opts.role ?? "EMPLOYEE",
      isActive: true, mustResetPwd: false, createdAt: now, updatedAt: now,
    });

    const dob = addDays(today, -randomInt(23 * 365, 56 * 365));
    await Employee.create({
      _id: employeeId, employeeCode, userId, firstName: opts.first, lastName: opts.last, gender: opts.gender,
      dateOfBirth: isoDate(dob), personalEmail: `${opts.first.toLowerCase()}.${opts.last.toLowerCase()}.personal@gmail.com`,
      phone: `+91${randomInt(7000000000, 9999999999)}`, city: pick(["Bengaluru", "Pune", "Hyderabad", "Gurugram", "Mumbai", "Chennai"]),
      country: "India", departmentId: opts.departmentId, designationId: opts.designationId, managerId: opts.managerId,
      employmentType: opts.employmentType ?? "FULL_TIME", status: "ACTIVE", dateOfJoining: isoDate(opts.dateOfJoining),
      createdAt: now, updatedAt: now,
    });

    return { id: employeeId, userId };
  }

  for (const dept of DEPARTMENTS) {
    const deptId = deptIds[dept.code];
    const sortedLadder = [...dept.ladder].sort((a, b) => b.level - a.level);
    let previousLevelEmployees: SeededEmployee[] = [];

    for (const rung of sortedLadder) {
      const designation = designationRows.find((d) => d.departmentCode === dept.code && d.title === rung.title)!;
      const currentLevelEmployees: SeededEmployee[] = [];

      for (let i = 0; i < rung.count; i++) {
        const { first, last, gender, email } = makeName();

        // Tenure correlates loosely with seniority.
        const minTenureDays = Math.min(rung.level * 220, 3800);
        const maxTenureDays = Math.min(rung.level * 420 + 400, 4000);
        const tenureDays = randomInt(minTenureDays, Math.max(maxTenureDays, minTenureDays + 30));
        const dateOfJoining = new Date(Math.max(addDays(today, -tenureDays).getTime(), founding.getTime()));

        let managerId: string | null = null;
        if (rung.title === "Chief Executive Officer") {
          managerId = null;
        } else if (rung.title === "Chief Operating Officer") {
          managerId = ceoId;
        } else if (previousLevelEmployees.length > 0) {
          managerId = previousLevelEmployees[i % previousLevelEmployees.length].id;
        } else if (dept.reportsToExec === "CEO") {
          managerId = ceoId;
        } else if (dept.reportsToExec === "COO") {
          managerId = cooId;
        }

        const employmentType = rung.level === 1 && Math.random() < 0.08 ? "INTERN" : "FULL_TIME";

        const { id, userId } = await createEmployeeRow({
          first, last, gender, email, departmentId: deptId, designationId: designation.id,
          managerId, dateOfJoining, employmentType,
        });

        const record: SeededEmployee = {
          id, userId, email, first, last, gender, departmentCode: dept.code,
          designationId: designation.id, designationTitle: rung.title, level: rung.level, managerId,
        };
        allEmployees.push(record);
        currentLevelEmployees.push(record);

        if (rung.title === "Chief Executive Officer") ceoId = id;
        if (rung.title === "Chief Operating Officer") cooId = id;
      }

      previousLevelEmployees = currentLevelEmployees;

      // The most senior rung in a department becomes its head.
      if (rung === sortedLadder[0] && dept.code !== "OPS") {
        await Department.updateOne({ _id: deptId }, { $set: { headId: currentLevelEmployees[0].id } });
      }
    }
  }
  await Department.updateOne({ code: "OPS" }, { $set: { headId: ceoId } });

  console.log(`Created ${allEmployees.length} employees.`);

  // --- Promote a handful of accounts to elevated roles for the live demo ----
  function findByTitle(title: string) {
    return allEmployees.filter((e) => e.designationTitle === title);
  }
  async function reassignDemoAccount(employee: SeededEmployee, email: string, role: string) {
    await User.updateOne({ _id: employee.userId }, { $set: { email, role } });
    employee.email = email;
    return employee;
  }

  const itVp = findByTitle("VP of Information Technology")[0];
  const hrVp = findByTitle("VP of Human Resources")[0];
  const engManager = findByTitle("Engineering Manager")[0];
  const taSpecialist = findByTitle("Talent Acquisition Specialist")[0];
  const financeManager = findByTitle("Finance Manager")[0];
  const swEngineeringReport = allEmployees.find((e) => e.managerId === engManager?.id) ?? findByTitle("Senior Software Engineer")[0];
  const itSupportSpecialist =findByTitle("IT Support Specialist")[0];
  
  await reassignDemoAccount(itVp, "admin@aadhyaraj.com", "SUPER_ADMIN");
  await reassignDemoAccount(hrVp, "hr.admin@aadhyaraj.com", "HR_ADMIN");
  await reassignDemoAccount(engManager, "manager.demo@aadhyaraj.com", "MANAGER");
  await reassignDemoAccount(taSpecialist, "recruiter.demo@aadhyaraj.com", "RECRUITER");
  await reassignDemoAccount(financeManager, "finance.demo@aadhyaraj.com", "FINANCE");
  await reassignDemoAccount(swEngineeringReport, "employee.demo@aadhyaraj.com", "EMPLOYEE");
  await reassignDemoAccount(itSupportSpecialist, "it.support.demo@aadhyaraj.com", "IT_SUPPORT");

  const demoAccountIds = new Set([itVp.id, hrVp.id, engManager.id, taSpecialist.id, financeManager.id, swEngineeringReport.id, itSupportSpecialist.id,]);

  // --- Holidays (illustrative, India) ---------------------------------------
  console.log("Seeding holidays...");
  const year = today.getFullYear();
  const holidays = [
    { name: "New Year's Day", date: `${year}-01-01` },
    { name: "Republic Day", date: `${year}-01-26` },
    { name: "Holi", date: `${year}-03-04` },
    { name: "Good Friday", date: `${year}-04-03` },
    { name: "Independence Day", date: `${year}-08-15` },
    { name: "Ganesh Chaturthi", date: `${year}-08-27`, isOptional: true },
    { name: "Gandhi Jayanti", date: `${year}-10-02` },
    { name: "Diwali", date: `${year}-11-08` },
    { name: "Christmas Day", date: `${year}-12-25` },
  ];
  await Holiday.insertMany(
    holidays.map((h) => ({ _id: genId("hol"), name: h.name, date: h.date, isOptional: !!h.isOptional }))
  );
  const holidaySet = new Set(holidays.map((h) => h.date));

  // --- Leave types -----------------------------------------------------------
  console.log("Seeding leave types & balances...");
  const leaveTypeDefs = [
    { name: "Privilege Leave", colorHex: "#5B4FE5", days: 18, isPaid: true },
    { name: "Sick Leave", colorHex: "#D14343", days: 12, isPaid: true },
    { name: "Casual Leave", colorHex: "#1A9E72", days: 8, isPaid: true },
    { name: "Maternity Leave", colorHex: "#C9A14A", days: 182, isPaid: true },
    { name: "Paternity Leave", colorHex: "#0E7490", days: 15, isPaid: true },
    { name: "Loss of Pay", colorHex: "#94A3B8", days: 0, isPaid: false },
  ];
  const leaveTypeIds: Record<string, string> = {};
  for (const lt of leaveTypeDefs) {
    const id = genId("ltyp");
    leaveTypeIds[lt.name] = id;
    await LeaveType.create({
      _id: id, name: lt.name, colorHex: lt.colorHex, defaultDaysPerYear: lt.days, isPaid: lt.isPaid, requiresApproval: true,
    });
  }

  const standardLeaveTypeNames = ["Privilege Leave", "Sick Leave", "Casual Leave"];
  const balanceDocs: any[] = [];
  for (const emp of allEmployees) {
    for (const name of standardLeaveTypeNames) {
      const def = leaveTypeDefs.find((d) => d.name === name)!;
      balanceDocs.push({
        _id: genId("lbal"), employeeId: emp.id, leaveTypeId: leaveTypeIds[name], year, allotted: def.days, used: 0, carriedOver: 0,
      });
    }
  }
  await LeaveBalance.insertMany(balanceDocs);

  // --- Attendance (last ~55 working days, excluding today for demo accounts) -
  console.log("Seeding attendance history (this may take a moment)...");
  const attendanceDocs: any[] = [];
  for (let i = 55; i >= 0; i--) {
    const date = addDays(today, -i);
    const dateStr = isoDate(date);
    if (isWeekend(date) || holidaySet.has(dateStr)) continue;
    const isToday = i === 0;

    for (const emp of allEmployees) {
      if (isToday && demoAccountIds.has(emp.id)) continue; // leave today open for live demo check-in

      const roll = Math.random();
      let status = "PRESENT";
      if (roll < 0.05) status = "ON_LEAVE";
      else if (roll < 0.08) status = "ABSENT";
      else if (roll < 0.2) status = "WORK_FROM_HOME";
      else if (roll < 0.24) status = "HALF_DAY";

      if (status === "ABSENT" || status === "ON_LEAVE") {
        attendanceDocs.push({ _id: genId("att"), employeeId: emp.id, date: dateStr, status, createdAt: now });
        continue;
      }

      const checkInHour = 9 + Math.random() * 1.5;
      const checkIn = new Date(date);
      checkIn.setHours(Math.floor(checkInHour), Math.floor((checkInHour % 1) * 60), 0, 0);
      const workHours = status === "HALF_DAY" ? 4 + Math.random() : 8 + Math.random() * 1.5;
      const checkOut = new Date(checkIn.getTime() + workHours * 3_600_000);

      attendanceDocs.push({
        _id: genId("att"), employeeId: emp.id, date: dateStr, checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString(),
        status, workHours: Math.round(workHours * 100) / 100, createdAt: now,
      });
    }
  }
  await Attendance.insertMany(attendanceDocs);

  // --- Leave requests ----------------------------------------------------------
  console.log("Seeding leave requests...");
  const leaveTypeNamesForRequests = ["Privilege Leave", "Sick Leave", "Casual Leave"];
  async function applyLeave(emp: SeededEmployee, startOffset: number, span: number, status: "APPROVED" | "REJECTED" | "PENDING", typeName: string) {
    const start = addDays(today, startOffset);
    const end = addDays(start, span - 1);
    const id = genId("lreq");
    await LeaveRequest.create({
      _id: id, employeeId: emp.id, leaveTypeId: leaveTypeIds[typeName], startDate: isoDate(start), endDate: isoDate(end),
      totalDays: span, reason: pick(["Family function", "Not feeling well", "Personal travel", "Festival celebration", "Medical appointment"]),
      status, approverId: status === "PENDING" ? null : emp.managerId, decidedAt: status === "PENDING" ? null : addDays(start, -2).toISOString(),
      appliedAt: addDays(start, -5).toISOString(),
    });
    if (status === "APPROVED") {
      await LeaveBalance.updateOne(
        { employeeId: emp.id, leaveTypeId: leaveTypeIds[typeName], year: start.getFullYear() },
        { $inc: { used: span } }
      );
    }
    return id;
  }

  // Past approved/rejected history across the org
  for (const emp of shuffle(allEmployees).slice(0, 70)) {
    await applyLeave(emp, -randomInt(10, 50), randomInt(1, 3), Math.random() < 0.85 ? "APPROVED" : "REJECTED", pick(leaveTypeNamesForRequests));
  }
  // A second wave for some, to make balances feel "used"
  for (const emp of shuffle(allEmployees).slice(0, 30)) {
    await applyLeave(emp, -randomInt(51, 90), randomInt(1, 4), "APPROVED", pick(leaveTypeNamesForRequests));
  }

  // Pending requests specifically under the demo manager / HR admin so the live demo has actionable items
  const reportsOfManager = allEmployees.filter((e) => e.managerId === engManager.id);
  for (const emp of reportsOfManager.slice(0, 3)) {
    await applyLeave(emp, randomInt(2, 10), randomInt(1, 3), "PENDING", pick(leaveTypeNamesForRequests));
  }
  const reportsOfHrVp = allEmployees.filter((e) => e.managerId === hrVp.id);
  for (const emp of reportsOfHrVp.slice(0, 2)) {
    await applyLeave(emp, randomInt(2, 12), randomInt(1, 2), "PENDING", pick(leaveTypeNamesForRequests));
  }

  // --- Recruitment -------------------------------------------------------------
  console.log("Seeding recruitment pipeline...");
  const jobBlueprints = [
    { title: "Senior Backend Engineer", deptCode: "ENG", expMin: 4, expMax: 8, openings: 2 },
    { title: "Product Designer", deptCode: "DSN", expMin: 2, expMax: 5, openings: 1 },
    { title: "Enterprise Account Executive", deptCode: "SAL", expMin: 3, expMax: 7, openings: 2 },
    { title: "Product Manager - Platform", deptCode: "PRD", expMin: 3, expMax: 6, openings: 1 },
    { title: "Customer Success Manager", deptCode: "CSM", expMin: 2, expMax: 5, openings: 1 },
    { title: "Marketing Specialist - Growth", deptCode: "MKT", expMin: 1, expMax: 4, openings: 1 },
    { title: "DevOps Engineer", deptCode: "ENG", expMin: 3, expMax: 6, openings: 1 },
  ];

  const jobIds: { id: string; deptCode: string }[] = [];
  for (const jb of jobBlueprints) {
    const designationsInDept = designationRows.filter((d) => d.departmentCode === jb.deptCode);
    const designation = designationsInDept[randomInt(0, Math.min(2, designationsInDept.length - 1))];
    const id = genId("job");
    await JobPosting.create({
      _id: id, title: jb.title, departmentId: deptIds[jb.deptCode], designationId: designation.id,
      location: pick(["Bengaluru, India", "Pune, India", "Remote (India)"]), employmentType: "FULL_TIME",
      experienceMin: jb.expMin, experienceMax: jb.expMax,
      description: `We're looking for a ${jb.title} to join Aadhyaraj Technologies and help us scale our platform for thousands of HR teams across the region. You'll collaborate closely with cross-functional partners and own outcomes end to end.`,
      status: "OPEN", openings: jb.openings, postedAt: addDays(today, -randomInt(5, 40)).toISOString(),
    });
    jobIds.push({ id, deptCode: jb.deptCode });
  }

  const stages = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];
  const interviewCandidateIdsForDemo: string[] = [];
  for (const job of jobIds) {
    const candidateCount = randomInt(5, 11);
    for (let i = 0; i < candidateCount; i++) {
      const { first, last } = makeName();
      const stage = pick(stages);
      const candidateId = genId("cand");
      await Candidate.create({
        _id: candidateId, jobPostingId: job.id, firstName: first, lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}.candidate@example.com`,
        phone: `+91${randomInt(7000000000, 9999999999)}`, stage,
        rating: stage === "REJECTED" || stage === "APPLIED" ? null : randomInt(3, 5),
        expectedCtc: randomInt(8, 45) * 100000, source: pick(["Career Site", "LinkedIn", "Referral", "Job Board"]),
        appliedAt: addDays(today, -randomInt(1, 35)).toISOString(),
        notes: stage === "HIRED" ? "Strong offer acceptance, joining shortly." : null,
      });

      if (stage === "INTERVIEW") interviewCandidateIdsForDemo.push(candidateId);

      if (["INTERVIEW", "OFFER", "HIRED"].includes(stage)) {
        const interviewer = pick(allEmployees.filter((e) => e.departmentCode === job.deptCode && e.level >= 3));
        if (interviewer) {
          await Interview.create({
            _id: genId("intv"), candidateId, interviewerId: interviewer.id,
            scheduledAt: addDays(today, -randomInt(1, 20)).toISOString(),
            round: pick(["Round 1 - Screening", "Round 2 - Technical", "Round 3 - Hiring Manager"]),
            feedback: "Solid communication and relevant experience for the role.",
            recommendation: pick(["STRONG_YES", "YES", "YES", "NO"]), completed: true,
          });
        }
      }
    }
  }
  // A couple of upcoming interviews tied to the demo manager, for a lively dashboard
  for (const candidateId of interviewCandidateIdsForDemo.slice(0, 2)) {
    await Interview.create({
      _id: genId("intv"), candidateId, interviewerId: engManager.id,
      scheduledAt: addDays(today, randomInt(1, 5)).toISOString(), round: "Round 2 - Technical", completed: false,
    });
  }

  // --- Performance management ---------------------------------------------------
  console.log("Seeding performance cycles, reviews & goals...");
  const cycleId = genId("cyc");
  await PerformanceCycle.create({
    _id: cycleId, name: `H${today.getMonth() < 6 ? 1 : 2} ${year}`,
    startDate: isoDate(new Date(year, today.getMonth() < 6 ? 0 : 6, 1)),
    endDate: isoDate(new Date(year, today.getMonth() < 6 ? 5 : 11, 30)),
    isActive: true,
  });

  const goalTitles = ["Improve sprint predictability", "Ship platform performance improvements", "Grow pipeline coverage by 20%", "Reduce customer churn", "Complete leadership training", "Launch internal knowledge base"];
  for (const emp of allEmployees) {
    if (!emp.managerId) continue;
    const completed = Math.random() < 0.6;
    const selfRating = completed || Math.random() < 0.5 ? randomInt(3, 5) : null;
    const managerRating = completed ? Math.min(5, Math.max(1, (selfRating ?? 3) + randomInt(-1, 1))) : null;
    const finalRating = completed && selfRating && managerRating ? Math.round(((selfRating + managerRating) / 2) * 10) / 10 : null;
    const status = completed ? "COMPLETED" : selfRating ? "MANAGER_REVIEW" : "NOT_STARTED";

    await PerformanceReview.create({
      _id: genId("rev"), cycleId, revieweeId: emp.id, reviewerId: emp.managerId, status,
      selfRating, managerRating, finalRating,
      strengths: selfRating ? "Consistently delivers high-quality work and collaborates well across teams." : null,
      improvements: selfRating ? "Could invest more time in documentation and mentoring junior team members." : null,
      managerComments: completed ? "Great progress this cycle — keep up the momentum heading into the next one." : null,
      submittedAt: completed ? addDays(today, -randomInt(2, 30)).toISOString() : null,
    });

    const goalCount = randomInt(1, 3);
    for (let g = 0; g < goalCount; g++) {
      const progress = randomInt(0, 100);
      await Goal.create({
        _id: genId("goal"), employeeId: emp.id, title: pick(goalTitles),
        description: "Tracked as part of the current performance cycle.",
        progress, status: progress >= 100 ? "COMPLETED" : progress === 0 ? "NOT_STARTED" : progress < 40 && Math.random() < 0.2 ? "AT_RISK" : "IN_PROGRESS",
        dueDate: isoDate(addDays(today, randomInt(-10, 60))), createdAt: now,
      });
    }
  }

  // --- Payroll ---------------------------------------------------------------
  console.log("Seeding salary structures & payroll history...");
  function baseSalaryForLevel(level: number) {
    const base = 35000 + level * 28000 + randomInt(-3000, 6000);
    return Math.round(base / 500) * 500;
  }
  for (const emp of allEmployees) {
    const basic = baseSalaryForLevel(emp.level);
    const hra = Math.round(basic * 0.4);
    const conveyance = 1600;
    const medical = 1250;
    const specialAllowance = Math.round(basic * 0.18);
    const pf = Math.round(basic * 0.12);
    const professionalTax = basic > 15000 ? 200 : 0;
    const grossApprox = basic + hra + specialAllowance;
    const incomeTax = grossApprox > 80000 ? Math.round(grossApprox * 0.08) : grossApprox > 50000 ? Math.round(grossApprox * 0.04) : 0;

    await SalaryStructure.create({
      _id: genId("sal"), employeeId: emp.id, basic, hra, conveyance, medical, specialAllowance, pf, professionalTax, incomeTax,
      effectiveFrom: now,
    });
  }

  // Process the last 3 months as PAID runs (reuses the same logic the API exposes)
  const { processPayrollRun, markRunPaid } = await import("../modules/payroll/payroll.repository.js");
  for (let i = 3; i >= 1; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const runRecord = (await processPayrollRun(d.getMonth() + 1, d.getFullYear())) as any;
    if (runRecord) await markRunPaid(runRecord.id);
  }

  // --- Announcements & assets ----------------------------------------------
  console.log("Seeding announcements, assets & notifications...");
  const announcements = [
    { title: "Welcome to the new Aadhyaraj HRMS!", body: "We've launched a brand-new HR platform to make every part of your employee journey faster and more transparent. Explore your dashboard, apply for leave, and track your goals — all in one place.", pinned: true },
    { title: "Open Enrollment for Health Benefits", body: "Open enrollment for this year's health insurance plans is now live. Please review and confirm your selections with the HR team before the end of the month.", pinned: false },
    { title: "Quarterly Town Hall — Save the Date", body: "Join leadership for our quarterly town hall covering company performance, roadmap highlights, and an open Q&A session.", pinned: false },
    { title: "Festival Holiday Schedule Published", body: "The festival holiday calendar for this year has been published. Check the Holidays section under Organization for the full list.", pinned: false },
  ];
  for (const a of announcements) {
    await Announcement.create({
      _id: genId("ann"), title: a.title, body: a.body, pinned: a.pinned, audience: "ALL",
      createdAt: addDays(today, -randomInt(1, 20)).toISOString(),
    });
  }

  const assetCategories = ["Laptop", "Monitor", "Headset", "Mobile Phone"];
  const assetNames: Record<string, string[]> = {
    Laptop: ["MacBook Pro 14\"", "Dell Latitude 7440", "Lenovo ThinkPad X1"],
    Monitor: ["Dell 27\" 4K Monitor", "LG UltraWide 34\""],
    Headset: ["Jabra Evolve2 65", "Sony WH-1000XM5"],
    "Mobile Phone": ["iPhone 14", "Samsung Galaxy S23"],
  };
  let tagCounter = 1000;
  for (const emp of shuffle(allEmployees).slice(0, 90)) {
    const category = pick(assetCategories);
    await Asset.create({
      _id: genId("ast"), employeeId: emp.id, assetTag: `ART-AST-${tagCounter++}`, category, name: pick(assetNames[category]),
      assignedAt: addDays(today, -randomInt(10, 600)).toISOString(), status: "ASSIGNED",
    });
  }

  // Notifications for demo accounts so the bell icon has real content on first load
  async function pushNotification(userId: string, type: string, title: string, message: string, link?: string) {
    await Notification.create({
      _id: genId("ntf"), userId, type, title, message, link: link ?? null,
      createdAt: addDays(today, -randomInt(0, 3)).toISOString(),
    });
  }
  await pushNotification(engManager.userId, "LEAVE_REQUEST", "New leave request to review", "You have pending leave requests from your team awaiting a decision.", "/leave?tab=team");
  await pushNotification(hrVp.userId, "LEAVE_REQUEST", "New leave request to review", "A direct report has requested leave.", "/leave?tab=team");
  await pushNotification(itVp.userId, "ANNOUNCEMENT", "Welcome to the new Aadhyaraj HRMS!", "Take a look at the new platform and let your team know what you think.", "/announcements");
  await pushNotification(swEngineeringReport.userId, "PERFORMANCE", "Performance review cycle is open", "Your self-review for the current cycle is ready to complete.", "/performance");
  await pushNotification(financeManager.userId, "PAYROLL", "Payroll run ready to process", "This month's payroll run is ready for processing once attendance is finalized.", "/payroll");
  await pushNotification(taSpecialist.userId, "RECRUITMENT", "New candidates in your pipeline", "Several candidates are waiting in the Screening and Interview stages.", "/recruitment");

  console.log("\nSeed complete!");
  console.log("----------------------------------------------------------------");
  console.log("Demo accounts (all use password: Welcome@123)");
  console.log(`  Super Admin    -> admin@aadhyaraj.com`);
  console.log(`  HR Admin       -> hr.admin@aadhyaraj.com`);
  console.log(`  Manager        -> manager.demo@aadhyaraj.com`);
  console.log(`  Recruiter      -> recruiter.demo@aadhyaraj.com`);
  console.log(`  Finance        -> finance.demo@aadhyaraj.com`);
  console.log(`  Employee       -> employee.demo@aadhyaraj.com`);
  console.log(`  IT Support     -> it.support.demo@aadhyaraj.com`);
  console.log("  (Every other seeded employee can also log in with their");
  console.log("   @aadhyaraj.com email and the same password.)");
  console.log("----------------------------------------------------------------");
}

/** Seeds demo data only if the database is empty. Safe to call on every server start. */
export async function seedIfEmpty() {
  await connectDB();
  const existingUsers = await User.estimatedDocumentCount();
  if (existingUsers > 0) return;
  console.log("No existing data found — seeding demo data automatically...");
  await runSeed();
}

// Allow running this file directly via `npm run seed` for a manual, forced reseed.
runSeed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

