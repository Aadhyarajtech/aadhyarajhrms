import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { EmployeesApi, OrganizationApi } from "@/lib/endpoints";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/EmptyState";

interface OrgNodeData {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  designationTitle: string;
  departmentName: string;
  departmentColor: string;
  directReports: OrgNodeData[];
}

interface SkillDependencyGroup {
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
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface SkillDependencyResponse {
  scope: {
    departmentId: string | null;
    managerId: string | null;
  };
  employeeCount: number;
  skills: SkillDependencyGroup[];
  summary: string;
  recommendations: string[];
}

export default function OrgChart() {
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [showSkillAnalysis, setShowSkillAnalysis] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["org-chart"],
    queryFn: EmployeesApi.orgChart,
  });

  const searchResult = useQuery({
    queryKey: ["organization-ai-search", submittedSearch],
    queryFn: () => OrganizationApi.aiSearch(submittedSearch),
    enabled: submittedSearch.trim().length >= 2,
  });

  const skillAnalysis = useQuery({
    queryKey: ["organization-skill-dependencies", selectedManagerId],
    queryFn: () =>
      OrganizationApi.skillDependencies(
        selectedManagerId || undefined,
      ),
    enabled: showSkillAnalysis,
  });

  const roots = (data ?? []) as OrgNodeData[];

  const managerOptions = useMemo(() => {
    const managers = new Map<string, OrgNodeData>();

    const walk = (nodes: OrgNodeData[]) => {
      for (const node of nodes) {
        if ((node.directReports ?? []).length > 0) {
          managers.set(node.id, node);
        }
        walk(node.directReports ?? []);
      }
    };

    walk(roots);

    return Array.from(managers.values()).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(
        `${b.firstName} ${b.lastName}`,
      ),
    );
  }, [roots]);

  const highlightedIds = useMemo(() => {
    return new Set(
      (searchResult.data?.employees ?? []).map(
        (employee) => employee.id,
      ),
    );
  }, [searchResult.data]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = searchQuery.trim();

    if (query.length < 2) {
      return;
    }

    setSubmittedSearch(query);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSubmittedSearch("");
  };

  return (
    <div>
      <PageHeader
        title="Org Chart"
        subtitle="The full reporting structure of Aadhyaraj Technologies."
      />

      {/* AI Organization Intelligence */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="rounded-3xl border border-line/70 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Sparkles size={19} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-ink">
                Natural Language Org Search
              </h2>
              <p className="mt-1 text-xs text-ink-faint">
                Ask questions about people, reporting lines, departments,
                designations, or locations.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                placeholder='Try "Who reports to Nidhi?"'
                className="h-11 w-full rounded-2xl border border-line bg-white pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <button
              type="submit"
              disabled={
                searchQuery.trim().length < 2 ||
                searchResult.isFetching
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searchResult.isFetching ? (
                "Searching..."
              ) : (
                <>
                  <Search size={16} />
                  Search
                </>
              )}
            </button>

            {submittedSearch && (
              <button
                type="button"
                onClick={clearSearch}
                className="h-11 rounded-2xl border border-line px-4 text-sm font-medium text-ink-faint transition hover:border-line/90 hover:text-ink"
              >
                Clear
              </button>
            )}
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "Show everyone reporting to Nidhi",
              "Who is Simran's manager?",
              "Show Engineering employees",
              "Who reports indirectly to Nidhi?",
              "Who are managers with largest teams?",
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setSearchQuery(example);
                  setSubmittedSearch(example);
                }}
                className="rounded-full border border-line/70 bg-surface px-3 py-1.5 text-[11px] text-ink-faint transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                {example}
              </button>
            ))}
          </div>

          {submittedSearch && !searchResult.isFetching && (
            <div className="mt-4 rounded-2xl border border-line/70 bg-surface p-4">
              {searchResult.isError ? (
                <p className="text-sm text-ink-faint">
                  Unable to complete the organization search. Please try
                  again.
                </p>
              ) : searchResult.data ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {searchResult.data.total} matching employee
                        {searchResult.data.total === 1 ? "" : "s"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Matching nodes are highlighted in the org chart.
                      </p>
                    </div>

                    <span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700">
                      AI interpreted
                    </span>
                  </div>

                  {searchResult.data.total > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {searchResult.data.employees
                        .slice(0, 12)
                        .map((employee) => (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() =>
                              document
                                .getElementById(
                                  `org-node-${employee.id}`,
                                )
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                })
                            }
                            className="flex items-center gap-3 rounded-2xl border border-line/70 bg-white p-3 text-left transition hover:border-brand-200 hover:shadow-sm"
                          >
                            <Avatar
                              firstName={employee.firstName}
                              lastName={employee.lastName}
                              src={employee.avatarUrl}
                              size="sm"
                            />

                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-ink">
                                {employee.firstName}{" "}
                                {employee.lastName}
                              </span>
                              <span className="block truncate text-[11px] text-ink-faint">
                                {employee.designationTitle ??
                                  "Employee"}
                                {employee.departmentName
                                  ? ` · ${employee.departmentName}`
                                  : ""}
                              </span>
                            </span>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-faint">
                      No employees matched the interpreted organization
                      query.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-line/70 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Brain size={19} />
            </div>

            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">
                AI Skill Dependency Analysis
              </h2>
              <p className="mt-1 text-xs text-ink-faint">
                Detect skills concentrated in a small number of employees
                within the organization or a manager's hierarchy.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[11px] font-medium text-ink-faint">
              Analyze hierarchy
            </label>
            <select
              value={selectedManagerId}
              onChange={(event) =>
                setSelectedManagerId(event.target.value)
              }
              className="h-10 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Entire organization</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.firstName} {manager.lastName}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowSkillAnalysis(true)}
            disabled={skillAnalysis.isFetching}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldAlert size={15} />
            {skillAnalysis.isFetching
              ? "Analyzing..."
              : "Analyze Skill Dependencies"}
          </button>

          {showSkillAnalysis && (
            <div className="mt-4">
              {skillAnalysis.isError ? (
                <p className="rounded-2xl border border-line/70 bg-surface p-3 text-xs text-ink-faint">
                  Unable to load skill dependency analysis.
                </p>
              ) : skillAnalysis.data ? (
                <SkillDependencyPanel data={skillAnalysis.data} />
              ) : null}
            </div>
          )}
        </section>
      </div>

      <style>{`
        .org-chart-canvas {
          align-items: flex-start;
          min-height: 420px;
        }
        .org-chart-canvas button {
          text-decoration: none;
        }
        .org-chart-connector {
          background: #c7c7c7;
        }
      `}</style>

      <div className="rounded-3xl border border-line/70 bg-white p-4 sm:p-8">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-ink-faint">
            No organization data yet.
          </p>
        ) : (
          <div className="-mx-4 overflow-auto px-4 pb-8 sm:-mx-8 sm:px-8">
            <div className="org-chart-canvas flex min-w-max items-start gap-[120px] py-12 pl-4">
              {(data as OrgNodeData[]).map((root) => (
                <OrgNode
                  key={root.id}
                  node={root}
                  depth={0}
                  highlightedIds={highlightedIds}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillDependencyPanel({
  data,
}: {
  data: SkillDependencyResponse;
}) {
  const highRiskSkills = data.skills.filter(
    (skill) =>
      skill.riskLevel === "CRITICAL" ||
      skill.riskLevel === "HIGH",
  );

  return (
    <div className="rounded-2xl border border-line/70 bg-surface p-3">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-ink-faint" />
        <p className="text-xs font-semibold text-ink">
          {data.employeeCount} employees analyzed
        </p>
      </div>

      <p className="mt-2 text-xs leading-5 text-ink-faint">
        {data.summary}
      </p>

      {highRiskSkills.length > 0 && (
        <div className="mt-3 space-y-2">
          {highRiskSkills.slice(0, 5).map((skill) => (
            <div
              key={`${skill.skill}-${skill.category ?? ""}`}
              className="rounded-xl border border-line/70 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink">
                  {skill.skill}
                </p>
                <RiskBadge risk={skill.riskLevel} />
              </div>

              <p className="mt-1 text-[11px] text-ink-faint">
                {skill.advancedOrExpertCount} advanced/expert out of{" "}
                {skill.employeeCount} employees ·{" "}
                {Math.round(skill.dependencyRatio * 100)}% concentration
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {skill.employees.map((employee) => (
                  <span
                    key={employee.id}
                    className="rounded-full bg-surface px-2 py-1 text-[10px] text-ink-faint"
                  >
                    {employee.name} · {employee.competencyLevel}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.recommendations.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-ink">
            AI recommendations
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {data.recommendations.slice(0, 4).map((recommendation) => (
              <li
                key={recommendation}
                className="flex gap-2 text-[11px] leading-4 text-ink-faint"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                {recommendation}
              </li>
            ))}
          </ul>
        </div>
      )}

      {highRiskSkills.length === 0 && (
        <p className="mt-3 text-[11px] text-ink-faint">
          No high or critical skill concentration risks were detected.
        </p>
      )}
    </div>
  );
}

function RiskBadge({
  risk,
}: {
  risk: SkillDependencyGroup["riskLevel"];
}) {
  const classes = {
    CRITICAL: "bg-red-50 text-red-700",
    HIGH: "bg-orange-50 text-orange-700",
    MEDIUM: "bg-amber-50 text-amber-700",
    LOW: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${classes[risk]}`}
    >
      {risk}
    </span>
  );
}

function OrgNode({
  node,
  depth,
  highlightedIds,
}: {
  node: OrgNodeData;
  depth: number;
  highlightedIds: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const children = node.directReports ?? [];
  const hasChildren = children.length > 0;

  const isHighlighted = highlightedIds.has(node.id);

  const hasHighlightedDescendant = useMemo(
    () =>
      children.some(
        (child) =>
          highlightedIds.has(child.id) ||
          hasHighlightedNode(child, highlightedIds),
      ),
    [children, highlightedIds],
  );

  const shouldEmphasize = isHighlighted || hasHighlightedDescendant;

  /*
   * Reference layout:
   *
   *   Parent ●────────┬────● Child
   *                   ├────● Child
   *                   └────● Child
   *
   * Each hierarchy level is horizontal. Children are stacked vertically
   * around their own centre, with one vertical spine connecting them.
   */
  return (
    <div
      id={`org-node-${node.id}`}
      className="relative flex min-w-max items-center"
    >
      <OrgNodeCard
        node={node}
        depth={depth}
        highlighted={isHighlighted}
        emphasized={shouldEmphasize}
      />

      {hasChildren && open && (
        <div className="relative ml-[92px] flex min-w-max flex-col gap-0">
          {/* Parent -> children spine connector */}
          <div
            aria-hidden="true"
            className="org-chart-connector pointer-events-none absolute left-0 top-1/2 z-0 h-px w-[92px] -translate-x-[92px]"
          />

              {children.map((child, index) => (
            <div
              key={child.id}
              className="relative flex min-w-max items-center"
            >
              {children.length > 1 && (
                <div
                  aria-hidden="true"
                  className={`org-chart-connector pointer-events-none absolute left-0 z-0 w-px ${
                    index === 0
                      ? "top-1/2 bottom-0"
                      : index === children.length - 1
                        ? "top-0 bottom-1/2"
                        : "inset-y-0"
                  }`}
                />
              )}

              {/* Spine -> child connector */}
              <div
                aria-hidden="true"
                className="org-chart-connector pointer-events-none absolute left-0 top-1/2 z-0 h-px w-12"
              />

              <div className="relative z-10 ml-12">
                <OrgNode
                  node={child}
                  depth={depth + 1}
                  highlightedIds={highlightedIds}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {hasChildren && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse team" : "Expand team"}
          className="absolute -bottom-5 left-1/2 z-20 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-white text-ink-faint shadow-sm transition hover:border-brand-300 hover:text-brand-600"
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      )}
    </div>
  );
}

function hasHighlightedNode(
  node: OrgNodeData,
  highlightedIds: Set<string>,
): boolean {
  if (highlightedIds.has(node.id)) {
    return true;
  }

  return (node.directReports ?? []).some((child) =>
    hasHighlightedNode(child, highlightedIds),
  );
}

function OrgNodeCard({
  node,
  depth,
  highlighted,
  emphasized,
}: {
  node: OrgNodeData;
  depth: number;
  highlighted: boolean;
  emphasized: boolean;
}) {
  const navigate = useNavigate();
  const isRoot = depth === 0;

  return (
    <button
      type="button"
      onClick={() => navigate(`/app/employees/${node.id}`)}
      aria-label={`Open ${node.firstName} ${node.lastName}'s employee profile`}
      title={`${node.firstName} ${node.lastName}${node.designationTitle ? ` · ${node.designationTitle}` : ""}`}
      className={`group relative z-10 flex w-[190px] shrink-0 items-center gap-4 border-0 bg-transparent py-1 text-left transition ${
        highlighted
          ? "rounded-xl bg-brand-50/70 px-2 ring-2 ring-brand-200"
          : emphasized
            ? "rounded-xl bg-brand-50/30 px-2"
            : "rounded-xl px-2 hover:bg-surface"
      }`}
    >
      {/* Solid circular employee marker, matching the reference image. */}
      <span
        className="relative z-10 block h-6 w-6 shrink-0 rounded-full bg-[#444444]"
        aria-hidden="true"
      />

      <span className="min-w-0">
        <p
          className={`leading-[1.15] text-ink ${
            isRoot
              ? "text-[15px] font-medium"
              : "text-[15px] font-medium"
          }`}
        >
          {node.firstName}
          {node.lastName ? (
            <>
              <br />
              {node.lastName}
            </>
          ) : null}
        </p>
      </span>

      {highlighted && (
        <span className="ml-auto shrink-0 rounded-full bg-brand-600 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
          Match
        </span>
      )}
    </button>
  );
}

