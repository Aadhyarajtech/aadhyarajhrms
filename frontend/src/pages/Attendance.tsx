import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { CalendarClock, Clock, CheckCircle2, XCircle, Home, AlertCircle } from "lucide-react";
import { AttendanceApi } from "@/lib/endpoints";
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
import { TextField, TextareaField } from "@/components/ui/Field";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatTime, monthName } from "@/lib/format";

const MANAGER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"];

export default function Attendance() {
  const { user } = useAuth();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const [tab, setTab] = useState("mine");
  const [regOpen, setRegOpen] = useState(false);

  const tabs = [
    { key: "mine", label: "My Attendance" },
    ...(isManager ? [{ key: "team", label: "Team View" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Track work hours, history, and team presence."
        action={<Button size="sm" variant="outline" leftIcon={<CalendarClock size={14} />} onClick={() => setRegOpen(true)}>Request regularization</Button>}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "mine" && <MyAttendance />}
      {tab === "team" && isManager && <TeamAttendance />}
      <RegularizeModal open={regOpen} onClose={() => setRegOpen(false)} />
    </div>
  );
}

function MyAttendance() {
  const now = new Date();
  const { data, isLoading } = useQuery({ queryKey: ["attendance", "mine", now.getMonth()], queryFn: () => AttendanceApi.mine(now.getMonth() + 1, now.getFullYear()) });

  const summary = useMemo(() => {
    if (!data) return null;
    const present = data.filter((r) => r.status === "PRESENT").length;
    const wfh = data.filter((r) => r.status === "WORK_FROM_HOME").length;
    const onLeave = data.filter((r) => r.status === "ON_LEAVE").length;
    const absent = data.filter((r) => r.status === "ABSENT").length;
    const totalHours = data.reduce((sum, r) => sum + (r.workHours ?? 0), 0);
    return { present, wfh, onLeave, absent, totalHours: Math.round(totalHours) };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={CheckCircle2} tone="success" label="Present days" value={summary?.present ?? 0} />
        <SummaryCard icon={Home} tone="brand" label="Work from home" value={summary?.wfh ?? 0} />
        <SummaryCard icon={AlertCircle} tone="warning" label="On leave" value={summary?.onLeave ?? 0} />
        <SummaryCard icon={Clock} tone="gold" label="Total hours logged" value={`${summary?.totalHours ?? 0}h`} />
      </div>

      <Card>
        <CardHeader title={`${monthName(now.getMonth() + 1)} ${now.getFullYear()}`} subtitle="Daily attendance log" />
        {isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : !data?.length ? (
          <EmptyState icon={Clock} title="No attendance yet this month" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-ink-faint">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Check-in</th>
                  <th className="pb-2 font-medium">Check-out</th>
                  <th className="pb-2 font-medium">Hours</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((r) => (
                  <tr key={r.id} className="border-t border-line/60">
                    <td className="py-2.5">{formatDate(r.date)}</td>
                    <td className="py-2.5 text-ink-faint">{r.checkIn ? formatTime(r.checkIn) : "—"}</td>
                    <td className="py-2.5 text-ink-faint">{r.checkOut ? formatTime(r.checkOut) : "—"}</td>
                    <td className="py-2.5 text-ink-faint">{r.workHours ? `${r.workHours}h` : "—"}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.isRegularized && <span className="text-[11px] text-ink-faint">(regularized)</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ icon: Icon, tone, label, value }: { icon: typeof Clock; tone: string; label: string; value: string | number }) {
  const TONE_BG: Record<string, string> = { success: "bg-success-50 text-success-700", brand: "bg-brand-50 text-brand-600", warning: "bg-warning-50 text-warning-700", gold: "bg-gold-50 text-gold-700" };
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${TONE_BG[tone]}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="font-display text-xl font-medium text-ink">{value}</p>
          <p className="text-[12px] text-ink-faint">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function TeamAttendance() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useQuery({ queryKey: ["attendance", "by-date", date], queryFn: () => AttendanceApi.byDate(date) });

  return (
    <Card>
      <CardHeader
        title="Team attendance"
        subtitle="View attendance for any date across the organization"
        action={
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-xl border border-line bg-white px-3 text-sm" />
        }
      />
      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState icon={XCircle} title="No attendance recorded for this date" description="This might be a weekend, holiday, or a date with no logged activity." />
      ) : (
        <div className="space-y-2">
          {data.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <Avatar firstName={r.firstName} lastName={r.lastName} size="sm" />
                <div>
                  <p className="text-[13px] font-medium text-ink">{r.firstName} {r.lastName}</p>
                  <p className="text-[12px] text-ink-faint">{r.departmentName} · {r.employeeCode}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-ink-faint">{r.checkIn ? formatTime(r.checkIn) : "—"} {r.checkOut ? `– ${formatTime(r.checkOut)}` : ""}</span>
                <StatusBadge status={r.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RegularizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm({ defaultValues: { date: new Date().toISOString().slice(0, 10), note: "" } });

  const mutation = useMutation({
    mutationFn: (v: { date: string; note: string }) => AttendanceApi.regularize(v.date, v.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      showToast("Regularization request submitted.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Request attendance regularization" subtitle="For a day with a missed or incorrect punch." footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Submit request</Button>
      </>
    }>
      <div className="space-y-4">
        <TextField label="Date" type="date" required {...register("date")} />
        <TextareaField label="Reason" required placeholder="E.g. Forgot to check out after an off-site client visit." {...register("note")} />
      </div>
    </Modal>
  );
}
