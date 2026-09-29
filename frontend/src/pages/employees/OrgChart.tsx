import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { ChevronDown, ChevronRight, MessageSquare, X, Bot, Shield, Users, UserCheck, Search, HelpCircle, ArrowRight, Building, RotateCcw, CheckCircle2, Layers, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { EmployeesApi } from "@/lib/endpoints";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/EmptyState";

interface OrgNodeData {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  designationTitle: string;
  departmentName: string;
  departmentColor: string;
  managerId?: string | null;
  directReports: OrgNodeData[];
}

interface QuickQuery {
  id: string;
  category: "Employee Directory" | "HR & Leadership" | "Manager Roster" | "Department Breakdown" | "Auditing & Analytics";
  question: string;
  renderResponse: (tree: OrgNodeData[]) => React.ReactNode;
}

const ADMIN_QUICK_QUERIES: QuickQuery[] = [
  {
    id: "q-1",
    category: "HR & Leadership",
    question: "List all HR Admins & System Leadership with access roles",
    renderResponse: (tree) => {
      const allEmps = flattenTree(tree);
      const hrAdmins = allEmps.filter(
        (e) =>
          e.departmentName?.toLowerCase().includes("hr") ||
          e.designationTitle?.toLowerCase().includes("admin") ||
          e.designationTitle?.toLowerCase().includes("hr") ||
          e.designationTitle?.toLowerCase().includes("director") ||
          e.designationTitle?.toLowerCase().includes("ceo")
      );

      return (
        <div className="space-y-2">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <Shield size={13} className="text-purple-600" />
            HR Admin & System Leadership Roster ({hrAdmins.length})
          </p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white text-[11px]">
            {hrAdmins.map((emp) => (
              <div key={emp.id} className="p-2 flex items-center justify-between hover:bg-purple-50/40">
                <div>
                  <p className="font-medium text-gray-900">{fullName(emp)}</p>
                  <p className="text-gray-500">{emp.designationTitle} · <span className="text-purple-700 font-medium">{emp.departmentName || "HR"}</span></p>
                </div>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-medium text-[10px]">
                  <CheckCircle2 size={10} /> Active Admin
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  },
  {
    id: "q-2",
    category: "Employee Directory",
    question: "Show complete active employee directory list",
    renderResponse: (tree) => {
      const allEmps = flattenTree(tree);

      return (
        <div className="space-y-2">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <Users size={13} className="text-purple-600" />
            Complete Active Employee List ({allEmps.length} Total)
          </p>
          <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white text-[11px]">
            {allEmps.map((emp) => (
              <div key={emp.id} className="p-2 flex items-center justify-between hover:bg-gray-50">
                <div className="truncate pr-2">
                  <p className="font-medium text-gray-900 truncate">{fullName(emp)}</p>
                  <p className="text-gray-500 truncate">{emp.designationTitle || "Team Member"}</p>
                </div>
                <span className="shrink-0 text-gray-500 text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">
                  {emp.departmentName || "General"}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  },
  {
    id: "q-3",
    category: "Manager Roster",
    question: "List all Reporting Managers and direct report counts",
    renderResponse: (tree) => {
      const allEmps = flattenTree(tree);
      const managers = allEmps.filter((e) => e.directReports && e.directReports.length > 0);

      return (
        <div className="space-y-2">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <UserCheck size={13} className="text-purple-600" />
            Reporting Managers Overview ({managers.length} Heads)
          </p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white text-[11px]">
            {managers.map((m) => (
              <div key={m.id} className="p-2 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{fullName(m)}</p>
                  <p className="text-gray-500">{m.designationTitle}</p>
                </div>
                <span className="inline-block px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold text-[10px]">
                  {m.directReports.length} Direct Reports
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  },
  {
    id: "q-4",
    category: "Department Breakdown",
    question: "Show headcount & employee list grouped by Department",
    renderResponse: (tree) => {
      const allEmps = flattenTree(tree);
      const depts = new Map<string, OrgNodeData[]>();

      allEmps.forEach((emp) => {
        const dName = emp.departmentName || "General";
        if (!depts.has(dName)) depts.set(dName, []);
        depts.get(dName)!.push(emp);
      });

      return (
        <div className="space-y-2">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <Building size={13} className="text-purple-600" />
            Department Breakdown ({depts.size} Departments)
          </p>
          <div className="space-y-1.5 text-[11px]">
            {Array.from(depts.entries()).map(([deptName, members]) => (
              <div key={deptName} className="border border-gray-200 rounded-lg bg-white p-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-purple-900">{deptName}</span>
                  <span className="text-[10px] font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                    {members.length} Members
                  </span>
                </div>
                <p className="text-gray-500 text-[10px] truncate">
                  {members.map((m) => fullName(m)).join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      );
    }
  },
  {
    id: "q-5",
    category: "Auditing & Analytics",
    question: "Identify unassigned or orphaned profiles without a Manager",
    renderResponse: (tree) => {
      const allEmps = flattenTree(tree);
      const rootId = tree[0]?.id;
      const unassigned = allEmps.filter((e) => !e.managerId && e.id !== rootId);

      return (
        <div className="space-y-2">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <Shield size={13} className="text-amber-600" />
            Unassigned / Independent Profiles ({unassigned.length})
          </p>
          {unassigned.length === 0 ? (
            <div className="p-2.5 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg text-[11px]">
              ✓ All employees have valid reporting managers assigned in the tree hierarchy.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white text-[11px]">
              {unassigned.map((emp) => (
                <div key={emp.id} className="p-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{fullName(emp)}</p>
                    <p className="text-gray-500">{emp.designationTitle}</p>
                  </div>
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                    Action Required
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  },
  {
    id: "q-6",
    category: "Auditing & Analytics",
    question: "Show Span of Control summary (Min, Max, Avg reports per manager)",
    renderResponse: (tree) => {
      const allEmps = flattenTree(tree);
      const managers = allEmps.filter((e) => e.directReports && e.directReports.length > 0);

      if (managers.length === 0) {
        return <div className="p-2 text-xs text-gray-500">No manager records found.</div>;
      }

      const counts = managers.map((m) => m.directReports.length);
      const maxCount = Math.max(...counts);
      const minCount = Math.min(...counts);
      const avgCount = (counts.reduce((a, b) => a + b, 0) / managers.length).toFixed(1);

      return (
        <div className="space-y-2 text-[11px]">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <Layers size={13} className="text-purple-600" />
            Manager Span of Control Analytics
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-purple-50 border border-purple-100">
              <p className="text-[10px] text-purple-700">Max Reports</p>
              <p className="text-sm font-bold text-purple-900">{maxCount}</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-[10px] text-blue-700">Avg / Manager</p>
              <p className="text-sm font-bold text-blue-900">{avgCount}</p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] text-emerald-700">Min Reports</p>
              <p className="text-sm font-bold text-emerald-900">{minCount}</p>
            </div>
          </div>
        </div>
      );
    }
  },
  {
    id: "q-7",
    category: "HR & Leadership",
    question: "List Executive Direct Reports (Who reports to C-Level / Founder)",
    renderResponse: (tree) => {
      const rootNode = tree[0];
      if (!rootNode) return <div className="p-2 text-xs text-gray-500">No executive root node found.</div>;

      return (
        <div className="space-y-2 text-[11px]">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <Shield size={13} className="text-purple-600" />
            Direct Reports to Executive ({fullName(rootNode)})
          </p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
            {rootNode.directReports.map((emp) => (
              <div key={emp.id} className="p-2 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{fullName(emp)}</p>
                  <p className="text-gray-500">{emp.designationTitle}</p>
                </div>
                <span className="text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                  {emp.departmentName || "Leadership"}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  },
  {
    id: "q-8",
    category: "Manager Roster",
    question: "Find single-report managers (Managers with only 1 report)",
    renderResponse: (tree) => {
      const allEmps = flattenTree(tree);
      const singleManagers = allEmps.filter((e) => e.directReports && e.directReports.length === 1);

      return (
        <div className="space-y-2 text-[11px]">
          <p className="font-semibold text-gray-800 text-xs flex items-center gap-1.5">
            <UserCheck size={13} className="text-amber-600" />
            Single-Report Managers ({singleManagers.length})
          </p>
          {singleManagers.length === 0 ? (
            <div className="p-2 border border-gray-200 bg-gray-50 rounded text-gray-600">
              No managers with only 1 direct report found.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
              {singleManagers.map((m) => (
                <div key={m.id} className="p-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{fullName(m)}</p>
                    <p className="text-gray-500">{m.designationTitle}</p>
                  </div>
                  <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                    1 Direct Report ({fullName(m.directReports[0])})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  }
];

function flattenTree(nodes: OrgNodeData[]): OrgNodeData[] {
  const result: OrgNodeData[] = [];
  const visited = new Set<string>();

  function traverse(list: OrgNodeData[]) {
    for (const node of list) {
      if (!visited.has(node.id)) {
        visited.add(node.id);
        result.push(node);
        if (node.directReports && node.directReports.length > 0) {
          traverse(node.directReports);
        }
      }
    }
  }

  traverse(nodes);
  return result;
}

function getMaxDepth(nodes: OrgNodeData[]): number {
  if (!nodes || nodes.length === 0) return 0;
  let max = 0;
  for (const node of nodes) {
    const childDepth = getMaxDepth(node.directReports);
    if (childDepth > max) max = childDepth;
  }
  return max + 1;
}

interface ChatMessage {
  id: string;
  isAi: boolean;
  timestamp: string;
  content: React.ReactNode;
}

export default function OrgChart() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["org-chart"],
    queryFn: EmployeesApi.orgChart,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const roots = useMemo(() => normalizeOrgData(data), [data]);
  const allEmployees = useMemo(() => flattenTree(roots), [roots]);

  /* ---------------- Global Expand / Collapse All State ---------------- */
  const [globalExpand, setGlobalExpand] = useState(true);

  /* ---------------- Tree Search & Highlighting State ---------------- */
  const [treeSearch, setTreeSearch] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  /* ---------------- Employee Quick-View Side Drawer ---------------- */
  const [quickViewEmp, setQuickViewEmp] = useState<OrgNodeData | null>(null);

  /* ---------------- Chatbot Drawer State ---------------- */
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const initialGreeting: ChatMessage = {
    id: "init-1",
    isAi: true,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    content: (
      <p>
        Hello! Click any query below to pull real-time data reports directly from the organization chart.
      </p>
    ),
  };

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([initialGreeting]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatOpen]);

  const handleResetChat = () => {
    setChatMessages([
      {
        ...initialGreeting,
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
    ]);
  };

  const categories = ["All", "Employee Directory", "HR & Leadership", "Manager Roster", "Department Breakdown", "Auditing & Analytics"];

  const filteredQueries = useMemo(() => {
    return ADMIN_QUICK_QUERIES.filter((q) => {
      const matchesCat = selectedCategory === "All" || q.category === selectedCategory;
      const matchesSearch = q.question.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const handleSelectQuery = (q: QuickQuery) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      isAi: false,
      timestamp: timeStr,
      content: <p className="font-medium">{q.question}</p>,
    };

    const aiReply: ChatMessage = {
      id: (Date.now() + 1).toString(),
      isAi: true,
      timestamp: timeStr,
      content: q.renderResponse(roots),
    };

    setChatMessages((prev) => [...prev, userMsg, aiReply]);
  };

  const matchingTreeEmps = useMemo(() => {
    if (!treeSearch.trim()) return [];
    return allEmployees.filter((e) =>
      fullName(e).toLowerCase().includes(treeSearch.toLowerCase()) ||
      e.designationTitle?.toLowerCase().includes(treeSearch.toLowerCase())
    ).slice(0, 5);
  }, [treeSearch, allEmployees]);

  const handleFocusEmployee = (emp: OrgNodeData) => {
    setSelectedEmpId(emp.id);
    setQuickViewEmp(emp);
    setTreeSearch("");
    const element = document.getElementById(`org-node-${emp.id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  };

  const handleNodeClick = (emp: OrgNodeData) => {
    setQuickViewEmp(emp);
    setSelectedEmpId(emp.id);
  };

  // Executive Stats Summary
  const totalHeadcount = allEmployees.length;
  const totalManagers = allEmployees.filter((e) => e.directReports && e.directReports.length > 0).length;
  const maxDepth = useMemo(() => getMaxDepth(roots), [roots]);

  return (
    <div className="min-h-screen bg-[#f7f7f6]">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <div className="overflow-hidden rounded-[6px] border border-[#e8e6e3] bg-white shadow-2xs">

          {/* Executive Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#eeecea] px-4 py-3 sm:px-6">
            <div>
              <h1 className="text-base font-semibold text-ink sm:text-lg">
                Organization Chart
              </h1>
              <p className="mt-0.5 text-xs text-ink-faint">
                Reporting relationships are based on employee manager assignments.
              </p>
            </div>

            {/* Logical Stats Counter for Executive Leadership */}
            <div className="hidden lg:flex items-center gap-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
              <div>
                <span className="text-gray-400 text-[10px] block">Headcount</span>
                <span className="font-semibold text-gray-800">{totalHeadcount}</span>
              </div>
              <div className="h-5 w-px bg-gray-200" />
              <div>
                <span className="text-gray-400 text-[10px] block">Managers</span>
                <span className="font-semibold text-gray-800">{totalManagers}</span>
              </div>
              <div className="h-5 w-px bg-gray-200" />
              <div>
                <span className="text-gray-400 text-[10px] block">Levels Depth</span>
                <span className="font-semibold text-gray-800">{maxDepth}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Expand/Collapse Master Toggle */}
              <button
                type="button"
                onClick={() => setGlobalExpand(!globalExpand)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e0ddd8] bg-[#fcfbf9] px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                title={globalExpand ? "Collapse all tree branches" : "Expand all tree branches"}
              >
                {globalExpand ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                <span>{globalExpand ? "Collapse All" : "Expand All"}</span>
              </button>

              {/* Employee Quick Search */}
              <div className="relative">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Find employee in tree..."
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    className="w-44 sm:w-56 rounded-lg border border-[#e0ddd8] bg-[#fcfbf9] pl-8 pr-3 py-1.5 text-xs text-gray-800 focus:border-purple-500 focus:bg-white focus:outline-none"
                  />
                </div>

                {matchingTreeEmps.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-60 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden text-xs">
                    {matchingTreeEmps.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => handleFocusEmployee(emp)}
                        className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-gray-100 last:border-none cursor-pointer flex flex-col"
                      >
                        <span className="font-medium text-gray-900">{fullName(emp)}</span>
                        <span className="text-[10px] text-gray-500">{emp.designationTitle}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Chatbot Launcher */}
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#252525] px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-[#3a3a3a] transition-all cursor-pointer shrink-0"
              >
                <MessageSquare size={14} className="text-purple-300" />
                <span>Chatbot</span>
              </button>
            </div>
          </div>

          {/* Org Tree Canvas Area */}
          <div className="org-chart-scroll">
            <div className="org-chart-canvas">
              {isLoading ? (
                <div className="grid min-w-full place-items-center py-24">
                  <div className="w-full max-w-3xl space-y-3 px-6">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 rounded-xl" />
                    ))}
                  </div>
                </div>
              ) : isError ? (
                <div className="grid min-h-[420px] place-items-center p-8 text-center">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      Unable to load organization chart.
                    </p>
                    <button
                      type="button"
                      onClick={() => void refetch()}
                      className="mt-3 rounded-lg border border-[#ddd9d4] px-3 py-2 text-xs font-medium text-ink transition hover:bg-[#f7f6f4]"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              ) : !roots.length ? (
                <div className="grid min-h-[420px] place-items-center p-8 text-sm text-ink-faint">
                  No organization data yet.
                </div>
              ) : (
                <FittedOrgTree
                  roots={roots}
                  selectedEmpId={selectedEmpId}
                  onNodeClick={handleNodeClick}
                  globalExpand={globalExpand}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Employee Quick-View Side Drawer (Does not navigate away, offers full jump) */}
      {quickViewEmp && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-80 sm:w-96 flex-col bg-white shadow-2xl border-l border-[#e8e6e3] animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-[#eeecea] p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Employee Quick-View</h3>
            <button
              type="button"
              onClick={() => setQuickViewEmp(null)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            {/* Header info */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-purple-600 text-white flex items-center justify-center text-base font-bold uppercase">
                {quickViewEmp.firstName[0]}
                {quickViewEmp.lastName[0]}
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">{fullName(quickViewEmp)}</h4>
                <p className="text-gray-500">{quickViewEmp.designationTitle || "Team Member"}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium text-[10px]">
                  {quickViewEmp.departmentName || "General"}
                </span>
              </div>
            </div>

            {/* Direct Details */}
            <div className="space-y-3 border-t border-b border-gray-100 py-4 text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-400">Employee ID:</span>
                <span className="font-medium text-gray-900">{quickViewEmp.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Direct Reports:</span>
                <span className="font-semibold text-purple-700">{quickViewEmp.directReports?.length || 0} Members</span>
              </div>
            </div>

            {/* Direct Reports Roster */}
            {quickViewEmp.directReports && quickViewEmp.directReports.length > 0 && (
              <div>
                <p className="font-semibold text-gray-800 mb-2">Direct Reports:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {quickViewEmp.directReports.map((report) => (
                    <div
                      key={report.id}
                      onClick={() => handleNodeClick(report)}
                      className="p-2 border border-gray-100 rounded-lg hover:bg-purple-50 cursor-pointer flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{fullName(report)}</p>
                        <p className="text-[10px] text-gray-500">{report.designationTitle}</p>
                      </div>
                      <ChevronRight size={12} className="text-gray-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Jump to Full Employee Profile Page - Elevated above floating Copilot */}
<div className="p-4 pb-20 border-t border-gray-200 bg-gray-50">
  <button
    type="button"
    onClick={() => navigate(`/app/employees/${quickViewEmp.id}`)}
    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition cursor-pointer"
  >
    <span>View Full Employee Profile</span>
    <ExternalLink size={13} />
  </button>
</div>
        </div>
      )}

      {/* Chatbot Drawer */}
      {isChatOpen && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl border-l border-[#e8e6e3] animate-in slide-in-from-right duration-200">
          {/* Header Renamed to "Chatbot" */}
          <div className="flex items-center justify-between border-b border-[#eeecea] bg-[#1a1a1a] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white">
                <Bot size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white leading-tight">
                  Chatbot
                </h3>
                <p className="text-[11px] text-gray-400">
                  Instant HR & Org Data Assistant
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetChat}
                title="Reset Conversation"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-300 hover:bg-[#2e2e2e] hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-[#2e2e2e] hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Chat Stream */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#fbfbfa] border-b border-[#eeecea]">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.isAi ? "items-start" : "items-end"}`}
              >
                <div
                  className={`w-full max-w-[95%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.isAi
                      ? "bg-white border border-[#e8e6e3] text-gray-800 shadow-xs"
                      : "bg-purple-600 text-white font-medium"
                  }`}
                >
                  {msg.content}
                </div>
                <span className="mt-1 px-1 text-[9px] text-gray-400">
                  {msg.timestamp}
                </span>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Expanded Questions Selector */}
          <div className="h-80 flex flex-col border-t border-[#eeecea] bg-[#faf9f8]">
            <div className="p-3 border-b border-[#eeecea] bg-white space-y-2">
              <p className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
                <HelpCircle size={13} className="text-purple-600" />
                Select an admin question to view data:
              </p>

              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter admin queries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#e0ddd8] bg-[#fcfbf9] pl-8 pr-3 py-1.5 text-xs text-gray-800 focus:border-purple-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-medium transition cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {filteredQueries.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">
                  No matching queries found.
                </div>
              ) : (
                filteredQueries.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleSelectQuery(q)}
                    className="w-full text-left p-2 rounded-lg border border-[#e8e6e3] bg-white hover:border-purple-300 hover:bg-purple-50/50 transition group flex items-center justify-between gap-2 shadow-2xs cursor-pointer"
                  >
                    <div>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-50 text-purple-700 mb-0.5">
                        {q.category}
                      </span>
                      <p className="text-xs font-medium text-gray-800 group-hover:text-purple-900">
                        {q.question}
                      </p>
                    </div>
                    <ArrowRight size={14} className="text-gray-300 group-hover:text-purple-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Frozen CSS Tree Structure */}
      <style>{`
        .org-chart-viewport {
          position: relative;
          width: 100%;
          height: clamp(560px, calc(100dvh - 170px), 900px);
          overflow: auto;
          background: #fff;
        }

        .org-chart-fit-stage {
          position: absolute;
          left: 0;
          top: 0;
          display: inline-block;
          transform-origin: top left;
          will-change: transform, left, top;
        }

        .org-tree-root {
          display: flex;
          align-items: center;
          width: max-content;
          min-height: 460px;
          padding: 58px 72px 72px 50px;
          box-sizing: border-box;
        }

        .org-tree-node { position: relative; display: flex; align-items: center; flex: 0 0 auto; }
        .org-node {
          position: relative; z-index: 2; display: inline-flex; align-items: center; gap: 14px;
          width: 164px; min-width: 164px; min-height: 38px; padding: 2px 4px; border: 0;
          background: #fff; color: #252525; text-align: left; cursor: pointer; font: inherit;
          border-radius: 6px; transition: all 0.2s ease;
        }
        .org-node.selected-highlight {
          outline: 2px solid #9333ea;
          background: #f3e8ff;
        }
        .org-node:hover .org-name { color: #111827; }
        .org-node:focus-visible { outline: 2px solid #9ca3af; outline-offset: 4px; }
        .org-dot { width: 20px; height: 20px; min-width: 20px; border-radius: 9999px; background: #3a3a3a; }
        .org-name { display: block; min-width: 0; overflow-wrap: anywhere; font-size: 13px; line-height: 15px; font-weight: 500; }
        .org-children {
          position: relative; display: flex; flex-direction: column; justify-content: center; gap: 0;
          width: max-content; margin-left: 118px; padding: 8px 0;
        }
        .org-children::before { content: ""; position: absolute; left: -118px; top: 50%; width: 118px; height: 1px; background: #d8d6d2; }
        .org-children.has-multiple::after { content: ""; position: absolute; left: 0; top: 29px; bottom: 29px; width: 1px; background: #d8d6d2; }
        .org-child { position: relative; display: flex; align-items: center; min-height: 42px; }
        .org-child::before { content: ""; position: absolute; left: 0; top: 50%; width: 92px; height: 1px; background: #d8d6d2; }
        .org-child > .org-tree-node { margin-left: 92px; }
        .org-children:not(.has-multiple)::after { display: none; }
        .org-collapse {
          position: absolute; z-index: 5; left: 146px; top: 50%; display: flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; padding: 0; border: 1px solid #e8e6e3; border-radius: 9999px;
          background: #fff; color: #aaa59f; cursor: pointer; transform: translateY(-50%);
        }
        .org-collapse:hover { color: #66615b; border-color: #d2cec8; }

        @media (max-width: 900px) {
          .org-chart-viewport { height: clamp(560px, calc(100dvh - 155px), 760px); }
          .org-tree-root { padding: 42px 42px 52px 28px; }
        }

        @media (max-width: 640px) {
          .org-chart-viewport { height: calc(100dvh - 155px); min-height: 520px; }
          .org-tree-root { min-height: 0; padding: 24px 24px 28px 16px; }
          .org-node { width: 104px; min-width: 104px; gap: 7px; min-height: 30px; }
          .org-dot { width: 13px; height: 13px; min-width: 13px; }
          .org-name { font-size: 10px; line-height: 11px; }
          .org-children { margin-left: 30px; padding: 4px 0; }
          .org-children::before { left: -30px; width: 30px; }
          .org-children.has-multiple::after { top: 17px; bottom: 17px; }
          .org-child { min-height: 27px; }
          .org-child::before { width: 25px; }
          .org-child > .org-tree-node { margin-left: 25px; }
          .org-collapse { left: 90px; width: 13px; height: 13px; }
        }
      `}</style>
    </div>
  );
}

function FittedOrgTree({ roots, selectedEmpId, onNodeClick, globalExpand }: { roots: OrgNodeData[]; selectedEmpId: string | null; onNodeClick: (emp: OrgNodeData) => void; globalExpand: boolean }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState({ scale: 1, left: 0, top: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;

    const fit = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const sw = stage.scrollWidth;
      const sh = stage.scrollHeight;
      if (!vw || !vh || !sw || !sh) return;

      const scale = Math.min(1, vw / sw, vh / sh);
      const scaledW = sw * scale;
      const scaledH = sh * scale;
      setTransform({
        scale,
        left: Math.max(0, (vw - scaledW) / 2),
        top: Math.max(0, (vh - scaledH) / 2),
      });
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    observer.observe(stage);
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
  }, [roots]);

  return (
    <div ref={viewportRef} className="org-chart-viewport">
      <div
        ref={stageRef}
        className="org-chart-fit-stage"
        style={{ transform: `translate(${transform.left}px, ${transform.top}px) scale(${transform.scale})` }}
      >
        <OrgTree roots={roots} selectedEmpId={selectedEmpId} onNodeClick={onNodeClick} globalExpand={globalExpand} />
      </div>
    </div>
  );
}

function OrgTree({ roots, selectedEmpId, onNodeClick, globalExpand }: { roots: OrgNodeData[]; selectedEmpId: string | null; onNodeClick: (emp: OrgNodeData) => void; globalExpand: boolean }) {
  return (
    <div className="org-tree-root">
      {roots.map((node) => (
        <TreeNode key={node.id} node={node} selectedEmpId={selectedEmpId} onNodeClick={onNodeClick} globalExpand={globalExpand} />
      ))}
    </div>
  );
}

function TreeNode({ node, selectedEmpId, onNodeClick, globalExpand }: { node: OrgNodeData; selectedEmpId: string | null; onNodeClick: (emp: OrgNodeData) => void; globalExpand: boolean }) {
  const [open, setOpen] = useState(globalExpand);

  useEffect(() => {
    setOpen(globalExpand);
  }, [globalExpand]);

  const children = Array.isArray(node.directReports) ? node.directReports : [];
  const isSelected = selectedEmpId === node.id;

  return (
    <div className="org-tree-node">
      <button
        id={`org-node-${node.id}`}
        type="button"
        className={`org-node ${isSelected ? "selected-highlight" : ""}`}
        onClick={() => onNodeClick(node)}
        title={`${fullName(node)}${node.designationTitle ? ` · ${node.designationTitle}` : ""}`}
      >
        <span className="org-dot" aria-hidden="true" />
        <span className="org-name">
          {node.firstName}
          <br />
          {node.lastName}
        </span>
      </button>

      {children.length > 0 && (
        <button
          type="button"
          className="org-collapse"
          aria-label={open ? `Collapse ${fullName(node)} team` : `Expand ${fullName(node)} team`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      )}

      {open && children.length > 0 && (
        <div className={`org-children ${children.length > 1 ? "has-multiple" : ""}`}>
          {children.map((child) => (
            <div className="org-child" key={child.id}>
              <TreeNode node={child} selectedEmpId={selectedEmpId} onNodeClick={onNodeClick} globalExpand={globalExpand} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeOrgData(data: unknown): OrgNodeData[] {
  if (!Array.isArray(data)) return [];

  const byId = new Map<string, OrgNodeData>();
  const parentById = new Map<string, string>();
  const sourceChildren = new Map<string, string[]>();

  const walk = (nodes: unknown[], parentId?: string) => {
    for (const item of nodes) {
      if (!isOrgNode(item)) continue;

      const existing = byId.get(item.id);

      if (!existing) {
        const normalized: OrgNodeData = {
          ...item,
          managerId:
            typeof (item as Partial<OrgNodeData>).managerId === "string"
              ? (item as Partial<OrgNodeData>).managerId
              : null,
          directReports: [],
        };

        byId.set(item.id, normalized);

        if (parentId && item.id !== parentId) {
          parentById.set(item.id, parentId);
        }
      }

      if (Array.isArray(item.directReports)) {
        const childIds = sourceChildren.get(item.id) ?? [];

        for (const child of item.directReports) {
          if (!isOrgNode(child) || child.id === item.id) continue;

          if (!childIds.includes(child.id)) {
            childIds.push(child.id);
          }

          if (!parentById.has(child.id)) {
            parentById.set(child.id, item.id);
          }
        }

        sourceChildren.set(item.id, childIds);
        walk(item.directReports, item.id);
      }
    }
  };

  walk(data);

  for (const node of byId.values()) {
    node.directReports = [];
  }

  for (const [childId, parentId] of parentById) {
    const parent = byId.get(parentId);
    const child = byId.get(childId);

    if (!parent || !child || parent.id === child.id) continue;

    if (!parent.directReports.some((report) => report.id === child.id)) {
      parent.directReports.push(child);
    }
  }

  const managerIds = new Map<string, string>();

  for (const node of byId.values()) {
    if (node.managerId && node.managerId !== node.id && byId.has(node.managerId)) {
      managerIds.set(node.id, node.managerId);
    }
  }

  if (managerIds.size > 0) {
    for (const node of byId.values()) {
      node.directReports = [];
    }

    for (const [childId, managerId] of managerIds) {
      const manager = byId.get(managerId);
      const child = byId.get(childId);

      if (!manager || !child || manager.id === child.id) continue;

      if (!manager.directReports.some((report) => report.id === child.id)) {
        manager.directReports.push(child);
      }
    }
  }

  const assignedIds = new Set<string>();

  for (const node of byId.values()) {
    for (const child of node.directReports) {
      assignedIds.add(child.id);
    }
  }

  const roots = [...byId.values()].filter((node) => !assignedIds.has(node.id));

  const adithya = roots.find((node) => fullName(node).toLowerCase() === "adithya nuthakki");

  return adithya ? [adithya] : roots;
}

function isOrgNode(value: unknown): value is OrgNodeData {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<OrgNodeData>;
  return (
    typeof node.id === "string" &&
    typeof node.firstName === "string" &&
    typeof node.lastName === "string"
  );
}

function fullName(node: OrgNodeData) {
  return `${node.firstName} ${node.lastName}`.trim();
}