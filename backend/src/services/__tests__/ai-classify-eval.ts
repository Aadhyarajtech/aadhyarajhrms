// path: src/services/__tests__/ai-classify-eval.ts
//
// Evaluation Dataset and Benchmark Runner for AI Ticket Classification
//
// Contains 50+ curated evaluation tickets across all 8 categories
// with standard, edge, ambiguous, and Hinglish test cases.

import { classifyTicket } from "../ai.service";

export interface TestCase {
  id: number;
  subject: string;
  description: string;
  employeeCategory?: string;
  expectedCategory: string;
  expectedIntent: string;
  difficulty: "standard" | "medium" | "hard" | "hinglish";
}

export const EVALUATION_DATASET: TestCase[] = [
  // ==========================================
  // 1. PAYROLL (7 cases)
  // ==========================================
  {
    id: 1,
    subject: "Salary not received for August",
    description: "My August salary has not been credited to my HDFC bank account. Usually it comes by 1st.",
    employeeCategory: "HR",
    expectedCategory: "Payroll",
    expectedIntent: "Salary Not Credited",
    difficulty: "standard",
  },
  {
    id: 2,
    subject: "Payslip download issue",
    description: "I need my July 2026 payslip for home loan verification but portal is giving an error.",
    employeeCategory: "Payroll",
    expectedCategory: "Payroll",
    expectedIntent: "Payslip Request",
    difficulty: "standard",
  },
  {
    id: 3,
    subject: "Unexplained salary deduction",
    description: "Around Rs. 4,500 was deducted under miscellaneous deductions in this month's pay. Kindly clarify.",
    employeeCategory: "HR",
    expectedCategory: "Payroll",
    expectedIntent: "Salary Deduction Query",
    difficulty: "standard",
  },
  {
    id: 4,
    subject: "TDS / Form 16 query",
    description: "I need assistance with my investment declaration and updated Form 16 part B.",
    employeeCategory: "Payroll",
    expectedCategory: "Payroll",
    expectedIntent: "Tax Query",
    difficulty: "standard",
  },
  {
    id: 5,
    subject: "Client travel reimbursement pending",
    description: "Submitted travel food and cab bills for client visit two weeks ago. When will it be reimbursed?",
    employeeCategory: "Payroll",
    expectedCategory: "Payroll",
    expectedIntent: "Reimbursement Issue",
    difficulty: "standard",
  },
  {
    id: 6,
    subject: "Update bank account details for salary",
    description: "I have closed my ICICI account and want to register my new SBI salary account.",
    employeeCategory: "HR",
    expectedCategory: "Payroll",
    expectedIntent: "Bank Account Update",
    difficulty: "standard",
  },
  {
    id: 7,
    subject: "Quarterly performance bonus missing",
    description: "My manager confirmed Q2 bonus in appraisal but it is missing from current paycheck.",
    employeeCategory: "Payroll",
    expectedCategory: "Payroll",
    expectedIntent: "Bonus/Incentive Query",
    difficulty: "standard",
  },

  // ==========================================
  // 2. LEAVE (7 cases)
  // ==========================================
  {
    id: 8,
    subject: "Leave balance discrepancy",
    description: "I had 12 casual leaves remaining, but portal is showing only 8 after last week.",
    employeeCategory: "HR",
    expectedCategory: "Leave",
    expectedIntent: "Leave Balance Inquiry",
    difficulty: "standard",
  },
  {
    id: 9,
    subject: "Unable to apply for sick leave",
    description: "When submitting sick leave for yesterday, the portal says 'quota exceeded' erroneously.",
    employeeCategory: "IT Support",
    expectedCategory: "Leave",
    expectedIntent: "Leave Application Help",
    difficulty: "medium",
  },
  {
    id: 10,
    subject: "Leave cancellation request",
    description: "I had applied for annual leave next Friday but my travel is cancelled. Please revoke it.",
    employeeCategory: "Leave",
    expectedCategory: "Leave",
    expectedIntent: "Leave Cancellation",
    difficulty: "standard",
  },
  {
    id: 11,
    subject: "Maternity leave policy and documents",
    description: "Requesting details on eligible duration and medical document requirements for maternity leave.",
    employeeCategory: "HR",
    expectedCategory: "Leave",
    expectedIntent: "Maternity/Paternity Leave",
    difficulty: "standard",
  },
  {
    id: 12,
    subject: "Comp-off grant for weekend deployment",
    description: "Worked on Sunday production release for 9 hours. Requesting compensatory off crediting.",
    employeeCategory: "Leave",
    expectedCategory: "Leave",
    expectedIntent: "Comp-Off Request",
    difficulty: "standard",
  },
  {
    id: 13,
    subject: "Paternity leave application query",
    description: "Need guidance on how to submit paternity leave and how many weeks are sanctioned.",
    employeeCategory: "Leave",
    expectedCategory: "Leave",
    expectedIntent: "Maternity/Paternity Leave",
    difficulty: "standard",
  },
  {
    id: 14,
    subject: "Annual leave carry-forward query",
    description: "Can I carry forward my 5 unused earned leaves to the next calendar year?",
    employeeCategory: "Leave",
    expectedCategory: "Leave",
    expectedIntent: "Leave Policy Question",
    difficulty: "standard",
  },

  // ==========================================
  // 3. ATTENDANCE (7 cases)
  // ==========================================
  {
    id: 15,
    subject: "Missing attendance punch",
    description: "Biometric failed to register my check-in on Tuesday morning. Please regularize my attendance.",
    employeeCategory: "HR",
    expectedCategory: "Attendance",
    expectedIntent: "Missing Attendance",
    difficulty: "standard",
  },
  {
    id: 16,
    subject: "Marked absent on WFH day",
    description: "Manager approved WFH on Wednesday, but system marked me absent and deducted leave.",
    employeeCategory: "Leave",
    expectedCategory: "Attendance",
    expectedIntent: "Attendance Correction",
    difficulty: "medium",
  },
  {
    id: 17,
    subject: "Dispute late arrival mark",
    description: "Marked late by 5 minutes due to biometric queue at lobby. I entered office at 9:28 AM.",
    employeeCategory: "Attendance",
    expectedCategory: "Attendance",
    expectedIntent: "Late Mark Issue",
    difficulty: "standard",
  },
  {
    id: 18,
    subject: "Biometric device not recognizing thumbprint",
    description: "The 4th floor biometric sensor consistently fails to read my thumb. Need fingerprint re-registration.",
    employeeCategory: "IT Support",
    expectedCategory: "Attendance",
    expectedIntent: "Biometric Issue",
    difficulty: "medium",
  },
  {
    id: 19,
    subject: "Night shift overtime hours missing",
    description: "Worked 4 hours extra on Saturday overnight shift. Overtime hours not showing in timesheet.",
    employeeCategory: "Payroll",
    expectedCategory: "Attendance",
    expectedIntent: "Overtime Query",
    difficulty: "medium",
  },
  {
    id: 20,
    subject: "Request for permanent shift timing change",
    description: "Requesting shift transition from 9:30 AM - 6:30 PM to 8:00 AM - 5:00 PM.",
    employeeCategory: "Attendance",
    expectedCategory: "Attendance",
    expectedIntent: "Shift Change",
    difficulty: "standard",
  },
  {
    id: 21,
    subject: "Emergency WFH approval regularize",
    description: "Had to work from home due to heavy rain and waterlogging. Regularization request submitted.",
    employeeCategory: "Attendance",
    expectedCategory: "Attendance",
    expectedIntent: "Work From Home",
    difficulty: "standard",
  },

  // ==========================================
  // 4. IT SUPPORT (7 cases)
  // ==========================================
  {
    id: 22,
    subject: "Laptop blue screen crash",
    description: "My Dell workstation keeps crashing with BSOD memory management error whenever running Docker.",
    employeeCategory: "IT Support",
    expectedCategory: "IT Support",
    expectedIntent: "Laptop/Hardware Issue",
    difficulty: "standard",
  },
  {
    id: 23,
    subject: "Cannot connect to office OpenVPN",
    description: "TLS handshake error when connecting to Mumbai VPN gateway from home broadband.",
    employeeCategory: "IT Support",
    expectedCategory: "IT Support",
    expectedIntent: "VPN Issue",
    difficulty: "standard",
  },
  {
    id: 24,
    subject: "Docker desktop license and installation",
    description: "Need Docker Desktop and VS Code Enterprise license installed on my newly assigned machine.",
    employeeCategory: "IT Support",
    expectedCategory: "IT Support",
    expectedIntent: "Software Installation",
    difficulty: "standard",
  },
  {
    id: 25,
    subject: "Outlook password locked",
    description: "Entered wrong password multiple times, my corporate email and active directory account are locked.",
    employeeCategory: "IT Support",
    expectedCategory: "IT Support",
    expectedIntent: "Password Reset",
    difficulty: "standard",
  },
  {
    id: 26,
    subject: "Access to AWS staging cluster",
    description: "Need IAM role or kubeconfig access for the staging EKS cluster for QA deployment.",
    employeeCategory: "IT Support",
    expectedCategory: "IT Support",
    expectedIntent: "Access Permission",
    difficulty: "standard",
  },
  {
    id: 27,
    subject: "External monitor not detected",
    description: "HDMI port on my laptop is not sending signal to the Dell external display.",
    employeeCategory: "IT Support",
    expectedCategory: "IT Support",
    expectedIntent: "Laptop/Hardware Issue",
    difficulty: "standard",
  },
  {
    id: 28,
    subject: "3rd floor network printer jam",
    description: "HP LaserJet printer in Bay 3 is showing paper feed error and not printing queued documents.",
    employeeCategory: "IT Support",
    expectedCategory: "IT Support",
    expectedIntent: "Printer Issue",
    difficulty: "standard",
  },

  // ==========================================
  // 5. HR (General) (6 cases)
  // ==========================================
  {
    id: 29,
    subject: "Experience letter request for visa",
    description: "Applying for Schengen tourist visa. Requesting formal experience cum employment verification letter.",
    employeeCategory: "HR",
    expectedCategory: "HR",
    expectedIntent: "Document Request",
    difficulty: "standard",
  },
  {
    id: 30,
    subject: "Update residential address and emergency contact",
    description: "Relocated to a new apartment in Indiranagar. Please update my permanent address in HRMS.",
    employeeCategory: "HR",
    expectedCategory: "HR",
    expectedIntent: "Personal Info Update",
    difficulty: "standard",
  },
  {
    id: 31,
    subject: "Health insurance dependent addition",
    description: "Recently got married and want to add my spouse to the group medical insurance policy.",
    employeeCategory: "HR",
    expectedCategory: "HR",
    expectedIntent: "Benefits Inquiry",
    difficulty: "standard",
  },
  {
    id: 32,
    subject: "New employee physical ID card pending",
    description: "Joined 3 weeks ago but security desk says physical RFID badge is not printed yet.",
    employeeCategory: "HR",
    expectedCategory: "HR",
    expectedIntent: "Onboarding Issue",
    difficulty: "standard",
  },
  {
    id: 33,
    subject: "Resignation and notice period process query",
    description: "Requesting details on standard 60-day notice period policy and buyout options.",
    employeeCategory: "HR",
    expectedCategory: "HR",
    expectedIntent: "Exit/Resignation",
    difficulty: "standard",
  },
  {
    id: 34,
    subject: "Company holiday calendar clarification",
    description: "Is upcoming festival day an optional holiday or restricted holiday for Bangalore office?",
    employeeCategory: "HR",
    expectedCategory: "HR",
    expectedIntent: "Policy Inquiry",
    difficulty: "standard",
  },

  // ==========================================
  // 6. COMPLAINT / GRIEVANCE (5 cases)
  // ==========================================
  {
    id: 35,
    subject: "Unprofessional behavior from team lead",
    description: "My team lead repeatedly uses derogatory language in team standups and private chats.",
    employeeCategory: "HR",
    expectedCategory: "Complaint",
    expectedIntent: "Workplace Harassment",
    difficulty: "hard",
  },
  {
    id: 36,
    subject: "Unfair performance appraisal rating dispute",
    description: "Received biased rating without meeting review targets. Manager refused one-on-one discussion.",
    employeeCategory: "Complaint",
    expectedCategory: "Complaint",
    expectedIntent: "Manager Issue",
    difficulty: "standard",
  },
  {
    id: 37,
    subject: "AC temperature not working in cafeteria",
    description: "Cafeteria cooling has been broken for 10 days, causing suffocating environment during lunch.",
    employeeCategory: "IT Support",
    expectedCategory: "Complaint",
    expectedIntent: "Workplace Environment",
    difficulty: "medium",
  },
  {
    id: 38,
    subject: "Gender bias in project allocations",
    description: "I feel systematically excluded from client-facing projects despite superior technical evaluations.",
    employeeCategory: "HR",
    expectedCategory: "Complaint",
    expectedIntent: "Discrimination",
    difficulty: "hard",
  },
  {
    id: 39,
    subject: "Safety violation in server room",
    description: "Fire exit door in server room on 1st floor is chained and padlocked, creating hazard.",
    employeeCategory: "Complaint",
    expectedCategory: "Complaint",
    expectedIntent: "Policy Violation",
    difficulty: "standard",
  },

  // ==========================================
  // 7. RECRUITMENT (5 cases)
  // ==========================================
  {
    id: 40,
    subject: "Job opening for Senior Backend Engineer",
    description: "Need to know if open requisition for Go/Python backend developer has been approved.",
    employeeCategory: "Recruitment",
    expectedCategory: "Recruitment",
    expectedIntent: "Job Opening Inquiry",
    difficulty: "standard",
  },
  {
    id: 41,
    subject: "Candidate technical interview reschedule",
    description: "I have client clash at 4 PM. Need to reschedule frontend candidate interview to Friday.",
    employeeCategory: "Recruitment",
    expectedCategory: "Recruitment",
    expectedIntent: "Interview Schedule",
    difficulty: "standard",
  },
  {
    id: 42,
    subject: "Candidate offer rollout status",
    description: "Candidate Vikram cleared final director round on Monday. Has offer letter been dispatched?",
    employeeCategory: "Recruitment",
    expectedCategory: "Recruitment",
    expectedIntent: "Offer Letter Issue",
    difficulty: "standard",
  },
  {
    id: 43,
    subject: "Internship intake hiring drive 2026",
    description: "Are we conducting campus recruitment drive at NIT or IIIT this semester?",
    employeeCategory: "Recruitment",
    expectedCategory: "Recruitment",
    expectedIntent: "Job Opening Inquiry",
    difficulty: "standard",
  },
  {
    id: 44,
    subject: "Interview feedback form link expired",
    description: "Link to submit scorecard for yesterday's candidate has expired. Please regenerate.",
    employeeCategory: "IT Support",
    expectedCategory: "Recruitment",
    expectedIntent: "Interview Schedule",
    difficulty: "medium",
  },

  // ==========================================
  // 8. EMPLOYEE REFERRAL (5 cases)
  // ==========================================
  {
    id: 45,
    subject: "Referral status check for SDE-2 candidate",
    description: "Referred my former colleague Priya Sharma for React role. Portal hasn't updated status.",
    employeeCategory: "Recruitment",
    expectedCategory: "Employee Referral",
    expectedIntent: "Referral Status",
    difficulty: "medium",
  },
  {
    id: 46,
    subject: "Referral bonus payout date",
    description: "My referred candidate completed 90 days probation last month. When will referral bonus be credited?",
    employeeCategory: "Payroll",
    expectedCategory: "Employee Referral",
    expectedIntent: "Referral Bonus",
    difficulty: "medium",
  },
  {
    id: 47,
    subject: "Submitting external resume for referral",
    description: "Unable to attach PDF resume on referral portal for Senior DevOps role.",
    employeeCategory: "Employee Referral",
    expectedCategory: "Employee Referral",
    expectedIntent: "Referral Submission",
    difficulty: "standard",
  },
  {
    id: 48,
    subject: "Referral policy reward tiers",
    description: "Is the referral reward Rs. 50,000 or Rs. 75,000 for Architect level positions?",
    employeeCategory: "HR",
    expectedCategory: "Employee Referral",
    expectedIntent: "Referral Policy",
    difficulty: "standard",
  },
  {
    id: 49,
    subject: "Candidate referral duplicate error",
    description: "System says candidate email already in database, but friend applied 2 years ago.",
    employeeCategory: "Employee Referral",
    expectedCategory: "Employee Referral",
    expectedIntent: "Referral Submission",
    difficulty: "standard",
  },

  // ==========================================
  // 9. HINGLISH & AMBIGUOUS (6 cases)
  // ==========================================
  {
    id: 50,
    subject: "Salary nahi aayi abhi tak",
    description: "Meri August mahine ki salary account me credit nahi hui hai, please check karein.",
    employeeCategory: "HR",
    expectedCategory: "Payroll",
    expectedIntent: "Salary Not Credited",
    difficulty: "hinglish",
  },
  {
    id: 51,
    subject: "Casual leave balance check karna hai",
    description: "Mujhe check karna hai ki meri kitni leaves bachi hain is saal ke liye.",
    employeeCategory: "HR",
    expectedCategory: "Leave",
    expectedIntent: "Leave Balance Inquiry",
    difficulty: "hinglish",
  },
  {
    id: 52,
    subject: "Laptop start nahi ho raha",
    description: "Power button dabane par laptop on nahi ho raha, screen blank hai.",
    employeeCategory: "HR",
    expectedCategory: "IT Support",
    expectedIntent: "Laptop/Hardware Issue",
    difficulty: "hinglish",
  },
  {
    id: 53,
    subject: "Attendance punch miss ho gaya",
    description: "Kal subah entry karte waqt biometric machine offline thi, attendance absent mark ho gayi.",
    employeeCategory: "Attendance",
    expectedCategory: "Attendance",
    expectedIntent: "Missing Attendance",
    difficulty: "hinglish",
  },
  {
    id: 54,
    subject: "Account issue",
    description: "I am unable to login and my credentials are not working.",
    employeeCategory: "HR",
    expectedCategory: "IT Support",
    expectedIntent: "Password Reset",
    difficulty: "hard",
  },
  {
    id: 55,
    subject: "Multiple issues with pay and leave",
    description: "My salary has 3000 deduction because attendance system marked 2 days unpaid leave incorrectly.",
    employeeCategory: "Payroll",
    expectedCategory: "Payroll",
    expectedIntent: "Salary Deduction Query",
    difficulty: "hard",
  },
];

// =========================================================
// BENCHMARK RUNNER
// =========================================================

export async function runEvaluation() {
  console.log(`\n========================================`);
  console.log(`Starting AI Classification Benchmark`);
  console.log(`Dataset size: ${EVALUATION_DATASET.length} test cases`);
  console.log(`========================================\n`);

  let correctCount = 0;
  let evaluatedCount = 0;
  const categoryStats: Record<string, { total: number; correct: number }> = {};

  for (const testCase of EVALUATION_DATASET) {
    if (!categoryStats[testCase.expectedCategory]) {
      categoryStats[testCase.expectedCategory] = { total: 0, correct: 0 };
    }
    categoryStats[testCase.expectedCategory].total += 1;

    try {
      const result = await classifyTicket(
        testCase.subject,
        testCase.description,
        testCase.employeeCategory,
      );

      evaluatedCount += 1;

      if (!result) {
        console.log(
          `❌ [#${testCase.id}] [SKIPPED/NULL] ${testCase.subject} (Expected: ${testCase.expectedCategory})`,
        );
        continue;
      }

      const isMatch =
        result.category.toLowerCase().trim() ===
        testCase.expectedCategory.toLowerCase().trim();

      if (isMatch) {
        correctCount += 1;
        categoryStats[testCase.expectedCategory].correct += 1;
        console.log(
          `✅ [#${testCase.id}] ${testCase.subject} -> ${result.category} (${Math.round(result.confidence * 100)}%) [Priority: ${result.priority}, Tone: ${result.sentiment}]`,
        );
      } else {
        console.log(
          `❌ [#${testCase.id}] MISMATCH: ${testCase.subject}\n   Expected: ${testCase.expectedCategory}\n   Got:      ${result.category}\n   Priority: ${result.priority} (${result.priorityReason})\n   Tone:     ${result.sentiment}\n   Reason:   ${result.reason}`,
        );
      }
    } catch (err) {
      console.error(`Error on test #${testCase.id}:`, err);
    }
  }

  const accuracy = evaluatedCount > 0 ? (correctCount / evaluatedCount) * 100 : 0;

  console.log(`\n========================================`);
  console.log(`Evaluation Summary`);
  console.log(`Total Cases: ${EVALUATION_DATASET.length}`);
  console.log(`Evaluated:   ${evaluatedCount}`);
  console.log(`Correct:     ${correctCount}`);
  console.log(`Accuracy:    ${accuracy.toFixed(1)}%`);
  console.log(`========================================\n`);

  console.log(`Per-Category Breakdown:`);
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const pct = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(0) : "0";
    console.log(`  - ${cat.padEnd(20)}: ${stats.correct}/${stats.total} (${pct}%)`);
  }
}

runEvaluation().catch(console.error);
