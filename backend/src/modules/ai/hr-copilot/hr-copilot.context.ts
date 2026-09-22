import { HrCopilotPageContext, HrCopilotUserContext } from "./hr-copilot.types";
import { GovernanceRole } from "@/modules/governance/governance.model";

export function buildPageContext(
  pageContext: HrCopilotPageContext | undefined,
): HrCopilotPageContext {
  return {
    pathname: pageContext?.pathname ?? "/app",
    pageTitle: pageContext?.pageTitle ?? "HRMS",
    entityId: pageContext?.entityId,
    module: pageContext?.module,
  };
}

export async function buildUserContext(req: any): Promise<HrCopilotUserContext> {
  const role = String(req.user!.role);
  let permissions: string[] = [];

  if (role !== "SUPER_ADMIN") {
    const roleDoc = await GovernanceRole.findOne({ role }).select("permissions").lean();
    permissions = Array.isArray(roleDoc?.permissions)
      ? roleDoc.permissions.map(String)
      : [];
  }

  return {
    userId: req.user!.userId,
    employeeId: req.user!.employeeId ?? null,
    role,
    permissions,
  };
}
