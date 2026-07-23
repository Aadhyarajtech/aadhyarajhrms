import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Wallet, Play, CheckCircle2, Download, X } from "lucide-react";
import { PayrollApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatCurrencyINR, monthName } from "@/lib/format";
import type { Payslip } from "@/types";

const FINANCE_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "FINANCE"];

export default function Payroll() {
  const { user } = useAuth();
  const canManage = !!user && FINANCE_ROLES.includes(user.role);
  const [tab, setTab] = useState("mine");
  const [viewSlip, setViewSlip] = useState<Payslip | null>(null);

  const tabs = [
    { key: "mine", label: "My Payslips" },
    ...(canManage ? [{ key: "runs", label: "Payroll Runs" }] : []),
  ];

  return (
    <div>
      <PageHeader title="Payroll" subtitle="Salary structures, payroll runs, and digital payslips." />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "mine" && <MyPayslips onView={setViewSlip} />}
      {tab === "runs" && canManage && <PayrollRuns />}
      {viewSlip && <PayslipModal payslip={viewSlip} onClose={() => setViewSlip(null)} />}
    </div>
  );
}

function MyPayslips({ onView }: { onView: (p: Payslip) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["payslips", "mine"], queryFn: PayrollApi.myPayslips });

  if (isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!data?.length) return <EmptyState icon={Wallet} title="No payslips yet" description="Your payslips will appear here once payroll has been processed." />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((p) => (
        <Card key={p.id} hoverable className="cursor-pointer" onClick={() => onView(p)}>
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-medium text-ink">{monthName(p.month!)} {p.year}</p>
            <StatusBadge status={p.runStatus!} />
          </div>
          <p className="mt-3 text-[12px] text-ink-faint">Net pay</p>
          <p className="font-display text-2xl font-medium text-ink">{formatCurrencyINR(p.netPay)}</p>
          <div className="mt-3 flex justify-between text-[12px] text-ink-faint">
            <span>Gross {formatCurrencyINR(p.grossEarnings)}</span>
            <span>Deductions {formatCurrencyINR(p.totalDeductions)}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PayrollRuns() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [viewRun, setViewRun] = useState<string | null>(null);
  const { data: runs, isLoading } = useQuery({ queryKey: ["payroll", "runs"], queryFn: PayrollApi.runs });
  const { register, handleSubmit } = useForm({
    defaultValues: { month: new Date().getMonth() + 1, year: new Date().getFullYear() },
  });

  const processMutation = useMutation({
    mutationFn: (v: { month: number; year: number }) => PayrollApi.process(Number(v.month), Number(v.year)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", "runs"] });
      showToast("Payroll processed successfully.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const markPaidMutation = useMutation({
    mutationFn: PayrollApi.markPaid,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", "runs"] });
      showToast("Marked as paid.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Process payroll" subtitle="Generates payslips for every active employee with a salary structure." />
        <form className="flex flex-wrap items-end gap-3">
          <SelectField label="Month" {...register("month")}>
            {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
          </SelectField>
          <SelectField label="Year" {...register("year")}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </SelectField>
          <Button leftIcon={<Play size={15} />} onClick={handleSubmit((v) => processMutation.mutate(v))} isLoading={processMutation.isPending}>
            Process payroll
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Payroll history" />
        {isLoading ? <Skeleton className="h-48 rounded-2xl" /> : !runs?.length ? (
          <EmptyState icon={Wallet} title="No payroll runs yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-ink-faint">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Headcount</th>
                  <th className="pb-2 font-medium">Gross</th>
                  <th className="pb-2 font-medium">Net</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line/60">
                    <td className="py-2.5">{monthName(r.month)} {r.year}</td>
                    <td className="py-2.5 text-ink-faint">{r.headcount}</td>
                    <td className="py-2.5 text-ink-faint">{formatCurrencyINR(r.totalGross)}</td>
                    <td className="py-2.5 font-medium text-ink">{formatCurrencyINR(r.totalNet)}</td>
                    <td className="py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setViewRun(r.id)} className="text-[12px] font-medium text-brand-600 hover:underline">View payslips</button>
                        {r.status === "PROCESSED" && (
                          <button onClick={() => markPaidMutation.mutate(r.id)} className="text-[12px] font-medium text-success-700 hover:underline">Mark paid</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {viewRun && <RunPayslipsModal runId={viewRun} onClose={() => setViewRun(null)} />}
    </div>
  );
}

function RunPayslipsModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["payroll", "run-payslips", runId], queryFn: () => PayrollApi.payslipsForRun(runId) });

  return (
    <Modal open onClose={onClose} title="Payslips for this run" size="lg">
      {isLoading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <div className="space-y-2">
          {data?.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5 text-[13px]">
              <div>
                <p className="font-medium text-ink">{p.firstName} {p.lastName}</p>
                <p className="text-[12px] text-ink-faint">{p.employeeCode} · {p.departmentName}</p>
              </div>
              <p className="font-medium text-ink">{formatCurrencyINR(p.netPay)}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function PayslipModal({ payslip, onClose }: { payslip: Payslip; onClose: () => void }) {
  const rows: [string, number][] = [
    ["Basic", payslip.basic], ["HRA", payslip.hra], ["Conveyance", payslip.conveyance],
    ["Medical", payslip.medical], ["Special allowance", payslip.specialAllowance],
  ];
  const deductions: [string, number][] = [
    ["Provident Fund", payslip.pf], ["Professional tax", payslip.professionalTax],
    ["Income tax (TDS)", payslip.incomeTax], ["Loss of pay", payslip.lop],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-lifted animate-fade-up print:shadow-none">
        <button onClick={onClose} className="absolute right-5 top-5 rounded-full p-1.5 text-ink-faint hover:bg-black/5"><X size={18} /></button>
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Aadhyaraj Technologies</p>
        <h2 className="mt-1 font-display text-lg font-medium text-ink">Payslip — {monthName(payslip.month!)} {payslip.year}</h2>
        <div className="mt-5 space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between text-[13px]">
              <span className="text-ink-faint">{label}</span>
              <span className="text-ink">{formatCurrencyINR(value)}</span>
            </div>
          ))}
          <div className="!mt-3 flex justify-between border-t border-line/70 pt-2 text-[13px] font-medium">
            <span className="text-ink">Gross earnings</span>
            <span className="text-ink">{formatCurrencyINR(payslip.grossEarnings)}</span>
          </div>
        </div>
        <div className="mt-5 space-y-1.5">
          {deductions.map(([label, value]) => (
            <div key={label} className="flex justify-between text-[13px]">
              <span className="text-ink-faint">{label}</span>
              <span className="text-danger-500">– {formatCurrencyINR(value)}</span>
            </div>
          ))}
          <div className="!mt-3 flex justify-between border-t border-line/70 pt-2 text-[13px] font-medium">
            <span className="text-ink">Total deductions</span>
            <span className="text-ink">{formatCurrencyINR(payslip.totalDeductions)}</span>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-success-50 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-success-700"><CheckCircle2 size={15} /> Net pay</span>
          <span className="font-display text-xl font-medium text-success-700">{formatCurrencyINR(payslip.netPay)}</span>
        </div>
        <Button className="mt-5 w-full" variant="outline" leftIcon={<Download size={15} />} onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>
    </div>
  );
}
