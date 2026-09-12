import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { PayslipAiExplainer } from "@/components/payroll/PayslipAiExplainer";
import { PayrollValidationModal } from "@/components/payroll/PayrollValidationModal";
import { PayrollAnomalyModal } from "@/components/payroll/PayrollAnomalyModal";
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
import type { Payslip, PayslipRequest, PayslipRequestPeriod, PayrollRun } from "@/types";

const PAYSLIP_REQUEST_ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "FINANCE"];

const PERIOD_LABELS: Record<PayslipRequestPeriod, string> = {
  "3_MONTHS": "Last 3 Months",
  "6_MONTHS": "Last 6 Months",
  "12_MONTHS": "Last 1 Year",
};

export default function Payroll() {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("payroll.manage");
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
  const { data: myRequests, isLoading: isLoadingRequests } = useQuery({
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

      <Card>
        <CardHeader title="My Payslip Requests" />
        {isLoadingRequests ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : !myRequests?.length ? (
          <p className="text-[13px] text-ink-faint">
            No payslip requests submitted yet. Use &ldquo;Request Payslips&rdquo; above to request past payslips.
          </p>
        ) : (
          <div className="space-y-2">
            {myRequests.map((r) => {
              const isSent = r.status === "SENT";
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewRequest(r);
                        }}
                        className="text-[12px] font-medium text-brand-600 hover:underline"
                      >
                        Download
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
  const periodMonths: Record<string, number> = {
    "3_MONTHS": 3,
    "6_MONTHS": 6,
    "12_MONTHS": 12,
  };
  const count = periodMonths[request.period] ?? 6;
  const matched = (request.payslipIds || []).length
    ? payslips.filter((p) => request.payslipIds.includes(p.id))
    : [];
  const displayPayslips =
    matched.length > 0 ? matched : payslips.slice(0, count);

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
        {displayPayslips.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-ink-faint">
            No payslips available for this period.
          </p>
        ) : (
          displayPayslips.map((p) => (
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
          ))
        )}
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
      <p className="text-[13px] font-medium text-ink-faint">
        Select period <span className="text-danger-500">*</span>
      </p>
      <p className="mt-0.5 text-[12px] text-ink-faint">
        Your request will be sent to the HR &amp; Finance Payroll team for review.
      </p>
      <div className="mt-3 space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[13px] transition-colors ${period === opt.value
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
  const [auditRun, setAuditRun] = useState<PayrollRun | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const { data: runs, isLoading } = useQuery({
    queryKey: ["payroll", "runs"],
    queryFn: PayrollApi.runs,
  });
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    },
  });

  const lockMutation = useMutation({
    mutationFn: (v: { month: number; year: number }) =>
      PayrollApi.lockAttendance(Number(v.month), Number(v.year)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", "runs"] });
      showToast("Attendance locked for the payroll period.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
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

  const reviewMutation = useMutation({
    mutationFn: PayrollApi.submitForReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", "runs"] });
      showToast("Payroll submitted for HR review.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const approveMutation = useMutation({
    mutationFn: PayrollApi.approve,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", "runs"] });
      showToast("Payroll approved.");
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

  const sendPayslipsMutation = useMutation({
    mutationFn: PayrollApi.sendPayslipsForRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", "runs"] });
      showToast("Payslips sent to employees.");
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
          <SelectField label="Month" required {...register("month")}>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i} value={i + 1}>
                {monthName(i + 1)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Year" required {...register("year")}>
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectField>
          <Button
            type="button"
            variant="outline"
            className="border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100/60"
            leftIcon={<Sparkles size={15} className="text-indigo-600" />}
            onClick={() => setShowValidationModal(true)}
          >
            Pre-Run Readiness Check
          </Button>
          <Button
            variant="outline"
            leftIcon={<Clock size={15} />}
            onClick={handleSubmit((v) => lockMutation.mutate(v))}
            isLoading={lockMutation.isPending}
          >
            Lock attendance
          </Button>
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
                          onClick={() => setAuditRun(r)}
                          className="flex items-center gap-1 text-[12px] font-medium text-indigo-600 hover:underline"
                          title="Run automated anomaly detection and audit on this payroll period"
                        >
                          <ShieldAlert size={13} className="text-indigo-600" />
                          Audit
                        </button>
                        <button
                          onClick={() => setViewRun(r.id)}
                          className="text-[12px] font-medium text-brand-600 hover:underline"
                        >
                          View payslips
                        </button>
                        {r.status === "PROCESSED" && (
                          <button
                            onClick={() => reviewMutation.mutate(r.id)}
                            className="text-[12px] font-medium text-brand-600 hover:underline"
                          >
                            Submit for review
                          </button>
                        )}
                        {r.status === "HR_REVIEW" && (
                          <button
                            onClick={() => approveMutation.mutate(r.id)}
                            className="text-[12px] font-medium text-success-700 hover:underline"
                          >
                            Approve
                          </button>
                        )}
                        {r.status === "APPROVED" && (
                          <button
                            onClick={() => markPaidMutation.mutate(r.id)}
                            className="text-[12px] font-medium text-success-700 hover:underline"
                          >
                            Mark paid
                          </button>
                        )}
                        {r.status === "PAID" && !r.payslipsSentAt && (
                          <button
                            onClick={() => sendPayslipsMutation.mutate(r.id)}
                            className="text-[12px] font-medium text-brand-600 hover:underline"
                          >
                            Send payslips
                          </button>
                        )}
                        {r.status === "PAID" && r.payslipsSentAt && (
                          <span className="text-[12px] font-medium text-success-700">
                            Payslips sent
                          </span>
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
      {auditRun && (
        <PayrollAnomalyModal
          open={!!auditRun}
          runId={auditRun.id}
          runMonth={auditRun.month}
          runYear={auditRun.year}
          onClose={() => setAuditRun(null)}
        />
      )}
      <PayrollValidationModal
        open={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        initialMonth={Number(watch("month")) || new Date().getMonth() + 1}
        initialYear={Number(watch("year")) || new Date().getFullYear()}
        onProceedToProcess={(m, y) => {
          setValue("month", m);
          setValue("year", y);
          processMutation.mutate({ month: m, year: y });
        }}
      />
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
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "run-payslips", runId],
    queryFn: () => PayrollApi.payslipsForRun(runId),
  });

  return (
    <>
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
                <div className="flex items-center gap-3">
                  <p className="font-medium text-ink">
                    {formatCurrencyINR(p.netPay)}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={
                      <Sparkles size={12} className="text-indigo-600" />
                    }
                    onClick={() => setSelectedPayslip(p)}
                  >
                    View & Explain
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {selectedPayslip && (
        <PayslipModal
          payslip={selectedPayslip}
          onClose={() => setSelectedPayslip(null)}
        />
      )}
    </>
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
  const [showAiExplainer, setShowAiExplainer] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const rows: [string, number][] = [
    ["Basic", payslip.basic ?? 0],
    ["HRA", payslip.hra ?? 0],
    ["Conveyance", payslip.conveyance ?? 0],
    ["Medical", payslip.medical ?? 0],
    ["Special allowance", payslip.specialAllowance ?? 0],
    ["Performance bonus", payslip.performanceBonus ?? 0],
    ["Overtime", payslip.overtimeAmount ?? 0],
  ];

  const deductions: [string, number][] = [
    ["Provident Fund", payslip.pf ?? 0],
    ["Professional tax", payslip.professionalTax ?? 0],
    ["Income tax (TDS)", payslip.incomeTax ?? 0],
    ["ESI", payslip.esi ?? 0],
    ["Loss of pay", payslip.lop ?? 0],
    ["Advance recovery", payslip.advanceRecovery ?? 0],
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex h-[100dvh] w-screen items-center justify-center p-4 sm:p-6 payslip-print-active print:static print:h-auto print:w-full print:p-0 print:m-0 print:block"
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @media print {
          #root {
            display: none !important;
          }
          body > *:not(.payslip-print-active) {
            display: none !important;
          }
          .payslip-print-active {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 15mm;
          }
          .payslip-dialog-card {
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-sm print:hidden"
        onClick={onClose}
      />

      {/* Dialog Card */}
      <div
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl max-h-[calc(100dvh-32px)] sm:max-h-[calc(100dvh-48px)] animate-fade-up print:shadow-none print:max-h-none print:overflow-visible print:rounded-none print:mx-auto print:animate-none print:w-full print:max-w-none payslip-dialog-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-7 pt-7 pb-2 print:px-0 print:pt-0">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 rounded-full p-1.5 text-ink-faint hover:bg-black/5 print:hidden"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Aadhyaraj Technologies
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-medium text-ink">
              Payslip{payslip.month ? ` — ${monthName(payslip.month)} ${payslip.year ?? ""}` : ""}
            </h2>
            <button
              type="button"
              onClick={() => setShowAiExplainer(!showAiExplainer)}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition print:hidden"
            >
              <Sparkles size={13} className="text-indigo-600" />
              <span>{showAiExplainer ? "Hide AI" : "AI Explain"}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Container */}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-2 print:overflow-visible print:p-0 print:h-auto print:w-full">
          {/* AI Explainer Box (Hidden in Print) */}
          {showAiExplainer && (
            <div className="mb-4 print:hidden">
              <PayslipAiExplainer
                payslipId={payslip.id || (payslip as any)._id}
              />
            </div>
          )}

          <div className="space-y-1.5">
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

          <div className="mt-4 rounded-2xl border border-line/60 px-4 py-3 text-[12px] text-ink-faint">
            <div className="flex justify-between">
              <span>Tax regime</span>
              <span className="font-medium text-ink">
                {payslip.taxRegime === "OLD" ? "Old" : "New"}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Taxable annual income</span>
              <span className="font-medium text-ink">
                {formatCurrencyINR(payslip.taxableIncome ?? 0)}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Annual tax</span>
              <span className="font-medium text-ink">
                {formatCurrencyINR(payslip.annualTax ?? 0)}
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
    </div>
  );

  return createPortal(modalContent, document.body);
}
