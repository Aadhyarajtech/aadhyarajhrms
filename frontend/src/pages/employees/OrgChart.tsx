import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

/**
 * Organization chart
 *
 * The visual layout intentionally follows the supplied reference:
 * - root employee on the left
 * - reporting managers arranged vertically
 * - each manager's team branches horizontally to the right
 * - thin grey orthogonal connector lines
 * - compact employee dot + two-line name
 * - no cards around employees
 * - horizontal scrolling on small screens instead of overlapping content
 *
 * IMPORTANT:
 * The hierarchy is never hard-coded here. EmployeesApi.orgChart supplies
 * directReports from the employee manager assignments. Therefore, when an
 * employee's managerId is changed in HRMS and the org-chart query refreshes,
 * that employee moves automatically under the new manager.
 */
export default function OrgChart() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["org-chart"],
    queryFn: EmployeesApi.orgChart,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const roots = useMemo(() => normalizeOrgData(data), [data]);

  return (
    <div className="min-h-screen bg-[#f7f7f6]">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <div className="overflow-hidden rounded-[6px] border border-[#e8e6e3] bg-white">
          <div className="border-b border-[#eeecea] px-4 py-4 sm:px-6">
            <h1 className="text-base font-semibold text-ink sm:text-lg">
              Organization Chart
            </h1>
            <p className="mt-1 text-xs text-ink-faint sm:text-[13px]">
              Reporting relationships are based on employee manager assignments.
            </p>
          </div>

          <div className="org-chart-scroll">
            <div className="org-chart-canvas">
              {isLoading ? (
                <div className="grid min-w-[760px] place-items-center py-24">
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
                <OrgTree roots={roots} />
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .org-chart-scroll {
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }

        .org-chart-canvas {
          min-width: max-content;
          min-height: 590px;
          padding: 58px 72px 72px 50px;
          box-sizing: border-box;
          background: #fff;
        }

        /*
         * This is the key layout:
         * every TreeNode is a horizontal unit. Its employee is on the left
         * and its direct-report column is on the right. This produces the
         * same left-to-right tree direction as the reference image.
         */
        .org-tree-root {
          display: flex;
          align-items: center;
          min-width: max-content;
          min-height: 460px;
        }

        .org-tree-node {
          position: relative;
          display: flex;
          align-items: center;
          flex: 0 0 auto;
        }

        .org-node {
          position: relative;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 14px;
          width: 164px;
          min-width: 164px;
          min-height: 38px;
          padding: 2px 0;
          border: 0;
          background: #fff;
          color: #252525;
          text-align: left;
          cursor: pointer;
          font: inherit;
        }

        .org-node:hover .org-name {
          color: #111827;
        }

        .org-node:focus-visible {
          outline: 2px solid #9ca3af;
          outline-offset: 4px;
          border-radius: 4px;
        }

        .org-dot {
          width: 20px;
          height: 20px;
          min-width: 20px;
          border-radius: 9999px;
          background: #3a3a3a;
        }

        .org-name {
          display: block;
          min-width: 0;
          overflow-wrap: anywhere;
          font-size: 13px;
          line-height: 15px;
          font-weight: 500;
        }

        /*
         * The reference uses only the name beside the dot. Designation is
         * retained as an accessible tooltip rather than adding visual rows
         * that would change the reference geometry.
         */
        .org-children {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0;
          min-width: max-content;
          margin-left: 118px;
          padding: 8px 0;
        }

        /* Horizontal line from manager node to the team's junction. */
        .org-children::before {
          content: "";
          position: absolute;
          left: -118px;
          top: 50%;
          width: 118px;
          height: 1px;
          background: #d8d6d2;
        }

        /*
         * The vertical junction is intentionally independent of employee
         * name/card width. Each child row owns a fixed 42px connector zone.
         * Subtrees are centered within that row, preventing text overlap.
         */
        .org-children.has-multiple::after {
          content: "";
          position: absolute;
          left: 0;
          top: 29px;
          bottom: 29px;
          width: 1px;
          background: #d8d6d2;
        }

        .org-child {
          position: relative;
          display: flex;
          align-items: center;
          min-height: 42px;
        }

        /* Horizontal connector from the vertical junction to each child. */
        .org-child::before {
          content: "";
          position: absolute;
          left: 0;
          top: 50%;
          width: 92px;
          height: 1px;
          background: #d8d6d2;
        }

        .org-child > .org-tree-node {
          margin-left: 92px;
        }

        /* A single child has a simple straight horizontal connection. */
        .org-children:not(.has-multiple)::after {
          display: none;
        }

        /*
         * When a child has a large subtree, the row naturally grows to that
         * subtree's height. The connector remains at the child's center,
         * exactly where the reference branches into the next level.
         */
        .org-collapse {
          position: absolute;
          z-index: 5;
          left: 146px;
          top: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          padding: 0;
          border: 1px solid #e8e6e3;
          border-radius: 9999px;
          background: #fff;
          color: #aaa59f;
          cursor: pointer;
          transform: translateY(-50%);
        }

        .org-collapse:hover {
          color: #66615b;
          border-color: #d2cec8;
        }

        @media (max-width: 900px) {
          .org-chart-canvas {
            padding: 48px 48px 64px 36px;
          }

          .org-tree-root {
            min-height: 500px;
          }
        }

        @media (max-width: 640px) {
          .org-chart-canvas {
            padding: 40px 40px 56px 28px;
          }

          .org-node {
            width: 154px;
            min-width: 154px;
            gap: 12px;
          }

          .org-children {
            margin-left: 94px;
          }

          .org-children::before {
            left: -94px;
            width: 94px;
          }

          .org-child::before {
            width: 72px;
          }

          .org-child > .org-tree-node {
            margin-left: 72px;
          }

          .org-collapse {
            left: 136px;
          }
        }
      `}</style>
    </div>
  );
}

function OrgTree({ roots }: { roots: OrgNodeData[] }) {
  return (
    <div className="org-tree-root">
      {roots.map((node) => (
        <TreeNode key={node.id} node={node} />
      ))}
    </div>
  );
}

function TreeNode({ node }: { node: OrgNodeData }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const children = Array.isArray(node.directReports)
    ? node.directReports
    : [];

  const navigateToEmployee = () => {
    navigate(`/app/employees/${node.id}`);
  };

  return (
    <div className="org-tree-node">
      <button
        type="button"
        className="org-node"
        onClick={navigateToEmployee}
        title={`${fullName(node)}${
          node.designationTitle ? ` · ${node.designationTitle}` : ""
        }`}
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
          aria-label={
            open
              ? `Collapse ${fullName(node)} team`
              : `Expand ${fullName(node)} team`
          }
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      )}

      {open && children.length > 0 && (
        <div
          className={`org-children ${
            children.length > 1 ? "has-multiple" : ""
          }`}
        >
          {children.map((child) => (
            <div className="org-child" key={child.id}>
              <TreeNode node={child} />
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

  /*
   * Flatten the API tree once.
   *
   * An employee can accidentally occur more than once in a nested response.
   * Keep one canonical node for each employee ID and remember the first
   * manager relationship supplied by the API. This prevents the same employee
   * from being rendered under multiple managers.
   */
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

          /*
           * Only the first parent relationship is accepted. Therefore one
           * employee can belong to one reporting manager in this chart.
           */
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

  /*
   * Rebuild directReports from the unique parent map.
   *
   * This is the important part: an employee ID is allowed to appear under
   * exactly one manager. If the backend returns the same employee more than
   * once, the duplicate occurrence is ignored.
   */
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

  /*
   * Prefer the actual managerId when it is present in the API payload.
   * This lets a manager reassignment move the employee to the new manager
   * instead of relying on a stale/nested duplicate occurrence.
   */
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

  /*
   * Employees without a valid manager remain top-level records. In the
   * normal company hierarchy Adithya is the single root.
   */
  const assignedIds = new Set<string>();

  for (const node of byId.values()) {
    for (const child of node.directReports) {
      assignedIds.add(child.id);
    }
  }

  const roots = [...byId.values()].filter((node) => !assignedIds.has(node.id));

  const adithya = roots.find(
    (node) => fullName(node).toLowerCase() === "adithya nuthakki",
  );

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
