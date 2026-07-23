import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "react-router-dom";
import { Plus, Check, X, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { LeaveApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { TextField, SelectField, TextareaField } from "@/components/ui/Field";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, monthName, cx } from "@/lib/format";

const MANAGER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"];

const applySchema = z.object({
  leaveTypeId: z.string().min(1, "Select a leave type"),
  startDate: z.string().min(1, "Required"),
  endDate: z.string().min(1, "Required"),
  reason: z.string().min(3, "Add a short reason"),
});
type ApplyForm = z.infer<typeof applySchema>;

export default function Leave() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const [tab, setTab] = useState(params.get("tab") === "team" && isManager ? "team" : "mine");
  const [applyOpen, setApplyOpen] = useState(false);

  const tabs = [
    { key: "mine", label: "My Leave" },
    ...(isManager ? [{ key: "team", label: "Team Approvals" }] : []),
    { key: "calendar", label: "Calendar" },
  ];

  return (
    <div>
      <PageHeader
        title="Leave"
        subtitle="Apply for leave, track balances, and manage approvals."
        action={<Button leftIcon={<Plus size={16} />} onClick={() => setApplyOpen(true)}>Apply for leave</Button>}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "mine" && <MyLeave />}
      {tab === "team" && isManager && <TeamApprovals />}
      {tab === "calendar" && <LeaveCalendar />}
      <ApplyModal open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}

function MyLeave() {
  const { user } = useAuth();
  const employeeId = user?.employee?.id;
  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ["leave", "balances", "mine"],
    queryFn: () => LeaveApi.balances(employeeId),
    enabled: !!employeeId,
  });
  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ["leave", "requests", "mine"],
    queryFn: () => LeaveApi.requests({ employeeId }),
    enabled: !!employeeId,
  });
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const cancelMutation = useMutation({
    mutationFn: (id: string) => LeaveApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      showToast("Leave request cancelled.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {balancesLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)
        ) : (
          balances?.map((b) => (
            <Card key={b.id} className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-ink">{b.name}</p>
                <p className="mt-1 text-[12px] text-ink-faint">{b.allotted - b.used} of {b.allotted} days left</p>
              </div>
              <ProgressRing value={((b.allotted - b.used) / b.allotted) * 100} size={48} strokeWidth={5} color={b.colorHex} trackColor="#F1F0EE" />
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader title="My requests" />
        {requestsLoading ? <Skeleton className="h-40 rounded-2xl" /> : !requests?.length ? (
          <EmptyState icon={CalendarDays} title="No leave requests yet" description="Apply for leave using the button above." />
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-ink">{r.leaveTypeName} · {r.totalDays} day(s)</p>
                  <p className="text-[12px] text-ink-faint">{formatDate(r.startDate)} – {formatDate(r.endDate)}</p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">"{r.reason}"</p>
                  {r.decisionNote && <p className="mt-0.5 text-[12px] italic text-ink-faint">Note: {r.decisionNote}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={r.status} />
                  {r.status === "PENDING" && (
                    <button onClick={() => cancelMutation.mutate(r.id)} className="text-[11px] font-medium text-danger-500 hover:underline">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TeamApprovals() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filter, setFilter] = useState("PENDING");
  const { data: requests, isLoading } = useQuery({
    queryKey: ["leave", "requests", "team", filter],
    queryFn: () => LeaveApi.requests({ scope: "team", status: filter || undefined }),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => LeaveApi.decide(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      showToast("Decision recorded.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Card>
      <CardHeader
        title="Team approvals"
        subtitle="Requests from your direct reports"
        action={
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-xl border border-line bg-white px-3 text-sm">
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </select>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !requests?.length ? (
        <EmptyState icon={Check} title="Nothing to review" description="Requests from your team will show up here." />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar firstName={r.firstName} lastName={r.lastName} src={r.avatarUrl} size="sm" />
                <div>
                  <p className="text-[13px] font-medium text-ink">{r.firstName} {r.lastName}</p>
                  <p className="text-[12px] text-ink-faint">{r.leaveTypeName} · {formatDate(r.startDate)} – {formatDate(r.endDate)} ({r.totalDays}d)</p>
                  <p className="text-[12px] text-ink-faint">"{r.reason}"</p>
                </div>
              </div>
              {r.status === "PENDING" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" leftIcon={<X size={14} />} onClick={() => decideMutation.mutate({ id: r.id, status: "REJECTED" })}>Reject</Button>
                  <Button size="sm" leftIcon={<Check size={14} />} onClick={() => decideMutation.mutate({ id: r.id, status: "APPROVED" })}>Approve</Button>
                </div>
              ) : (
                <StatusBadge status={r.status} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LeaveCalendar() {
  const [cursor, setCursor] = useState(new Date());
  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();
  const { data: entries, isLoading } = useQuery({ queryKey: ["leave", "calendar", month, year], queryFn: () => LeaveApi.calendar(month, year) });

  const days = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const startOffset = firstDay.getDay();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month - 1, d) });
    return cells;
  }, [month, year]);

  function entriesForDay(date: Date) {
    if (!entries) return [];
    const iso = date.toISOString().slice(0, 10);
    return entries.filter((e: any) => e.startDate.slice(0, 10) <= iso && e.endDate.slice(0, 10) >= iso);
  }

  return (
    <Card>
      <CardHeader
        title={`${monthName(month)} ${year}`}
        subtitle="Approved leave across the organization"
        action={
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month - 2, 1))}><ChevronLeft size={14} /></Button>
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month, 1))}><ChevronRight size={14} /></Button>
          </div>
        }
      />
      {isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="pb-1 text-[11px] font-medium text-ink-faint">{d}</div>
          ))}
          {days.map((cell, i) => {
            if (!cell.date) return <div key={i} />;
            const dayEntries = entriesForDay(cell.date);
            const isToday = cell.date.toDateString() === new Date().toDateString();
            return (
              <div key={i} className={cx("min-h-[72px] rounded-xl border border-line/50 p-1.5 text-left", isToday && "border-brand-300 bg-brand-50/40")}>
                <p className={cx("text-[11px]", isToday ? "font-semibold text-brand-600" : "text-ink-faint")}>{cell.date.getDate()}</p>
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {dayEntries.slice(0, 3).map((e: any) => (
                    <span key={e.id} title={`${e.firstName} ${e.lastName} — ${e.leaveTypeName}`} className="h-4 w-4 overflow-hidden rounded-full">
                      <Avatar firstName={e.firstName} lastName={e.lastName} src={e.avatarUrl} size="xs" />
                    </span>
                  ))}
                  {dayEntries.length > 3 && <span className="text-[9px] text-ink-faint">+{dayEntries.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ApplyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: leaveTypes } = useQuery({ queryKey: ["leave-types"], queryFn: LeaveApi.types, enabled: open });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ApplyForm>({ resolver: zodResolver(applySchema) });

  const mutation = useMutation({
    mutationFn: LeaveApi.apply,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      showToast("Leave request submitted for approval.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Apply for leave" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Submit request</Button>
      </>
    }>
      <div className="space-y-4">
        <SelectField label="Leave type" required error={errors.leaveTypeId?.message} {...register("leaveTypeId")}>
          <option value="">Select leave type</option>
          {leaveTypes?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </SelectField>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Start date" type="date" required error={errors.startDate?.message} {...register("startDate")} />
          <TextField label="End date" type="date" required error={errors.endDate?.message} {...register("endDate")} />
        </div>
        <TextareaField label="Reason" required error={errors.reason?.message} {...register("reason")} />
      </div>
    </Modal>
  );
}
