import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { isAdmin } from "@/middleware/rbac";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import { generateCalendarAI } from "@/services/ai.service";
import { generateOrganizationAI } from "@/services/ai.service";
import * as repo from "./organization.repository";

export const organizationRouter = Router();

organizationRouter.use(authenticate);

/* -------------------------------------------------------------------------- */
/* Existing Organization APIs                                                 */
/* -------------------------------------------------------------------------- */

organizationRouter.get("/departments", async (_req, res, next) => {
  try {
    res.json({
      departments: await repo.listDepartments(),
    });
  } catch (err) {
    next(err);
  }
});

const departmentSchema = z.object({
  name: z.string().min(2, "Department name is required."),
  code: z.string().min(2).max(10),
  description: z.string().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

organizationRouter.post(
  "/departments",
  isAdmin,
  validate(departmentSchema),
  async (req, res, next) => {
    try {
      const department = await repo.createDepartment(req.body);
      res.status(201).json({ department });
    } catch (err) {
      next(err);
    }
  },
);

const updateDepartmentSchema = departmentSchema.partial().extend({
  headId: z.string().nullable().optional(),
});

organizationRouter.patch(
  "/departments/:id",
  isAdmin,
  validate(updateDepartmentSchema),
  async (req, res, next) => {
    try {
      const department = await repo.updateDepartment(
        req.params.id,
        req.body,
      );

      if (!department) {
        throw new AppError("Department not found.", 404);
      }

      res.json({ department });
    } catch (err) {
      next(err);
    }
  },
);

organizationRouter.get("/designations", async (_req, res, next) => {
  try {
    res.json({
      designations: await repo.listDesignations(),
    });
  } catch (err) {
    next(err);
  }
});

const designationSchema = z.object({
  title: z.string().min(2),
  level: z.number().int().min(1).max(10),
  departmentId: z.string(),
});

organizationRouter.post(
  "/designations",
  isAdmin,
  validate(designationSchema),
  async (req, res, next) => {
    try {
      const designation = await repo.createDesignation(req.body);
      res.status(201).json({ designation });
    } catch (err) {
      next(err);
    }
  },
);

organizationRouter.get("/holidays", async (_req, res, next) => {
  try {
    res.json({
      holidays: await repo.listHolidays(),
    });
  } catch (err) {
    next(err);
  }
});

const holidaySchema = z.object({
  name: z.string().min(2),
  date: z.string(),
  isOptional: z.boolean().optional(),
});

organizationRouter.post(
  "/holidays",
  isAdmin,
  validate(holidaySchema),
  async (req, res, next) => {
    try {
      const holiday = await repo.createHoliday(req.body);
      res.status(201).json({ holiday });
    } catch (err) {
      next(err);
    }
  },
);

organizationRouter.delete(
  "/holidays/:id",
  isAdmin,
  async (req, res, next) => {
    try {
      await repo.deleteHoliday(req.params.id);

      res.json({
        success: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* AI Organization Search                                                     */
/* -------------------------------------------------------------------------- */

const organizationSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "Search query is required.")
    .max(500, "Search query is too long."),
});

const organizationSearchAIResponseSchema = z.object({
  employeeName: z.string().nullable().optional(),
  managerName: z.string().nullable().optional(),
  departmentName: z.string().nullable().optional(),
  designationTitle: z.string().nullable().optional(),
  workLocation: z.string().nullable().optional(),
  relation: z
    .enum([
      "DIRECT_REPORTS",
      "INDIRECT_REPORTS",
      "MANAGER",
      "EMPLOYEES",
      "LARGEST_TEAMS",
    ])
    .optional(),
  includeInactive: z.boolean().optional(),
});

type OrganizationSearchAIResponse = z.infer<
  typeof organizationSearchAIResponseSchema
>;

type OrganizationSearchRelation =
  NonNullable<OrganizationSearchAIResponse["relation"]>;

const organizationSearchFallback = (
  query: string,
): OrganizationSearchAIResponse => {
  const normalized = query.trim();

  const managerMatch = normalized.match(
    /who\s+is\s+(.+?)['’]s?\s+manager/i,
  );

  if (managerMatch?.[1]) {
    return {
      employeeName: managerMatch[1].trim(),
      relation: "MANAGER",
      includeInactive: false,
    };
  }

  const indirectMatch = normalized.match(
    /(?:reports?|reporting)\s+(?:indirectly\s+)?to\s+(.+)/i,
  );

  if (
    indirectMatch?.[1] &&
    /\bindirectly\b/i.test(normalized)
  ) {
    return {
      employeeName: indirectMatch[1].trim(),
      relation: "INDIRECT_REPORTS",
      includeInactive: false,
    };
  }

  const directMatch = normalized.match(
    /(?:reports?|reporting)\s+(?:directly\s+)?to\s+(.+)/i,
  );

  if (directMatch?.[1]) {
    return {
      employeeName: directMatch[1].trim(),
      relation: "DIRECT_REPORTS",
      includeInactive: false,
    };
  }

  if (/largest\s+teams?/i.test(normalized)) {
    return {
      relation: "LARGEST_TEAMS",
      includeInactive: false,
    };
  }

  const employeesInMatch = normalized.match(
    /(?:show\s+)?(?:all\s+)?employees?\s+in\s+(.+?)(?:\s+in\s+(.+))?$/i,
  );

  if (employeesInMatch?.[1]) {
    return {
      departmentName: employeesInMatch[1].trim(),
      workLocation: employeesInMatch[2]?.trim() || null,
      relation: "EMPLOYEES",
      includeInactive: false,
    };
  }

  return {
    relation: "EMPLOYEES",
    includeInactive: false,
  };
};

const interpretOrganizationSearch = async (
  query: string,
): Promise<OrganizationSearchAIResponse> => {
  const fallback = organizationSearchFallback(query);

  const result = await generateOrganizationAI(
    `Interpret an HRMS organization chart search query.

Your job is ONLY to convert the user's natural language into structured
filters.

IMPORTANT RULES:
- Never invent employee names.
- Never invent departments.
- Never invent designations.
- Never invent locations.
- Do not return employee records.
- Do not answer the user's question.
- Only identify the filters implied by the query.
- The database will be queried separately for the actual employees.
- If a person is mentioned in a manager/reporting relationship, put that
  person's name in employeeName.
- For "who is X's manager", use relation MANAGER.
- For "who reports to X" or "everyone reporting to X", use DIRECT_REPORTS.
- For "who reports indirectly to X", use INDIRECT_REPORTS.
- For department/company employee searches, use EMPLOYEES.
- For "managers with the largest teams", use LARGEST_TEAMS.
- Use designationTitle for queries such as "Tech Leads".
- Use workLocation when a city/location is explicitly mentioned.
- Set includeInactive to false unless the user explicitly asks for
  inactive, terminated, former, or exited employees.

Allowed relation values:
DIRECT_REPORTS
INDIRECT_REPORTS
MANAGER
EMPLOYEES
LARGEST_TEAMS

User query:
${query}`,
    organizationSearchAIResponseSchema,
    fallback,
  );

  return result;
};

organizationRouter.post(
  "/ai/search",
  validate(organizationSearchSchema),
  async (req, res, next) => {
    try {
      const { query } = req.body;

      const interpreted = await interpretOrganizationSearch(query);

      const relation = interpreted.relation ?? "EMPLOYEES";
      const includeInactive = interpreted.includeInactive ?? false;

      /*
       * If AI identifies a manager by name, resolve that name against the
       * database before executing the actual organization search.
       */
      let filters = {
        employeeName: interpreted.employeeName || undefined,
        managerName: interpreted.managerName || undefined,
        departmentName: interpreted.departmentName || undefined,
        designationTitle: interpreted.designationTitle || undefined,
        workLocation: interpreted.workLocation || undefined,
        relation,
        includeInactive,
      };

      if (
        interpreted.managerName &&
        !interpreted.employeeName
      ) {
        const managers = await repo.findEmployeesByName(
          interpreted.managerName,
        );

        if (managers.length === 1) {
          filters = {
            ...filters,
            managerName: undefined,
            employeeName: managers[0].firstName +
              " " +
              managers[0].lastName,
          };
        }
      }

      const employees = await repo.searchOrganization(filters);

      res.json({
        query,
        filters,
        total: employees.length,
        employees,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* -------------------------------------------------------------------------- */
/* AI Skill Dependency Analysis                                               */
/* -------------------------------------------------------------------------- */

const skillDependencyQuerySchema = z.object({
  departmentId: z.string().trim().optional(),
  managerId: z.string().trim().optional(),
  includeInactive: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

const skillDependencyAIResponseSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(1000),
  recommendations: z
    .array(z.string().min(1).max(500))
    .max(8),
});

type SkillDependencyAIResponse = z.infer<
  typeof skillDependencyAIResponseSchema
>;

organizationRouter.get(
  "/ai/skill-dependencies",
  async (req, res, next) => {
    try {
      const parsed = skillDependencyQuerySchema.safeParse(
        req.query,
      );

      if (!parsed.success) {
        throw new AppError(
          "Invalid skill dependency filters.",
          400,
        );
      }

      const {
        departmentId,
        managerId,
        includeInactive = false,
      } = parsed.data;

      /*
       * Get employee skill data from the database first.
       * AI never determines employee counts, names, skills, or risk levels.
       */
      const employees =
        await repo.getSkillDependencyEmployees({
          departmentId,
          managerId,
          includeInactive,
        });

      let scopedEmployees = employees;

      /*
       * When a manager is selected, include the complete hierarchy below
       * that manager rather than only the direct reports.
       */
      if (managerId) {
        const indirectReportIds =
          await repo.getIndirectReportIds(managerId);

        const allowedIds = new Set(
          indirectReportIds.map((id) => String(id)),
        );

        scopedEmployees = employees.filter((employee) =>
          allowedIds.has(String(employee.id)),
        );
      }

      const analysis =
        repo.calculateSkillDependencies(scopedEmployees);

      const fallback: SkillDependencyAIResponse = {
        summary:
          analysis.length === 0
            ? "No employee skill dependency data was found for the selected organization scope."
            : `The analysis identified ${analysis.length} tracked skills across ${scopedEmployees.length} employees.`,
        recommendations:
          analysis.length === 0
            ? []
            : [
                "Cross-train employees on skills with high dependency concentration.",
                "Create backup ownership for critical skills held by very few employees.",
                "Review skill coverage periodically as team composition changes.",
              ],
      };

      const aiExplanation =
        analysis.length === 0
          ? fallback
          : await generateOrganizationAI(
              `Analyze the following deterministic HRMS skill dependency data.

The data below has already been calculated by the backend.

IMPORTANT:
- Do NOT change employee counts.
- Do NOT change dependency ratios.
- Do NOT change risk levels.
- Do NOT invent employees or skills.
- Do NOT invent skill ownership.
- Do NOT calculate a different risk level.
- Use the supplied data as the source of truth.
- Provide a concise management summary.
- Provide practical recommendations for reducing skill concentration.
- Recommendations should focus on cross-training, backup ownership,
  knowledge transfer, documentation, succession, or hiring where appropriate.

Deterministic skill dependency data:
${JSON.stringify(analysis)}`,
              skillDependencyAIResponseSchema,
              fallback,
            );

      res.json({
        scope: {
          departmentId: departmentId || null,
          managerId: managerId || null,
          includeInactive,
        },
        employeeCount: scopedEmployees.length,
        skills: analysis,
        summary: aiExplanation.summary,
        recommendations: aiExplanation.recommendations,
      });
    } catch (err) {
      next(err);
    }
  },
);