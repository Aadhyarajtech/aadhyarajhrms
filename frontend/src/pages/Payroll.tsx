import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Wallet,
  Play,
  CheckCircle2,
  Download,
  X,
  FileText,
  Send,
  Clock,
} from "lucide-react";
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
import type { Payslip, PayslipRequest, PayslipRequestPeriod } from "@/types";

const FINANCE_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "FINANCE"];
const PAYSLIP_REQUEST_ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

const PERIOD_LABELS: Record<PayslipRequestPeriod, string> = {
  "3_MONTHS": "Last 3 Months",
  "6_MONTHS": "Last 6 Months",
  "12_MONTHS": "Last 1 Year",
};

export default function Payroll() {
  const { user } = useAuth();
  const canManage = !!user && FINANCE_ROLES.includes(user.role);
  const canManageRequests =
    !!user && PAYSLIP_REQUEST_ADMIN_ROLES.includes(user.role);
  const [tab, setTab] = useState("mine");
  const [viewSlip, setViewSlip] = useState<Payslip | null>(null);

  const tabs = [
    { key: "mine", label: "My Payslips" },
    ...(canManage ? [{ key: "runs", label: "Payroll Runs" }] : []),
    ...(canManageRequests
      ? [{ key: "requests", label: "Payslip Requests" }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Salary structures, payroll runs, and digital payslips."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "mine" && <MyPayslips onView={setViewSlip} />}
      {tab === "runs" && canManage && <PayrollRuns />}
      {tab === "requests" && canManageRequests && <PayslipRequestsTab />}
      {viewSlip && (
        <PayslipModal payslip={viewSlip} onClose={() => setViewSlip(null)} />
      )}
    </div>
  );
}

function MyPayslips({ onView }: { onView: (p: Payslip) => void }) {
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [viewRequest, setViewRequest] = useState<PayslipRequest | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["payslips", "mine"],
    queryFn: PayrollApi.myPayslips,
  });
  const { data: myRequests } = useQuery({
    queryKey: ["payslip-requests", "mine"],
    queryFn: PayrollApi.myPayslipRequests,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[15px] font-medium text-ink">
          My Payslips
        </h2>
        <Button
          variant="outline"
          leftIcon={<FileText size={15} />}
          onClick={() => setShowRequestModal(true)}
        >
          Request Payslips
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : !data?.length ? (
        <EmptyState
          icon={Wallet}
          title="No payslips yet"
          description="Your payslips will appear here once payroll has been processed."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Card
              key={p.id}
              hoverable
              className="cursor-pointer"
              onClick={() => onView(p)}
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-[15px] font-medium text-ink">
                  {monthName(p.month!)} {p.year}
                </p>
                <StatusBadge status={p.runStatus!} />
              </div>
              <p className="mt-3 text-[12px] text-ink-faint">Net pay</p>
              <p className="font-display text-2xl font-medium text-ink">
                {formatCurrencyINR(p.netPay)}
              </p>
              <div className="mt-3 flex justify-between text-[12px] text-ink-faint">
                <span>Gross {formatCurrencyINR(p.grossEarnings)}</span>
                <span>Deductions {formatCurrencyINR(p.totalDeductions)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!!myRequests?.length && (
        <Card>
          <CardHeader title="My Payslip Requests" />
          <div className="space-y-2">
            {myRequests.map((r) => {
              const isSent = r.status === "SENT" && r.payslipIds.length > 0;
              return (
                <div
                  key={r.id}
                  onClick={() => isSent && setViewRequest(r)}
                  className={`flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5 text-[13px] ${isSent ? "cursor-pointer hover:bg-black/[0.02]" : ""}`}
                >
                  <span className="text-ink">{PERIOD_LABELS[r.period]}</span>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    {isSent && (
                      <span className="text-[12px] font-medium text-brand-600">
                        Download
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {showRequestModal && (
        <RequestPayslipsModal onClose={() => setShowRequestModal(false)} />
      )}
      {viewRequest && (
        <RequestedPayslipsModal
          request={viewRequest}
          payslips={data ?? []}
          onSelect={onView}
          onClose={() => setViewRequest(null)}
        />
      )}
    </div>
  );
}

function RequestedPayslipsModal({
  request,
  payslips,
  onSelect,
  onClose,
}: {
  request: PayslipRequest;
  payslips: Payslip[];
  onSelect: (p: Payslip) => void;
  onClose: () => void;
}) {
  const matched = payslips.filter((p) => request.payslipIds.includes(p.id));

  return (
    <Modal
      open
      onClose={onClose}
      title={`Requested Payslips — ${PERIOD_LABELS[request.period]}`}
      size="sm"
    >
      <p className="text-[13px] text-ink-faint">
        Select a payslip to view and download.
      </p>
      <div className="mt-3 space-y-2">
        {matched.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onSelect(p);
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-xl border border-line/60 px-4 py-3 text-left text-[13px] hover:bg-black/[0.02]"
          >
            <span className="text-ink">
              {monthName(p.month!)} {p.year}
            </span>
            <span className="flex items-center gap-1.5 font-medium text-brand-600">
              <Download size={14} /> View
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function RequestPayslipsModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PayslipRequestPeriod | "">("");

  const mutation = useMutation({
    mutationFn: (p: PayslipRequestPeriod) => PayrollApi.createPayslipRequest(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payslip-requests", "mine"] });
      showToast("Payslip request submitted.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const options: { value: PayslipRequestPeriod; label: string }[] = [
    { value: "3_MONTHS", label: PERIOD_LABELS["3_MONTHS"] },
    { value: "6_MONTHS", label: PERIOD_LABELS["6_MONTHS"] },
    { value: "12_MONTHS", label: PERIOD_LABELS["12_MONTHS"] },
  ];

  return (
    <Modal open onClose={onClose} title="Request Payslips" size="sm">
      <p className="text-[13px] text-ink-faint">Select period</p>
      <div className="mt-3 space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[13px] transition-colors ${
              period === opt.value
                ? "border-brand-600 bg-brand-50"
                : "border-line/60 hover:bg-black/[0.02]"
            }`}
          >
            <input
              type="radio"
              name="payslip-period"
              className="h-4 w-4 accent-brand-600"
              checked={period === opt.value}
              onChange={() => setPeriod(opt.value)}
            />
            <span className="text-ink">{opt.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!period}
          isLoading={mutation.isPending}
          onClick={() => period && mutation.mutate(period)}
        >
          Request Payslips
        </Button>
      </div>
    </Modal>
  );
}

function PayrollRuns() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [viewRun, setViewRun] = useState<string | null>(null);
  const { data: runs, isLoading } = useQuery({
    queryKey: ["payroll", "runs"],
    queryFn: PayrollApi.runs,
  });
  const { register, handleSubmit } = useForm({
    defaultValues: {
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    },
  });

  const processMutation = useMutation({
    mutationFn: (v: { month: number; year: number }) =>
      PayrollApi.process(Number(v.month), Number(v.year)),
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
        <CardHeader
          title="Process payroll"
          subtitle="Generates payslips for every active employee with a salary structure."
        />
        <form className="flex flex-wrap items-end gap-3">
          <SelectField label="Month" {...register("month")}>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i} value={i + 1}>
                {monthName(i + 1)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Year" {...register("year")}>
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectField>
          <Button
            leftIcon={<Play size={15} />}
            onClick={handleSubmit((v) => processMutation.mutate(v))}
            isLoading={processMutation.isPending}
          >
            Process payroll
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Payroll history" />
        {isLoading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : !runs?.length ? (
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
                    <td className="py-2.5">
                      {monthName(r.month)} {r.year}
                    </td>
                    <td className="py-2.5 text-ink-faint">{r.headcount}</td>
                    <td className="py-2.5 text-ink-faint">
                      {formatCurrencyINR(r.totalGross)}
                    </td>
                    <td className="py-2.5 font-medium text-ink">
                      {formatCurrencyINR(r.totalNet)}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setViewRun(r.id)}
                          className="text-[12px] font-medium text-brand-600 hover:underline"
                        >
                          View payslips
                        </button>
                        {r.status === "PROCESSED" && (
                          <button
                            onClick={() => markPaidMutation.mutate(r.id)}
                            className="text-[12px] font-medium text-success-700 hover:underline"
                          >
                            Mark paid
                          </button>
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

      {viewRun && (
        <RunPayslipsModal runId={viewRun} onClose={() => setViewRun(null)} />
      )}
    </div>
  );
}

function RunPayslipsModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "run-payslips", runId],
    queryFn: () => PayrollApi.payslipsForRun(runId),
  });

  return (
    <Modal open onClose={onClose} title="Payslips for this run" size="lg">
      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="space-y-2">
          {data?.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5 text-[13px]"
            >
              <div>
                <p className="font-medium text-ink">
                  {p.firstName} {p.lastName}
                </p>
                <p className="text-[12px] text-ink-faint">
                  {p.employeeCode} · {p.departmentName}
                </p>
              </div>
              <p className="font-medium text-ink">
                {formatCurrencyINR(p.netPay)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function PayslipRequestsTab() {
  const [viewId, setViewId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "payslip-requests"],
    queryFn: PayrollApi.payslipRequests,
  });

  return (
    <Card>
      <CardHeader
        title="Payslip Requests"
        subtitle="Employee requests for payslips awaiting review."
      />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState
          icon={Clock}
          title="No payslip requests"
          description="Employee payslip requests will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-ink-faint">
                <th className="pb-2 font-medium">Employee</th>
                <th className="pb-2 font-medium">Employee ID</th>
                <th className="pb-2 font-medium">Period</th>
                <th className="pb-2 font-medium">Requested</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className="py-2.5">
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="py-2.5 text-ink-faint">{r.employeeCode}</td>
                  <td className="py-2.5 text-ink-faint">
                    {PERIOD_LABELS[r.period]}
                  </td>
                  <td className="py-2.5 text-ink-faint">
                    {new Date(r.requestedAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => setViewId(r.id)}
                      className="text-[12px] font-medium text-brand-600 hover:underline"
                    >
                      {r.status === "PENDING" ? "Review" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewId && (
        <PayslipRequestModal id={viewId} onClose={() => setViewId(null)} />
      )}
    </Card>
  );
}

function PayslipRequestModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: request, isLoading } = useQuery({
    queryKey: ["payroll", "payslip-request", id],
    queryFn: () => PayrollApi.payslipRequest(id),
  });

  const sendMutation = useMutation({
    mutationFn: () => PayrollApi.sendPayslipRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["payroll", "payslip-requests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["payroll", "payslip-request", id],
      });
      showToast("Payslips sent to employee.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open onClose={onClose} title="Payslip Request" size="md">
      {isLoading || !request ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">
                Employee
              </p>
              <p className="mt-0.5 font-medium text-ink">
                {request.firstName} {request.lastName}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">
                Employee ID
              </p>
              <p className="mt-0.5 font-medium text-ink">
                {request.employeeCode}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">
                Requested
              </p>
              <p className="mt-0.5 font-medium text-ink">
                {PERIOD_LABELS[request.period]}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">
                Status
              </p>
              <div className="mt-0.5">
                <StatusBadge status={request.status} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">
              Available Payslips
            </p>
            {!request.availablePayslips?.length ? (
              <p className="mt-2 text-[13px] text-ink-faint">
                No payslips are available for this employee.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {request.availablePayslips.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-[13px] text-ink"
                  >
                    <CheckCircle2 size={14} className="text-success-700" />
                    {monthName(p.month!)} {p.year}
                  </div>
                ))}
              </div>
            )}
          </div>

          {request.status === "PENDING" && (
            <Button
              className="w-full"
              leftIcon={<Send size={15} />}
              isLoading={sendMutation.isPending}
              disabled={!request.availablePayslips?.length}
              onClick={() => sendMutation.mutate()}
            >
              Send Payslips
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

function PayslipModal({
  payslip,
  onClose,
}: {
  payslip: Payslip;
  onClose: () => void;
}) {
  const rows: [string, number][] = [
    ["Basic", payslip.basic],
    ["HRA", payslip.hra],
    ["Conveyance", payslip.conveyance],
    ["Medical", payslip.medical],
    ["Special allowance", payslip.specialAllowance],
  ];
  const deductions: [string, number][] = [
    ["Provident Fund", payslip.pf],
    ["Professional tax", payslip.professionalTax],
    ["Income tax (TDS)", payslip.incomeTax],
    ["Loss of pay", payslip.lop],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-lifted animate-fade-up print:shadow-none">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-ink-faint hover:bg-black/5"
        >
          <X size={18} />
        </button>
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Aadhyaraj Technologies
        </p>
        <h2 className="mt-1 font-display text-lg font-medium text-ink">
          Payslip — {monthName(payslip.month!)} {payslip.year}
        </h2>
        <div className="mt-5 space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between text-[13px]">
              <span className="text-ink-faint">{label}</span>
              <span className="text-ink">{formatCurrencyINR(value)}</span>
            </div>
          ))}
          <div className="!mt-3 flex justify-between border-t border-line/70 pt-2 text-[13px] font-medium">
            <span className="text-ink">Gross earnings</span>
            <span className="text-ink">
              {formatCurrencyINR(payslip.grossEarnings)}
            </span>
          </div>
        </div>
        <div className="mt-5 space-y-1.5">
          {deductions.map(([label, value]) => (
            <div key={label} className="flex justify-between text-[13px]">
              <span className="text-ink-faint">{label}</span>
              <span className="text-danger-500">
                – {formatCurrencyINR(value)}
              </span>
            </div>
          ))}
          <div className="!mt-3 flex justify-between border-t border-line/70 pt-2 text-[13px] font-medium">
            <span className="text-ink">Total deductions</span>
            <span className="text-ink">
              {formatCurrencyINR(payslip.totalDeductions)}
            </span>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-success-50 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-success-700">
            <CheckCircle2 size={15} /> Net pay
          </span>
          <span className="font-display text-xl font-medium text-success-700">
            {formatCurrencyINR(payslip.netPay)}
          </span>
        </div>
        <Button
          className="mt-5 w-full"
          variant="outline"
          leftIcon={<Download size={15} />}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </Button>
      </div>
    </div>
  );
}
