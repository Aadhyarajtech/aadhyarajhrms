import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  UserPlus,
  UsersRound,
  UserCheck,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { EmployeesApi, OrganizationApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { TextField, SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";

const PAGE_SIZE = 50;
const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

const addEmployeeSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Enter a valid email."),
  departmentId: z.string().min(1, "Select a department"),
  designationId: z.string().min(1, "Select a designation"),
  managerId: z.string().optional(),
  dateOfJoining: z.string().min(1, "Required"),
  role: z.enum([
    "SUPER_ADMIN",
    "HR_ADMIN",
    "MANAGER",
    "RECRUITER",
    "FINANCE",
    "EMPLOYEE",
  ]),
  temporaryPassword: z.string().min(8, "At least 8 characters"),
});
type AddEmployeeForm = z.infer<typeof addEmployeeSchema>;

export default function EmployeeDirectory() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const { data: deptData } = useQuery({
    queryKey: ["departments"],
    queryFn: OrganizationApi.departments,
  });
  const { data: designations } = useQuery({
    queryKey: ["designations"],
    queryFn: () => OrganizationApi.designations(),
  });
  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: EmployeesApi.managers,
    enabled: addOpen,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["employees", { search, departmentId, status, page }],
    queryFn: () =>
      EmployeesApi.list({
        search: search || undefined,
        departmentId: departmentId || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddEmployeeForm>({
    resolver: zodResolver(addEmployeeSchema),
    defaultValues: { role: "EMPLOYEE" },
  });

  const createMutation = useMutation({
    mutationFn: EmployeesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      showToast("Employee added successfully.");
      setAddOpen(false);
      reset();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  );

  return (
    <div className="premium-page space-y-6">
      <PageHeader
        title="People Directory"
        subtitle={
          data
            ? `${data.total} people across the organization`
            : "Loading your organization..."
        }
        action={
          isAdmin && (
            <Button
              leftIcon={<UserPlus size={16} />}
              onClick={() => setAddOpen(true)}
            >
              Add employee
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-[22px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(79,70,229,0.07)]">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-indigo-100/60 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">Total people</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{data?.total ?? "—"}</p>
              <p className="mt-1 text-[11px] text-slate-500">Organization directory</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100">
              <UsersRound size={18} />
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(16,185,129,0.06)]">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-100/60 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">Active view</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{status === "ACTIVE" ? "Active" : "All"}</p>
              <p className="mt-1 text-[11px] text-slate-500">Current directory filter</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
              <UserCheck size={18} />
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(245,158,11,0.06)]">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber-100/60 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600">Department</p>
              <p className="mt-1 max-w-[150px] truncate font-display text-lg font-semibold text-slate-900">{departmentId ? "Filtered" : "All departments"}</p>
              <p className="mt-1 text-[11px] text-slate-500">Workforce segment</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm ring-1 ring-amber-100">
              <Filter size={18} />
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(124,58,237,0.06)]">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-100/60 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Directory access</p>
              <p className="mt-1 font-display text-lg font-semibold text-slate-900">{isAdmin ? "Admin view" : "Employee view"}</p>
              <p className="mt-1 text-[11px] text-slate-500">Role-based visibility</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-100">
              <ShieldCheck size={18} />
            </span>
          </div>
        </div>
      </div>

      <Card className="!p-0 overflow-hidden border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.045)]">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-[#FAF8FF] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Filter size={15} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Find people</p>
              <p className="text-[11px] text-slate-500">Search and refine the organization directory.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, code, or email..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm shadow-sm transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100/70"
            />
          </div>
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-600 shadow-sm transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100/70"
          >
            <option value="">All departments</option>
            {deptData?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-600 shadow-sm transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100/70"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_PROBATION">On probation</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="NOTICE_PERIOD">Notice period</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_HOLD">On hold</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      ) : !data?.employees.length ? (
        <EmptyState
          icon={Search}
          title="No employees match these filters"
          description="Try a different search term or clear your filters."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.employees.map((emp) => (
              <Card
                key={emp.id}
                hoverable
                className="cursor-pointer border-slate-200/70 bg-gradient-to-br from-white via-white to-[#FBFAFF] shadow-[0_8px_24px_rgba(15,23,42,0.045)] hover:border-brand-200/80 hover:shadow-[0_16px_34px_rgba(91,79,229,0.10)]"
                onClick={() => navigate(`/app/employees/${emp.id}`)}
              >
                <div className="flex items-start justify-between">
                  <Avatar
                    firstName={emp.firstName}
                    lastName={emp.lastName}
                    src={emp.avatarUrl}
                    size="lg"
                  />
                  <StatusBadge status={emp.status} />
                </div>
                <p className="mt-4 font-display text-[16px] font-semibold tracking-[-0.01em] text-slate-900">
                  {emp.firstName} {emp.lastName}
                </p>
                <p className="text-[12.5px] text-ink-faint">
                  {emp.designationTitle}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Badge tone="neutral" className="text-[11px]">
                    {emp.departmentName}
                  </Badge>
                  <span className="font-mono text-[11px] text-ink-faint">
                    {emp.employeeCode}
                  </span>
                </div>
                <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  <p className="flex items-center gap-1.5 truncate">
                    <Mail size={12} /> {emp.email}
                  </p>
                  {emp.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={12} /> {emp.phone}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
            <p className="text-[12px] font-medium text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                leftIcon={<ChevronLeft size={14} />}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                rightIcon={<ChevronRight size={14} />}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a new employee"
        subtitle="They'll be created with a temporary password and can change it after their first login."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit((v) => createMutation.mutate(v))}
              isLoading={createMutation.isPending}
            >
              Add employee
            </Button>
          </>
        }
      >
        <div className="mb-5 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100">
              <UserPlus size={17} />
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-indigo-600">Employee setup</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Create the account and assign the employee to the organization.</p>
            </div>
          </div>
        </div>
        <form className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            required
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <TextField
            label="Last name"
            required
            error={errors.lastName?.message}
            {...register("lastName")}
          />
          <TextField
            label="Work email"
            type="email"
            required
            className="sm:col-span-2"
            error={errors.email?.message}
            {...register("email")}
          />
          <SelectField
            label="Department"
            required
            error={errors.departmentId?.message}
            {...register("departmentId")}
          >
            <option value="">Select department</option>
            {deptData?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Designation"
            required
            error={errors.designationId?.message}
            {...register("designationId")}
          >
            <option value="">Select designation</option>
            {designations?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} {d.departmentName ? `(${d.departmentName})` : ""}
              </option>
            ))}
          </SelectField>
          <SelectField label="Reporting manager" {...register("managerId")}>
            <option value="">No manager (top of hierarchy)</option>
            {managers?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName} — {m.designationTitle}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Date of joining"
            type="date"
            required
            error={errors.dateOfJoining?.message}
            {...register("dateOfJoining")}
          />
          <SelectField label="System role" required {...register("role")}>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
            <option value="RECRUITER">Recruiter</option>
            <option value="FINANCE">Finance</option>
            <option value="HR_ADMIN">HR Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </SelectField>
          <TextField
            label="Temporary password"
            required
            hint="At least 8 characters"
            error={errors.temporaryPassword?.message}
            {...register("temporaryPassword")}
          />
        </form>
      </Modal>
    </div>
  );
}
