import { classifyTicket } from "../services/ai.service";

interface TestScenario {
  name: string;
  subject: string;
  description: string;
  expectedCategory: string;
  expectedPriority?: string;
  expectedSentiment?: string;
}

const scenarios: TestScenario[] = [
  {
    name: "1. Critical Financial Blocker (Salary Unpaid + EMI pending)",
    subject: "Salary not credited and EMI bouncing tomorrow!",
    description: "My salary for this month is not credited yet. Tomorrow my home loan EMI will bounce and bank will charge penalty. Please release it immediately.",
    expectedCategory: "Payroll",
    expectedPriority: "HIGH",
    expectedSentiment: "FRUSTRATED",
  },
  {
    name: "2. IT Production Blocker (Laptop blue screen)",
    subject: "Laptop blue screen crash before client presentation",
    description: "My Dell laptop crashed with blue screen of death. I have a critical client demo in 2 hours. Need immediate IT support or replacement laptop.",
    expectedCategory: "IT Support",
    expectedPriority: "HIGH",
  },
  {
    name: "3. Routine Leave Balance Query",
    subject: "Casual leave balance verification",
    description: "Hi HR team, I wanted to verify how many casual leave balance days are carried forward for this quarter.",
    expectedCategory: "Leave",
    expectedPriority: "MEDIUM",
    expectedSentiment: "NEUTRAL",
  },
  {
    name: "4. Severe Workplace Grievance",
    subject: "Harassment and abusive language from team manager",
    description: "I am facing severe mental harassment and inappropriate verbal abuse in team meetings from my manager. I cannot work under these toxic conditions.",
    expectedCategory: "Complaint",
    expectedPriority: "HIGH",
    expectedSentiment: "CRITICAL",
  },
  {
    name: "5. Hinglish Real-World Query",
    subject: "Attendance punch miss ho gaya",
    description: "Biometric machine work nahi kar raha tha morning me to punch miss ho gaya. Please regularize kar do.",
    expectedCategory: "Attendance",
    expectedPriority: "MEDIUM",
  },
  {
    name: "6. Edge / Out-of-scope Query",
    subject: "Company cricket tournament on weekend",
    description: "Can we organize a company cricket tournament this weekend for Bangalore employees?",
    expectedCategory: "HR",
    expectedPriority: "LOW",
  },
];

async function runValidation() {
  console.log("===============================================================");
  console.log("   HRMS AI TICKET SYSTEM VALIDATION SUITE (PHASE 1 & 2)       ");
  console.log("===============================================================\n");

  let passed = 0;

  for (const scenario of scenarios) {
    console.log(`\n--- Scenario: ${scenario.name} ---`);
    console.log(`Subject:     "${scenario.subject}"`);

    const result = await classifyTicket(scenario.subject, scenario.description);

    if (!result) {
      console.log("❌ Result: FAILED (Received null response)");
      continue;
    }

    const catMatch = result.category.toLowerCase() === scenario.expectedCategory.toLowerCase();
    const prioMatch = scenario.expectedPriority ? result.priority === scenario.expectedPriority : true;

    console.log(`Category:    ${result.category} (Expected: ${scenario.expectedCategory}) -> ${catMatch ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Intent:      ${result.intent}`);
    console.log(`Confidence:  ${Math.round(result.confidence * 100)}%`);
    console.log(`Priority:    ${result.priority} (Expected: ${scenario.expectedPriority ?? "ANY"}) -> ${prioMatch ? "✅ PASS" : "⚠️ NOTE"}`);
    console.log(`Priority Why:${result.priorityReason}`);
    console.log(`Sentiment:   ${result.sentiment}`);
    console.log(`Reasoning:   ${result.reason}`);

    if (catMatch) {
      passed++;
    }
  }

  console.log("\n===============================================================");
  console.log(`RESULTS: ${passed}/${scenarios.length} scenarios passed category validation`);
  console.log("===============================================================\n");
}

runValidation().catch(console.error);
