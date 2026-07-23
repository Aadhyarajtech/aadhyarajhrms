import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Users } from "lucide-react";
import { EmployeesApi } from "@/lib/endpoints";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/EmptyState";
import { cx } from "@/lib/format";

interface OrgNodeData {
  id: string; firstName: string; lastName: string; avatarUrl: string | null; designationTitle: string;
  departmentName: string; departmentColor: string; directReports: OrgNodeData[];
}

export default function OrgChart() {
  const { data, isLoading } = useQuery({ queryKey: ["org-chart"], queryFn: EmployeesApi.orgChart });

  return (
    <div>
      <PageHeader title="Org Chart" subtitle="The full reporting structure of Aadhyaraj Technologies." />
      <div className="rounded-3xl border border-line/70 bg-white p-6">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-ink-faint">No organization data yet.</p>
        ) : (
          <div className="space-y-2">
            {(data as OrgNodeData[]).map((root) => (
              <OrgNode key={root.id} node={root} depth={0} defaultOpen />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgNode({ node, depth, defaultOpen = false }: { node: OrgNodeData; depth: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || depth < 1);
  const navigate = useNavigate();
  const hasChildren = node.directReports?.length > 0;

  return (
    <div className={cx(depth > 0 && "ml-5 border-l border-line/70 pl-5")}>
      <div className="flex items-center gap-2 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={!hasChildren}
          className={cx("rounded-md p-0.5 text-ink-faint transition", hasChildren ? "hover:bg-black/5 hover:text-ink" : "opacity-0")}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <button
          onClick={() => navigate(`/app/employees/${node.id}`)}
          className="flex flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-brand-50"
        >
          <Avatar firstName={node.firstName} lastName={node.lastName} src={node.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-ink">{node.firstName} {node.lastName}</p>
            <p className="truncate text-[12px] text-ink-faint">{node.designationTitle}</p>
          </div>
          <Badge tone="neutral" className="ml-1 hidden sm:inline-flex" style={{ background: `${node.departmentColor}1A`, color: node.departmentColor }}>
            {node.departmentName}
          </Badge>
          {hasChildren && (
            <span className="ml-auto flex items-center gap-1 text-[11.5px] text-ink-faint">
              <Users size={12} /> {node.directReports.length}
            </span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <div className="mt-1">
          {node.directReports.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
