import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown } from "lucide-react";
import { EmployeesApi } from "@/lib/endpoints";
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

export default function OrgChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["org-chart"],
    queryFn: EmployeesApi.orgChart,
  });

  return (
    <div>
      <PageHeader
        title="Org Chart"
        subtitle="The full reporting structure of Aadhyaraj Technologies."
      />

      <div className="rounded-3xl border border-line/70 bg-white p-4 sm:p-8">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-ink-faint">No organization data yet.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
            <div className="flex min-w-max justify-center gap-16">
              {(data as OrgNodeData[]).map((root) => (
                <OrgNode key={root.id} node={root} depth={0} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrgNode({ node, depth }: { node: OrgNodeData; depth: number }) {
  const [open, setOpen] = useState(true);
  const children = node.directReports ?? [];
  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard node={node} depth={depth} />

      {hasChildren && (
        <>
          <div className="relative flex h-8 w-px items-center justify-center">
            <div className="absolute inset-y-0 w-px bg-line" />

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Collapse team" : "Expand team"}
              className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-faint shadow-sm transition hover:border-brand-300 hover:text-brand-600"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>

          {open && (
            <div className="relative mt-0 flex min-w-max flex-col items-center">
              {/* Vertical connector from this manager to the direct-report row. */}
              <div className="h-6 w-px bg-line" />

              {/* Direct reports are siblings and stay on the same horizontal row. */}
              <div className="relative flex items-start justify-center gap-8">
                {children.length > 1 && (
                  <div
                    className="absolute left-1/2 top-0 h-px -translate-y-0.5 bg-line"
                    style={{
                      left: "calc(50% - 1px)",
                      width: `calc(100% - 140px)`,
                    }}
                  />
                )}

                {children.map((child) => (
                  <div
                    key={child.id}
                    className="relative flex flex-col items-center"
                  >
                    {/* Branch from the shared sibling connector to the child. */}
                    <div className="h-6 w-px bg-line" />
                    <OrgNode node={child} depth={depth + 1} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrgNodeCard({ node, depth }: { node: OrgNodeData; depth: number }) {
  const navigate = useNavigate();
  const isRoot = depth === 0;

  return (
    <button
      type="button"
      onClick={() => navigate(`/app/employees/${node.id}`)}
      className="group flex items-center gap-3 whitespace-nowrap rounded-full border border-line/70 bg-white py-1.5 pl-1.5 pr-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <span
        className={`flex shrink-0 rounded-full p-0.5 ${
          isRoot ? "scale-125" : ""
        }`}
        style={{
          boxShadow: `0 0 0 2.5px ${node.departmentColor}`,
        }}
      >
        <Avatar
          firstName={node.firstName}
          lastName={node.lastName}
          src={node.avatarUrl}
          size="sm"
        />
      </span>

      <span className="min-w-0 text-left">
        <p
          className={`truncate font-semibold text-ink ${
            isRoot ? "text-[15px]" : "text-[13.5px]"
          }`}
        >
          {node.firstName} {node.lastName}
        </p>

        <p className="truncate text-[12px] text-ink-faint">
          {node.designationTitle}
        </p>
      </span>
    </button>
  );
}
