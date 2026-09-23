export type HrCopilotIntent =
  | "SELF_SUMMARY"
  | "EMPLOYEE_LOOKUP"
  | "ATTENDANCE"
  | "LEAVE"
  | "PERFORMANCE"
  | "CALENDAR"
  | "PAYROLL"
  | "RECRUITMENT"
  | "ORGANIZATION"
  | "DOCUMENTS"
  | "REPORTS"
  | "DASHBOARD"
  | "CROSS_MODULE"
  | "GENERAL";

export type HrCopilotDataSource =
  | "employee"
  | "attendance"
  | "leave"
  | "performance"
  | "calendar"
  | "payroll"
  | "recruitment"
  | "organization"
  | "documents"
  | "reports"
  | "dashboard"
  | "tickets"
  | "announcements";

export interface HrCopilotUserContext {
  userId: string;
  employeeId: string | null;
  role: string;
  permissions: string[];
}

export interface HrCopilotPageContext {
  pathname?: string;
  pageTitle?: string;
  entityId?: string;
  module?: string;
}

export interface HrCopilotRequest {
  message: string;
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  pageContext?: HrCopilotPageContext;
}

export interface HrCopilotSource {
  module: HrCopilotDataSource;
  description: string;
}

export interface HrCopilotContext {
  user: HrCopilotUserContext;
  page: HrCopilotPageContext;
  data: Record<string, unknown>;
  sources: HrCopilotSource[];
}

export interface HrCopilotResponse {
  answer: string;
  intent: HrCopilotIntent;
  sources: HrCopilotSource[];
}
