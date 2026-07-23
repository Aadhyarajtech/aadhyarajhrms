import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Plus, ChevronLeft, ChevronRight, Mail, Phone } from "lucide-react";
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

const PAGE_SIZE = 12;
const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

const addEmployeeSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Enter a valid email."),
  departmentId: z.string().min(1, "Select a department"),
  designationId: z.string().min(1, "Select a designation"),
  managerId: z.string().optional(),
  dateOfJoining: z.string().min(1, "Required"),
  role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "RECRUITER", "FINANCE", "EMPLOYEE"]),
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
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const { data: deptData } = useQuery({ queryKey: ["departments"], queryFn: OrganizationApi.departments });
  const { data: designations } = useQuery({
    queryKey: ["designations"],
    queryFn: () => OrganizationApi.designations(),
  });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: EmployeesApi.managers, enabled: addOpen });

  const { data, isLoading } = useQuery({
    queryKey: ["employees", { search, departmentId, status, page }],
    queryFn: () => EmployeesApi.list({ search: search || undefined, departmentId: departmentId || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddEmployeeForm>({
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

  const totalPages = useMemo(() => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1), [data]);

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={data ? `${data.total} people across the organization` : "Loading your organization..."}
        action={isAdmin && (
          <Button leftIcon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            Add employee
          </Button>
        )}
      />

      <Card className="mb-5 !p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, code, or email..."
              className="h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <select
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
            className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink-soft focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">All departments</option>
            {deptData?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink-soft focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="NOTICE_PERIOD">Notice period</option>
            <option value="RESIGNED">Resigned</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}
        </div>
      ) : !data?.employees.length ? (
        <EmptyState icon={Search} title="No employees match these filters" description="Try a different search term or clear your filters." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.employees.map((emp) => (
              <Card
                key={emp.id}
                hoverable
                className="cursor-pointer"
                onClick={() => navigate(`/app/employees/${emp.id}`)}
              >
                <div className="flex items-start justify-between">
                  <Avatar firstName={emp.firstName} lastName={emp.lastName} src={emp.avatarUrl} size="lg" />
                  <StatusBadge status={emp.status} />
                </div>
                <p className="mt-3 font-display text-[15px] font-medium text-ink">{emp.firstName} {emp.lastName}</p>
                <p className="text-[12.5px] text-ink-faint">{emp.designationTitle}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge tone="neutral" className="text-[11px]">{emp.departmentName}</Badge>
                  <span className="font-mono text-[11px] text-ink-faint">{emp.employeeCode}</span>
                </div>
                <div className="mt-3 space-y-1 border-t border-line/70 pt-3 text-[12px] text-ink-faint">
                  <p className="flex items-center gap-1.5 truncate"><Mail size={12} /> {emp.email}</p>
                  {emp.phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {emp.phone}</p>}
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-[13px] text-ink-faint">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} leftIcon={<ChevronLeft size={14} />}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} rightIcon={<ChevronRight size={14} />}>
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
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit((v) => createMutation.mutate(v))} isLoading={createMutation.isPending}>Add employee</Button>
          </>
        }
      >
        <form className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" required error={errors.firstName?.message} {...register("firstName")} />
          <TextField label="Last name" required error={errors.lastName?.message} {...register("lastName")} />
          <TextField label="Work email" type="email" required className="sm:col-span-2" error={errors.email?.message} {...register("email")} />
          <SelectField label="Department" required error={errors.departmentId?.message} {...register("departmentId")}>
            <option value="">Select department</option>
            {deptData?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectField>
          <SelectField label="Designation" required error={errors.designationId?.message} {...register("designationId")}>
            <option value="">Select designation</option>
            {designations?.map((d) => <option key={d.id} value={d.id}>{d.title} {d.departmentName ? `(${d.departmentName})` : ""}</option>)}
          </SelectField>
          <SelectField label="Reporting manager" {...register("managerId")}>
            <option value="">No manager (top of hierarchy)</option>
            {managers?.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} — {m.designationTitle}</option>)}
          </SelectField>
          <TextField label="Date of joining" type="date" required error={errors.dateOfJoining?.message} {...register("dateOfJoining")} />
          <SelectField label="System role" required {...register("role")}>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
            <option value="RECRUITER">Recruiter</option>
            <option value="FINANCE">Finance</option>
            <option value="HR_ADMIN">HR Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </SelectField>
          <TextField label="Temporary password" required hint="At least 8 characters" error={errors.temporaryPassword?.message} {...register("temporaryPassword")} />
        </form>
      </Modal>
    </div>
  );
}
