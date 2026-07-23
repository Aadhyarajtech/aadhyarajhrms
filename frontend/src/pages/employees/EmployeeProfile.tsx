import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Mail, Phone, MapPin, Calendar, Briefcase, Edit3, FileText, Laptop, Upload, Wallet, Target, Clock,
} from "lucide-react";
import {
  EmployeesApi, AttendanceApi, LeaveApi, PerformanceApi, PayrollApi, DocumentsApi,
} from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { formatDate, formatCurrencyINR, formatTime, monthName, cx } from "@/lib/format";

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

const salarySchema = z.object({
  basic: z.coerce.number().min(0), hra: z.coerce.number().min(0), conveyance: z.coerce.number().min(0),
  medical: z.coerce.number().min(0), specialAllowance: z.coerce.number().min(0), pf: z.coerce.number().min(0),
  professionalTax: z.coerce.number().min(0), incomeTax: z.coerce.number().min(0),
});
type SalaryForm = z.infer<typeof salarySchema>;

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [docTypeOpen, setDocTypeOpen] = useState(false);

  const { data: employee, isLoading } = useQuery({ queryKey: ["employee", id], queryFn: () => EmployeesApi.get(id!), enabled: !!id });

  const isSelf = user?.employee?.id === id;
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const isFinance = user?.role === "FINANCE";
  const canViewPayroll = isSelf || isAdmin || isFinance;
  const canEdit = isSelf || isAdmin;

  if (isLoading || !employee) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "attendance", label: "Attendance" },
    { key: "leave", label: "Leave" },
    { key: "performance", label: "Performance" },
    ...(canViewPayroll ? [{ key: "payroll", label: "Payroll" }] : []),
    { key: "documents", label: "Documents & Assets" },
  ];

  return (
    <div>
      <Card className="mb-6 bg-gradient-to-br from-white to-canvas">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Avatar firstName={employee.firstName} lastName={employee.lastName} src={employee.avatarUrl} size="xl" />
            <div className="text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="font-display text-xl font-medium text-ink">{employee.firstName} {employee.lastName}</h1>
                <StatusBadge status={employee.status} />
              </div>
              <p className="mt-0.5 text-[14px] text-ink-faint">{employee.designationTitle} · {employee.departmentName}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[12.5px] text-ink-faint sm:justify-start">
                <span className="flex items-center gap-1.5"><Mail size={13} /> {employee.email}</span>
                {employee.phone && <span className="flex items-center gap-1.5"><Phone size={13} /> {employee.phone}</span>}
                {employee.city && <span className="flex items-center gap-1.5"><MapPin size={13} /> {employee.city}</span>}
                <span className="flex items-center gap-1.5"><Calendar size={13} /> Joined {formatDate(employee.dateOfJoining)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Badge tone="brand" className="font-mono">{employee.employeeCode}</Badge>
            {canEdit && (
              <Button size="sm" variant="outline" leftIcon={<Edit3 size={14} />} onClick={() => setEditOpen(true)}>Edit</Button>
            )}
          </div>
        </div>
        {employee.managerFirstName && (
          <div className="mt-5 flex items-center gap-2 border-t border-line/70 pt-4 text-[13px] text-ink-faint">
            <Briefcase size={14} /> Reports to <span className="font-medium text-ink">{employee.managerFirstName} {employee.managerLastName}</span>
          </div>
        )}
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />

      {tab === "overview" && <OverviewTab employee={employee} />}
      {tab === "attendance" && <AttendanceTab employeeId={employee.id} />}
      {tab === "leave" && <LeaveTab employeeId={employee.id} canManage={isAdmin} />}
      {tab === "performance" && <PerformanceTab employeeId={employee.id} />}
      {tab === "payroll" && canViewPayroll && (
        <PayrollTab employeeId={employee.id} canEditStructure={isAdmin} onEditSalary={() => setSalaryOpen(true)} />
      )}
      {tab === "documents" && <DocumentsTab employeeId={employee.id} canManage={isAdmin} onUpload={() => setDocTypeOpen(true)} />}

      <EditEmployeeModal open={editOpen} onClose={() => setEditOpen(false)} employee={employee} isAdmin={isAdmin} />
      {isAdmin && <SalaryModal open={salaryOpen} onClose={() => setSalaryOpen(false)} employeeId={employee.id} />}
      {isAdmin && <UploadDocModal open={docTypeOpen} onClose={() => setDocTypeOpen(false)} employeeId={employee.id} />}
    </div>
  );
}

// ----------------------------------------------------------------------------
function OverviewTab({ employee }: { employee: any }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Personal information" />
        <dl className="grid grid-cols-2 gap-y-4 text-[13.5px] sm:grid-cols-3">
          <Info label="Gender" value={employee.gender ?? "—"} />
          <Info label="Date of birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : "—"} />
          <Info label="Personal email" value={employee.personalEmail ?? "—"} />
          <Info label="Employment type" value={employee.employmentType.replace("_", " ")} />
          <Info label="City" value={employee.city ?? "—"} />
          <Info label="Country" value={employee.country} />
          <Info label="Address" value={employee.address ?? "—"} />
          <Info label="Emergency contact" value={employee.emergencyContactName ?? "—"} />
          <Info label="Emergency phone" value={employee.emergencyContactPhone ?? "—"} />
        </dl>
      </Card>
      <Card className="bg-gradient-to-br from-brand-600 to-brand-800 text-white">
        <p className="text-[12px] font-medium text-white/70">System role</p>
        <p className="mt-1 font-display text-xl font-medium">{employee.role.replace("_", " ")}</p>
        <div className="mt-4 h-px bg-white/15" />
        <p className="mt-4 text-[12px] font-medium text-white/70">Designation level</p>
        <p className="mt-1 text-[14px]">{employee.designationTitle} · Level {employee.designationLevel}</p>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

// ----------------------------------------------------------------------------
function AttendanceTab({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "employee", employeeId, now.getMonth()],
    queryFn: () => AttendanceApi.forEmployee(employeeId, now.getMonth() + 1, now.getFullYear()),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!data?.length) return <EmptyState icon={Clock} title="No attendance records yet" description="Records will appear here once the employee starts checking in." />;

  return (
    <Card>
      <CardHeader title={`Attendance — ${monthName(now.getMonth() + 1)} ${now.getFullYear()}`} />
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
            {data.map((r) => (
              <tr key={r.id} className="border-t border-line/60">
                <td className="py-2.5">{formatDate(r.date)}</td>
                <td className="py-2.5 text-ink-faint">{r.checkIn ? formatTime(r.checkIn) : "—"}</td>
                <td className="py-2.5 text-ink-faint">{r.checkOut ? formatTime(r.checkOut) : "—"}</td>
                <td className="py-2.5 text-ink-faint">{r.workHours ? `${r.workHours}h` : "—"}</td>
                <td className="py-2.5"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
function LeaveTab({ employeeId }: { employeeId: string; canManage: boolean }) {
  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ["leave", "balances", employeeId],
    queryFn: () => LeaveApi.balances(employeeId),
  });
  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ["leave", "requests", employeeId],
    queryFn: () => LeaveApi.requests({ employeeId }),
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
        <CardHeader title="Leave history" />
        {requestsLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : !requests?.length ? (
          <p className="text-[13px] text-ink-faint">No leave requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-ink">{r.leaveTypeName} · {r.totalDays} day(s)</p>
                  <p className="text-[12px] text-ink-faint">{formatDate(r.startDate)} – {formatDate(r.endDate)} · {r.reason}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
function PerformanceTab({ employeeId }: { employeeId: string }) {
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["performance", "reviews", employeeId],
    queryFn: () => PerformanceApi.reviews({ revieweeId: employeeId }),
  });
  const { data: goals, isLoading: goalsLoading } = useQuery({
    queryKey: ["performance", "goals", employeeId],
    queryFn: () => PerformanceApi.goals(employeeId),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Review history" />
        {reviewsLoading ? <Skeleton className="h-32 rounded-2xl" /> : !reviews?.length ? (
          <p className="text-[13px] text-ink-faint">No reviews recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-line/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-ink">{r.cycleName}</p>
                  <StatusBadge status={r.status} />
                </div>
                {r.finalRating && <p className="mt-1 text-[12px] text-ink-faint">Final rating: <span className="font-medium text-ink">{r.finalRating}/5</span></p>}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Active goals" />
        {goalsLoading ? <Skeleton className="h-32 rounded-2xl" /> : !goals?.length ? (
          <EmptyState icon={Target} title="No goals set" description="Goals will appear here once added from the Performance module." />
        ) : (
          <div className="space-y-4">
            {goals.map((g) => (
              <div key={g.id}>
                <div className="flex items-center justify-between text-[13px]">
                  <p className="font-medium text-ink">{g.title}</p>
                  <span className="text-ink-faint">{g.progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/5">
                  <div className={cx("h-full rounded-full", g.status === "AT_RISK" ? "bg-warning-500" : "bg-brand-500")} style={{ width: `${g.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
function PayrollTab({ employeeId, canEditStructure, onEditSalary }: { employeeId: string; canEditStructure: boolean; onEditSalary: () => void }) {
  const { data: payslips, isLoading } = useQuery({ queryKey: ["payslips", employeeId], queryFn: () => PayrollApi.payslipsForEmployee(employeeId) });
  const { data: structure } = useQuery({ queryKey: ["salary-structure", employeeId], queryFn: () => PayrollApi.getSalaryStructure(employeeId), enabled: canEditStructure });

  return (
    <div className="space-y-6">
      {canEditStructure && (
        <Card>
          <CardHeader
            title="Salary structure"
            subtitle={structure ? `Effective from ${formatDate(structure.effectiveFrom)}` : "Not configured yet"}
            action={<Button size="sm" variant="outline" leftIcon={<Wallet size={14} />} onClick={onEditSalary}>{structure ? "Update" : "Set up"}</Button>}
          />
          {structure && (
            <div className="grid grid-cols-2 gap-y-3 text-[13px] sm:grid-cols-4">
              <Info label="Basic" value={formatCurrencyINR(structure.basic)} />
              <Info label="HRA" value={formatCurrencyINR(structure.hra)} />
              <Info label="Special allowance" value={formatCurrencyINR(structure.specialAllowance)} />
              <Info label="PF" value={formatCurrencyINR(structure.pf)} />
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Payslip history" />
        {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : !payslips?.length ? (
          <EmptyState icon={Wallet} title="No payslips yet" description="Payslips appear here once payroll has been processed for this employee." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-ink-faint">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Gross</th>
                  <th className="pb-2 font-medium">Deductions</th>
                  <th className="pb-2 font-medium">Net pay</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id} className="border-t border-line/60">
                    <td className="py-2.5">{monthName(p.month!)} {p.year}</td>
                    <td className="py-2.5 text-ink-faint">{formatCurrencyINR(p.grossEarnings)}</td>
                    <td className="py-2.5 text-ink-faint">{formatCurrencyINR(p.totalDeductions)}</td>
                    <td className="py-2.5 font-medium text-ink">{formatCurrencyINR(p.netPay)}</td>
                    <td className="py-2.5"><StatusBadge status={p.runStatus!} /></td>
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

// ----------------------------------------------------------------------------
function DocumentsTab({ employeeId, canManage, onUpload }: { employeeId: string; canManage: boolean; onUpload: () => void }) {
  const { data: documents, isLoading: docsLoading } = useQuery({ queryKey: ["documents", employeeId], queryFn: () => DocumentsApi.list(employeeId) });
  const { data: assets, isLoading: assetsLoading } = useQuery({ queryKey: ["assets", employeeId], queryFn: () => DocumentsApi.assetsForEmployee(employeeId) });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Documents" action={canManage && <Button size="sm" variant="outline" leftIcon={<Upload size={14} />} onClick={onUpload}>Upload</Button>} />
        {docsLoading ? <Skeleton className="h-32 rounded-2xl" /> : !documents?.length ? (
          <EmptyState icon={FileText} title="No documents on file" description="Offer letters, ID proofs, and contracts will show up here." />
        ) : (
          <div className="space-y-2">
            {documents.map((d) => (
              <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5 transition hover:border-brand-300 hover:bg-brand-50">
                <span className="flex items-center gap-2.5 text-[13px] text-ink">
                  <FileText size={15} className="text-brand-500" /> {d.fileName}
                </span>
                <Badge tone="neutral">{d.type.replace(/_/g, " ")}</Badge>
              </a>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Assigned assets" />
        {assetsLoading ? <Skeleton className="h-32 rounded-2xl" /> : !assets?.length ? (
          <EmptyState icon={Laptop} title="No assets assigned" />
        ) : (
          <div className="space-y-2">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">{a.name}</p>
                  <p className="font-mono text-[11px] text-ink-faint">{a.assetTag}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
function EditEmployeeModal({ open, onClose, employee, isAdmin }: { open: boolean; onClose: () => void; employee: any; isAdmin: boolean }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      phone: employee.phone ?? "", personalEmail: employee.personalEmail ?? "", address: employee.address ?? "",
      city: employee.city ?? "", emergencyContactName: employee.emergencyContactName ?? "", emergencyContactPhone: employee.emergencyContactPhone ?? "",
      status: employee.status,
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: any) => EmployeesApi.update(employee.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", employee.id] });
      showToast("Profile updated.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Edit profile" size="lg" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Save changes</Button>
      </>
    }>
      <form className="grid gap-4 sm:grid-cols-2">
        <TextField label="Phone" {...register("phone")} />
        <TextField label="Personal email" type="email" {...register("personalEmail")} />
        <TextField label="City" {...register("city")} />
        <TextField label="Address" className="sm:col-span-2" {...register("address")} />
        <TextField label="Emergency contact name" {...register("emergencyContactName")} />
        <TextField label="Emergency contact phone" {...register("emergencyContactPhone")} />
        {isAdmin && (
          <div className="sm:col-span-2">
            <label className="text-[13px] font-medium text-ink-soft">Employment status</label>
            <select {...register("status")} className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm">
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="NOTICE_PERIOD">Notice period</option>
              <option value="RESIGNED">Resigned</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>
        )}
      </form>
    </Modal>
  );
}

function SalaryModal({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: existing } = useQuery({ queryKey: ["salary-structure", employeeId], queryFn: () => PayrollApi.getSalaryStructure(employeeId), enabled: open });
  const { register, handleSubmit } = useForm<SalaryForm>({ resolver: zodResolver(salarySchema) });

  const mutation = useMutation({
    mutationFn: (payload: SalaryForm) => PayrollApi.upsertSalaryStructure({ employeeId, ...payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-structure", employeeId] });
      showToast("Salary structure saved.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Salary structure" size="lg" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Save</Button>
      </>
    }>
      <form className="grid gap-4 sm:grid-cols-2" key={existing?.id ?? "new"}>
        <TextField label="Basic" type="number" defaultValue={existing?.basic} {...register("basic")} />
        <TextField label="HRA" type="number" defaultValue={existing?.hra} {...register("hra")} />
        <TextField label="Conveyance" type="number" defaultValue={existing?.conveyance} {...register("conveyance")} />
        <TextField label="Medical" type="number" defaultValue={existing?.medical} {...register("medical")} />
        <TextField label="Special allowance" type="number" defaultValue={existing?.specialAllowance} {...register("specialAllowance")} />
        <TextField label="Provident Fund (PF)" type="number" defaultValue={existing?.pf} {...register("pf")} />
        <TextField label="Professional tax" type="number" defaultValue={existing?.professionalTax} {...register("professionalTax")} />
        <TextField label="Income tax (TDS)" type="number" defaultValue={existing?.incomeTax} {...register("incomeTax")} />
      </form>
    </Modal>
  );
}

function UploadDocModal({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("OFFER_LETTER");

  const mutation = useMutation({
    mutationFn: () => DocumentsApi.upload(employeeId, file!, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", employeeId] });
      showToast("Document uploaded.");
      setFile(null);
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Upload document" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending} disabled={!file}>Upload</Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">Document type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm">
            <option value="OFFER_LETTER">Offer letter</option>
            <option value="ID_PROOF">ID proof</option>
            <option value="ADDRESS_PROOF">Address proof</option>
            <option value="EDUCATIONAL">Educational</option>
            <option value="CONTRACT">Contract</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">File</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-[13px]" />
        </div>
      </div>
    </Modal>
  );
}
