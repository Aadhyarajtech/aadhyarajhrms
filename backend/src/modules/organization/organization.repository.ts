import {
  Department,
  Designation,
  Holiday,
  Employee,
} from "@/db/models";
import { nowIso } from "@/db/connection";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// ===========================================================================
// EXISTING ORGANIZATION FUNCTIONS
// ===========================================================================

export async function listDepartments() {
  const departments = await Department.find({}).sort({ name: 1 }).lean();
  if (departments.length === 0) return [];

  const headIds = [
    ...new Set(
      departments
        .map((d) => d.headId)
        .filter(Boolean),
    ),
  ] as string[];

  const [headcounts, heads] = await Promise.all([
    Employee.aggregate([
      { $match: { status: "ACTIVE" } },
      {
        $group: {
          _id: "$departmentId",
          count: { $sum: 1 },
        },
      },
    ]),
    Employee.find({
      _id: { $in: headIds },
    }).lean(),
  ]);

  const countMap = new Map(
    headcounts.map((c) => [c._id, c.count]),
  );

  const headMap = new Map(
    heads.map((h) => [h._id, h]),
  );

  return departments.map((d) => {
    const head = d.headId
      ? headMap.get(d.headId)
      : undefined;

    return {
      id: d._id,
      ...d,
      headcount: countMap.get(d._id) ?? 0,
      headFirstName: head?.firstName ?? null,
      headLastName: head?.lastName ?? null,
    };
  });
}

export async function getDepartment(id: string) {
  const row = await Department.findById(id).lean();
  return toApiDoc(row);
}

export async function createDepartment(input: {
  name: string;
  code: string;
  description?: string;
  colorHex?: string;
}) {
  const doc = await Department.create({
    name: input.name,
    code: input.code.toUpperCase(),
    description: input.description ?? null,
    colorHex: input.colorHex ?? "#5B4FE5",
    createdAt: nowIso(),
  });

  return getDepartment(doc._id);
}

export async function updateDepartment(
  id: string,
  input: {
    name?: string;
    description?: string;
    colorHex?: string;
    headId?: string | null;
  },
) {
  const current = await Department.findById(id).lean();

  if (!current) return undefined;

  await Department.updateOne(
    { _id: id },
    {
      $set: {
        name: input.name ?? current.name,
        description:
          input.description ?? current.description,
        colorHex:
          input.colorHex ?? current.colorHex,
        headId:
          input.headId === undefined
            ? current.headId
            : input.headId,
      },
    },
  );

  return getDepartment(id);
}

export async function listDesignations(
  departmentId?: string,
) {
  if (departmentId) {
    const rows = await Designation.find({
      departmentId,
    })
      .sort({
        level: -1,
        title: 1,
      })
      .lean();

    return rows.map(toApiDoc);
  }

  const rows = await Designation.find({})
    .lean();

  const departmentIds = [
    ...new Set(
      rows.map((r) => r.departmentId),
    ),
  ];

  const departments = await Department.find({
    _id: { $in: departmentIds },
  }).lean();

  const deptMap = new Map(
    departments.map((d) => [d._id, d]),
  );

  return rows
    .map((r) => ({
      id: r._id,
      ...r,
      departmentName:
        deptMap.get(r.departmentId)?.name ?? null,
    }))
    .sort((a, b) => {
      const deptCompare =
        (a.departmentName ?? "").localeCompare(
          b.departmentName ?? "",
        );

      if (deptCompare !== 0) {
        return deptCompare;
      }

      return b.level - a.level;
    });
}

export async function createDesignation(input: {
  title: string;
  level: number;
  departmentId: string;
}) {
  const doc = await Designation.create(input);

  return toApiDoc(
    (await Designation.findById(doc._id).lean())!,
  );
}

export async function listHolidays(year?: number) {
  const query = year
    ? { date: { $regex: `^${year}-` } }
    : {};

  const rows = await Holiday.find(query)
    .sort({ date: 1 })
    .lean();

  return rows.map(toApiDoc);
}

export async function createHoliday(input: {
  name: string;
  date: string;
  isOptional?: boolean;
}) {
  const doc = await Holiday.create({
    name: input.name,
    date: input.date,
    isOptional: !!input.isOptional,
  });

  return toApiDoc(
    (await Holiday.findById(doc._id).lean())!,
  );
}

export async function deleteHoliday(id: string) {
  await Holiday.deleteOne({ _id: id });
}

// ===========================================================================
// AI ORGANIZATION SEARCH
// ===========================================================================

export interface OrganizationSearchFilters {
  employeeName?: string;
  managerName?: string;
  departmentName?: string;
  designationTitle?: string;
  workLocation?: string;
  managerId?: string;
  departmentId?: string;
  designationId?: string;

  /**
   * DIRECT_REPORTS:
   * Employees whose manager is the resolved employee.
   *
   * INDIRECT_REPORTS:
   * All descendants below the resolved employee.
   *
   * MANAGER:
   * The manager of the resolved employee.
   *
   * EMPLOYEES:
   * Regular employee/filter search.
   *
   * LARGEST_TEAMS:
   * Managers ordered by number of direct reports.
   */
  relation?:
    | "DIRECT_REPORTS"
    | "INDIRECT_REPORTS"
    | "MANAGER"
    | "EMPLOYEES"
    | "LARGEST_TEAMS";

  includeInactive?: boolean;
}

export interface OrganizationSearchEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  avatarUrl: string | null;
  departmentId: string;
  departmentName: string | null;
  designationId: string;
  designationTitle: string | null;
  managerId: string | null;
  managerName: string | null;
  workLocation: string | null;
  status: string;
  directReportCount: number;
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegex(value: string) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

async function getOrganizationEmployeeRows(
  employeeIds?: string[],
) {
  const employeeQuery =
    employeeIds && employeeIds.length > 0
      ? { _id: { $in: employeeIds } }
      : {};

  const [employees, departments, designations] =
    await Promise.all([
      Employee.find(employeeQuery)
        .select(
          [
            "_id",
            "employeeCode",
            "firstName",
            "lastName",
            "personalEmail",
            "userId",
            "avatarUrl",
            "departmentId",
            "designationId",
            "managerId",
            "workLocation",
            "status",
          ].join(" "),
        )
        .lean(),

      Department.find({})
        .select("_id name")
        .lean(),

      Designation.find({})
        .select("_id title")
        .lean(),
    ]);

  const departmentMap = new Map(
    departments.map((d) => [
      d._id,
      d.name,
    ]),
  );

  const designationMap = new Map(
    designations.map((d) => [
      d._id,
      d.title,
    ]),
  );

  // Include referenced managers as well so managerName can be resolved
  // even when the result set contains only a manager's direct reports.
  const managerIds = [
    ...new Set(
      employees
        .map((e) => e.managerId)
        .filter(Boolean),
    ),
  ] as string[];

  const managers =
    managerIds.length > 0
      ? await Employee.find({
          _id: { $in: managerIds },
        })
          .select("_id firstName lastName")
          .lean()
      : [];

  const employeeMap = new Map([
    ...employees.map((e) => [e._id, e] as const),
    ...managers.map((e) => [e._id, e] as const),
  ]);

  const directReportCounts = new Map<string, number>();

  for (const employee of employees) {
    if (!employee.managerId) continue;

    directReportCounts.set(
      employee.managerId,
      (directReportCounts.get(employee.managerId) ?? 0) +
        1,
    );
  }

  return employees.map((employee) => {
    const manager = employee.managerId
      ? employeeMap.get(employee.managerId)
      : undefined;

    return {
      id: employee._id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email:
        employee.personalEmail ??
        null,
      avatarUrl:
        employee.avatarUrl ?? null,

      departmentId:
        employee.departmentId,

      departmentName:
        departmentMap.get(
          employee.departmentId,
        ) ?? null,

      designationId:
        employee.designationId,

      designationTitle:
        designationMap.get(
          employee.designationId,
        ) ?? null,

      managerId:
        employee.managerId ?? null,

      managerName: manager
        ? `${manager.firstName} ${manager.lastName}`
        : null,

      workLocation:
        employee.workLocation ?? null,

      status:
        employee.status,

      directReportCount:
        directReportCounts.get(
          employee._id,
        ) ?? 0,
    } satisfies OrganizationSearchEmployee;
  });
}

/**
 * Resolves an employee by name.
 *
 * This function is intentionally database-backed.
 * AI should only provide the name; actual identity comes from MongoDB.
 */
export async function findEmployeesByName(
  name: string,
) {
  const normalizedName = normalizeText(name);

  if (!normalizedName) return [];

  const parts = normalizedName
    .split(" ")
    .filter(Boolean);

  const nameRegex = new RegExp(
    parts
      .map(escapeRegex)
      .join(".*"),
    "i",
  );

  return Employee.find({
    $or: [
      {
        firstName: nameRegex,
      },
      {
        lastName: nameRegex,
      },
      {
        $expr: {
          $regexMatch: {
            input: {
              $concat: [
                "$firstName",
                " ",
                "$lastName",
              ],
            },
            regex: escapeRegex(
              normalizedName,
            ),
            options: "i",
          },
        },
      },
    ],
  })
    .select(
      "_id firstName lastName employeeCode departmentId designationId managerId",
    )
    .lean();
}

/**
 * Returns all descendants of an employee.
 *
 * Uses managerId relationships from the database rather than
 * allowing the AI model to infer reporting relationships.
 */
export async function getIndirectReportIds(
  employeeId: string,
) {
  const employees = await Employee.find({})
    .select("_id managerId")
    .lean();

  const childrenMap = new Map<
    string,
    string[]
  >();

  for (const employee of employees) {
    if (!employee.managerId) continue;

    const children =
      childrenMap.get(
        employee.managerId,
      ) ?? [];

    children.push(employee._id);
    childrenMap.set(
      employee.managerId,
      children,
    );
  }

  const result: string[] = [];
  const queue = [
    ...(childrenMap.get(employeeId) ?? []),
  ];

  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    result.push(current);

    const children =
      childrenMap.get(current) ?? [];

    queue.push(...children);
  }

  return result;
}

/**
 * Resolves an employee's manager directly from managerId.
 */
export async function getEmployeeManager(
  employeeId: string,
) {
  const employee =
    await Employee.findById(employeeId)
      .select("managerId")
      .lean();

  if (!employee?.managerId) {
    return undefined;
  }

  return Employee.findById(
    employee.managerId,
  )
    .select(
      "_id firstName lastName employeeCode departmentId designationId managerId",
    )
    .lean();
}

/**
 * Search the organization using already-interpreted
 * structured filters.
 *
 * This is the DB truth layer behind Natural Language Org Search.
 */
export async function searchOrganization(
  filters: OrganizationSearchFilters,
) {
  let targetEmployeeIds:
    | string[]
    | undefined;

  // -------------------------------------------------------
  // Resolve employee by name
  // -------------------------------------------------------

  if (filters.employeeName) {
    const matches =
      await findEmployeesByName(
        filters.employeeName,
      );

    if (matches.length === 0) {
      return [];
    }

    const primaryEmployee =
      matches[0];

    if (
      filters.relation ===
      "DIRECT_REPORTS"
    ) {
      targetEmployeeIds =
        await Employee.find({
          managerId:
            primaryEmployee._id,
        })
          .select("_id")
          .lean()
          .then((rows) =>
            rows.map((row) => row._id),
          );
    } else if (
      filters.relation ===
      "INDIRECT_REPORTS"
    ) {
      targetEmployeeIds =
        await getIndirectReportIds(
          primaryEmployee._id,
        );
    } else if (
      filters.relation === "MANAGER"
    ) {
      const manager =
        await getEmployeeManager(
          primaryEmployee._id,
        );

      if (!manager) {
        return [];
      }

      targetEmployeeIds = [
        manager._id,
      ];
    } else {
      targetEmployeeIds =
        matches.map(
          (employee) => employee._id,
        );
    }
  }

  // -------------------------------------------------------
  // Explicit manager ID
  // -------------------------------------------------------

  if (
    filters.managerId &&
    !targetEmployeeIds
  ) {
    const rows = await Employee.find({
      managerId:
        filters.managerId,
    })
      .select("_id")
      .lean();

    targetEmployeeIds =
      rows.map((row) => row._id);
  }

  // -------------------------------------------------------
  // Department / designation lookup
  // -------------------------------------------------------

  let departmentId =
    filters.departmentId;

  if (
    !departmentId &&
    filters.departmentName
  ) {
    const department =
      await Department.findOne({
        name: new RegExp(
          `^${escapeRegex(
            normalizeText(
              filters.departmentName,
            ),
          )}$`,
          "i",
        ),
      })
        .select("_id")
        .lean();

    departmentId =
      department?._id;
  }

  let designationId =
    filters.designationId;

  if (
    !designationId &&
    filters.designationTitle
  ) {
    const designation =
      await Designation.findOne({
        title: new RegExp(
          escapeRegex(
            normalizeText(
              filters.designationTitle,
            ),
          ),
          "i",
        ),
      })
        .select("_id")
        .lean();

    designationId =
      designation?._id;
  }

  // -------------------------------------------------------
  // Build deterministic employee query
  // -------------------------------------------------------

  const query: any = {};

  if (targetEmployeeIds) {
    query._id = {
      $in: targetEmployeeIds,
    };
  }

  if (departmentId) {
    query.departmentId =
      departmentId;
  }

  if (designationId) {
    query.designationId =
      designationId;
  }

  if (filters.workLocation) {
    query.workLocation =
      new RegExp(
        escapeRegex(
          normalizeText(
            filters.workLocation,
          ),
        ),
        "i",
      );
  }

  if (
    !filters.includeInactive
  ) {
    query.status = {
      $nin: [
        "TERMINATED",
        "RESIGNED",
        "INACTIVE",
      ],
    };
  }

  // -------------------------------------------------------
  // Execute DB query
  // -------------------------------------------------------

  const employeeRows =
    await Employee.find(query)
      .select("_id")
      .lean();

  const ids = employeeRows.map(
    (row) => row._id,
  );

  if (ids.length === 0) {
    return [];
  }

  const results =
    await getOrganizationEmployeeRows(
      ids,
    );

  // -------------------------------------------------------
  // Largest team query
  // -------------------------------------------------------

  if (
    filters.relation ===
    "LARGEST_TEAMS"
  ) {
    return results
      .filter(
        (employee) =>
          employee.directReportCount >
          0,
      )
      .sort(
        (a, b) =>
          b.directReportCount -
          a.directReportCount,
      );
  }

  return results;
}

// ===========================================================================
// AI SKILL DEPENDENCY ANALYSIS
// ===========================================================================

export interface SkillDependencyEmployee {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string | null;
  designationTitle: string | null;
  managerId: string | null;
  skills: {
    name: string;
    category: string | null;
    competencyLevel:
      | "BEGINNER"
      | "INTERMEDIATE"
      | "ADVANCED"
      | "EXPERT";
  }[];
}

export interface SkillDependencyGroup {
  skill: string;
  category: string | null;

  employeeCount: number;
  advancedOrExpertCount: number;

  employees: {
    id: string;
    name: string;
    designationTitle: string | null;
    competencyLevel:
      | "BEGINNER"
      | "INTERMEDIATE"
      | "ADVANCED"
      | "EXPERT";
  }[];

  dependencyRatio: number;
  riskLevel:
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "CRITICAL";
}

/**
 * Fetches employee skills from MongoDB.
 *
 * This intentionally returns factual organization data only.
 * AI recommendations are generated later from this deterministic data.
 */
export async function getSkillDependencyEmployees(
  options?: {
    departmentId?: string;
    managerId?: string;
    includeInactive?: boolean;
  },
) {
  const query: any = {};

  if (options?.departmentId) {
    query.departmentId =
      options.departmentId;
  }

  // Manager hierarchy scoping is applied by the route after fetching the
  // factual employee/skill dataset. Do not restrict this query to direct
  // reports, otherwise indirect reports would never be available for analysis.

  if (!options?.includeInactive) {
    query.status = {
      $nin: [
        "TERMINATED",
        "RESIGNED",
        "INACTIVE",
      ],
    };
  }

  const [
    employees,
    departments,
    designations,
  ] = await Promise.all([
    Employee.find(query)
      .select(
        "_id firstName lastName departmentId designationId managerId skills",
      )
      .lean(),

    Department.find({})
      .select("_id name")
      .lean(),

    Designation.find({})
      .select("_id title")
      .lean(),
  ]);

  const departmentMap = new Map(
    departments.map((d) => [
      d._id,
      d.name,
    ]),
  );

  const designationMap = new Map(
    designations.map((d) => [
      d._id,
      d.title,
    ]),
  );

  return employees.map(
    (employee) =>
      ({
        id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        departmentId:
          employee.departmentId,
        departmentName:
          departmentMap.get(
            employee.departmentId,
          ) ?? null,
        designationTitle:
          designationMap.get(
            employee.designationId,
          ) ?? null,
        managerId:
          employee.managerId ?? null,
        skills: (
          employee.skills ?? []
        ).map((skill) => ({
          name: skill.name,
          category:
            skill.category ?? null,
          competencyLevel:
            skill.competencyLevel,
        })),
      }) satisfies SkillDependencyEmployee,
  );
}

/**
 * Calculates skill concentration deterministically.
 *
 * Dependency ratio =
 * advanced/expert employees for a skill
 * divided by total employees having that skill.
 *
 * The risk classification is deterministic so the AI cannot
 * invent or alter the underlying risk calculation.
 */
export function calculateSkillDependencies(
  employees: SkillDependencyEmployee[],
) {
  const skillMap = new Map<
    string,
    {
      skill: string;
      category: string | null;
      employees: Map<
        string,
        {
          id: string;
          name: string;
          designationTitle:
            string | null;
          competencyLevel:
            | "BEGINNER"
            | "INTERMEDIATE"
            | "ADVANCED"
            | "EXPERT";
        }
      >;
    }
  >();

  for (const employee of employees) {
    for (const skill of employee.skills) {
      const normalizedSkill =
        normalizeText(
          skill.name,
        ).toLowerCase();

      if (!normalizedSkill) {
        continue;
      }

      let group =
        skillMap.get(
          normalizedSkill,
        );

      if (!group) {
        group = {
          skill: skill.name.trim(),
          category:
            skill.category,
          employees:
            new Map(),
        };

        skillMap.set(
          normalizedSkill,
          group,
        );
      }

      group.employees.set(
        employee.id,
        {
          id: employee.id,
          name: employee.name,
          designationTitle:
            employee.designationTitle,
          competencyLevel:
            skill.competencyLevel,
        },
      );
    }
  }

  const dependencies: SkillDependencyGroup[] =
    [];

  for (const group of skillMap.values()) {
    const employeeList = [
      ...group.employees.values(),
    ];

    const employeeCount =
      employeeList.length;

    const advancedOrExpertCount =
      employeeList.filter(
        (employee) =>
          employee.competencyLevel ===
            "ADVANCED" ||
          employee.competencyLevel ===
            "EXPERT",
      ).length;

    if (employeeCount === 0) {
      continue;
    }

    const dependencyRatio =
      advancedOrExpertCount /
      employeeCount;

    let riskLevel:
      | "LOW"
      | "MEDIUM"
      | "HIGH"
      | "CRITICAL";

    /*
     * Concentration risk:
     *
     * 1 expert/advanced holder -> critical
     * 2 expert/advanced holders -> high
     * >= 50% advanced/expert -> medium
     * otherwise -> low
     *
     * This keeps the calculation explainable and predictable.
     */
    if (
      advancedOrExpertCount === 1
    ) {
      riskLevel = "CRITICAL";
    } else if (
      advancedOrExpertCount === 2
    ) {
      riskLevel = "HIGH";
    } else if (
      dependencyRatio >= 0.5
    ) {
      riskLevel = "MEDIUM";
    } else {
      riskLevel = "LOW";
    }

    dependencies.push({
      skill: group.skill,
      category: group.category,
      employeeCount,
      advancedOrExpertCount,
      employees: employeeList,
      dependencyRatio: Number(
        dependencyRatio.toFixed(4),
      ),
      riskLevel,
    });
  }

  return dependencies.sort(
    (a, b) => {
      const riskWeight = {
        CRITICAL: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1,
      };

      const riskDifference =
        riskWeight[b.riskLevel] -
        riskWeight[a.riskLevel];

      if (riskDifference !== 0) {
        return riskDifference;
      }

      return (
        b.dependencyRatio -
        a.dependencyRatio
      );
    },
  );
}