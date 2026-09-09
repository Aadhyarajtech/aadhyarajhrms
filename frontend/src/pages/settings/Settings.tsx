import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Plus,
  Trash2,
  Building2,
  Layers,
  PartyPopper,
  ClipboardList,
  Clock3,
  MapPin,
  Users,
} from "lucide-react";
import {
  EmployeesApi,
  OrganizationApi,
  PerformanceApi,
  AttendanceShiftApi,
  type AttendanceShift,
  type AttendanceShiftPayload,
} from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { TextField, SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

export default function Settings() {
  const { user } = useAuth();
  const canManageShifts =
    user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN";
  const [tab, setTab] = useState("departments");
  const tabs = [
    { key: "departments", label: "Departments" },
    { key: "designations", label: "Designations" },
    { key: "holidays", label: "Holidays" },
    { key: "cycles", label: "Review Cycles" },
    ...(canManageShifts ? [{ key: "shifts", label: "Shifts" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure the organization structure and HR calendar."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "departments" && <DepartmentsTab />}
      {tab === "designations" && <DesignationsTab />}
      {tab === "holidays" && <HolidaysTab />}
      {tab === "cycles" && <CyclesTab />}
      {tab === "shifts" && canManageShifts && <ShiftsTab />}
    </div>
  );
}

function DepartmentsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: OrganizationApi.departments,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: { name: "", code: "", description: "", colorHex: "#5B4FE5" },
  });

  const mutation = useMutation({
    mutationFn: OrganizationApi.createDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      showToast("Department created.");
      reset();
      setOpen(false);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Card>
      <CardHeader
        title="Departments"
        action={
          <Button
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setOpen(true)}
          >
            Add department
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState icon={Building2} title="No departments yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <div key={d.id} className="rounded-2xl border border-line/60 p-4">
              <div className="flex items-center justify-between">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: d.colorHex }}
                />
                <Badge tone="neutral">{d.headcount} people</Badge>
              </div>
              <p className="mt-2 text-[14px] font-medium text-ink">{d.name}</p>
              <p className="text-[12px] text-ink-faint">
                {d.code}{" "}
                {d.headFirstName
                  ? `· Led by ${d.headFirstName} ${d.headLastName}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add department"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit((v) => mutation.mutate(v))}
              isLoading={mutation.isPending}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Name"
            required
            error={errors.name?.message}
            {...register("name", { required: true })}
          />
          <TextField
            label="Code"
            required
            hint="Short uppercase code, e.g. ENG"
            error={errors.code?.message}
            {...register("code", { required: true })}
          />
          <TextField label="Description" {...register("description")} />
          <TextField label="Color" type="color" {...register("colorHex")} />
        </div>
      </Modal>
    </Card>
  );
}

function DesignationsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: OrganizationApi.departments,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["designations"],
    queryFn: () => OrganizationApi.designations(),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ defaultValues: { title: "", level: 1, departmentId: "" } });

  const mutation = useMutation({
    mutationFn: OrganizationApi.createDesignation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designations"] });
      showToast("Designation created.");
      reset();
      setOpen(false);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Card>
      <CardHeader
        title="Designations"
        action={
          <Button
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setOpen(true)}
          >
            Add designation
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState icon={Layers} title="No designations yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-ink-faint">
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">Department</th>
                <th className="pb-2 font-medium">Level</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-t border-line/60">
                  <td className="py-2.5 font-medium text-ink">{d.title}</td>
                  <td className="py-2.5 text-ink-faint">{d.departmentName}</td>
                  <td className="py-2.5 text-ink-faint">{d.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add designation"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit((v) =>
                mutation.mutate({ ...v, level: Number(v.level) }),
              )}
              isLoading={mutation.isPending}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Title"
            required
            error={errors.title?.message}
            {...register("title", { required: true })}
          />
          <SelectField
            label="Department"
            required
            {...register("departmentId", { required: true })}
          >
            <option value="">Select</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Level"
            type="number"
            min={1}
            max={10}
            required
            {...register("level")}
          />
        </div>
      </Modal>
    </Card>
  );
}

function HolidaysTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["holidays"],
    queryFn: () => OrganizationApi.holidays(),
  });
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", date: "", isOptional: false },
  });

  const createMutation = useMutation({
    mutationFn: OrganizationApi.createHoliday,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      showToast("Holiday added.");
      reset();
      setOpen(false);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });
  const deleteMutation = useMutation({
    mutationFn: OrganizationApi.deleteHoliday,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["holidays"] }),
  });

  return (
    <Card>
      <CardHeader
        title="Holiday calendar"
        action={
          <Button
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setOpen(true)}
          >
            Add holiday
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState icon={PartyPopper} title="No holidays configured" />
      ) : (
        <div className="space-y-2">
          {data.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-50 text-success-700">
                  <PartyPopper size={15} />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {h.name}{" "}
                    {h.isOptional && (
                      <Badge tone="neutral" className="ml-1">
                        Optional
                      </Badge>
                    )}
                  </p>
                  <p className="text-[12px] text-ink-faint">
                    {formatDate(h.date)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(h.id)}
                className="rounded-lg p-1.5 text-ink-faint hover:bg-danger-50 hover:text-danger-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add holiday"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit((v) => createMutation.mutate(v))}
              isLoading={createMutation.isPending}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Name"
            required
            {...register("name", { required: true })}
          />
          <TextField
            label="Date"
            type="date"
            required
            {...register("date", { required: true })}
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              {...register("isOptional")}
              className="rounded accent-brand-500"
            />{" "}
            Optional holiday
          </label>
        </div>
      </Modal>
    </Card>
  );
}

function CyclesTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["performance", "cycles"],
    queryFn: PerformanceApi.cycles,
  });
  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      name: "",
      startDate: "",
      endDate: "",
      type: "ANNUAL",
      purpose: "",
    },
  });

  const mutation = useMutation({
    mutationFn: PerformanceApi.createCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "cycles"] });
      showToast("Review cycle created.");
      reset();
      setOpen(false);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Card>
      <CardHeader
        title="Performance review cycles"
        action={
          <Button
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setOpen(true)}
          >
            New cycle
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : !data?.length ? (
        <EmptyState icon={ClipboardList} title="No cycles created yet" />
      ) : (
        <div className="space-y-2">
          {data.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5"
            >
              <div>
                <p className="text-[13px] font-medium text-ink">{c.name}</p>
                <p className="text-[12px] text-ink-faint">
                  {formatDate(c.startDate)} – {formatDate(c.endDate)}
                </p>
              </div>
              {c.isActive && <StatusBadge status="ACTIVE" />}
            </div>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New review cycle"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit((v) => mutation.mutate(v))}
              isLoading={mutation.isPending}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Name"
            required
            placeholder="e.g. H2 2026"
            {...register("name", { required: true })}
          />
          <label className="block text-[13px] font-medium text-ink-soft">
            Review type
            <select
              {...register("type")}
              className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink"
            >
              <option value="PROBATION">Probation review</option>
              <option value="QUARTERLY">Quarterly review</option>
              <option value="HALF_YEARLY">Half-yearly review</option>
              <option value="ANNUAL">Annual appraisal</option>
              <option value="THREE_SIXTY">360-degree review</option>
              <option value="PIP">PIP review</option>
            </select>
          </label>
          <TextField
            label="Purpose (optional)"
            placeholder="e.g. Goal tracking and mid-course correction"
            {...register("purpose")}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Start date"
              type="date"
              required
              {...register("startDate", { required: true })}
            />
            <TextField
              label="End date"
              type="date"
              required
              {...register("endDate", { required: true })}
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function ShiftsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceShift | null>(null);
  const [assigning, setAssigning] = useState<AttendanceShift | null>(null);
  const { data: shifts, isLoading } = useQuery({
    queryKey: ["attendance", "shifts"],
    queryFn: () => AttendanceShiftApi.list(true),
  });
  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: OrganizationApi.departments,
  });

  const createMutation = useMutation({
    mutationFn: AttendanceShiftApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "shifts"] });
      showToast("Shift created.");
      setOpen(false);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      AttendanceShiftApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "shifts"] });
      showToast("Shift updated.");
      setEditing(null);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });
  const assignMutation = useMutation({
    mutationFn: ({ id, employeeIds }: { id: string; employeeIds: string[] }) =>
      AttendanceShiftApi.assign(id, employeeIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "shifts"] });
      showToast("Shift assignments updated.");
      setAssigning(null);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Card>
      <CardHeader
        title="Shift management"
        subtitle="Configure working hours, grace time, breaks, overtime thresholds and employee assignments."
        action={
          <Button
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setOpen(true)}
          >
            Add shift
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !shifts?.length ? (
        <EmptyState icon={Clock3} title="No shifts configured" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shifts.map((shift) => (
            <div
              key={shift.id}
              className="rounded-2xl border border-line/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-medium text-ink">
                      {shift.name}
                    </p>
                    {shift.isActive ? (
                      <StatusBadge status="ACTIVE" />
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-ink-faint">
                    {shift.code || "No code"} · {shift.startTime} –{" "}
                    {shift.endTime}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(shift)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAssigning(shift)}
                  >
                    Employees
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                <div className="rounded-xl bg-surface-muted p-2">
                  <span className="block text-ink-faint">Standard</span>
                  <b>{shift.standardHours}h</b>
                </div>
                <div className="rounded-xl bg-surface-muted p-2">
                  <span className="block text-ink-faint">Grace</span>
                  <b>{shift.graceMinutes}m</b>
                </div>
                <div className="rounded-xl bg-surface-muted p-2">
                  <span className="block text-ink-faint">Break</span>
                  <b>{shift.breakMinutes}m</b>
                </div>
                <div className="rounded-xl bg-surface-muted p-2">
                  <span className="block text-ink-faint">OT after</span>
                  <b>{shift.overtimeAfterHours}h</b>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-faint">
                <span>{shift.employeeIds.length} assigned</span>
                {shift.geofence && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} /> Geofence enabled
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ShiftFormModal
        open={open}
        onClose={() => setOpen(false)}
        departments={departments ?? []}
        onSubmit={(payload: AttendanceShiftPayload) =>
          createMutation.mutate(payload)
        }
        isLoading={createMutation.isPending}
      />
      <ShiftFormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        departments={departments ?? []}
        initial={editing ?? undefined}
        onSubmit={(payload: Partial<AttendanceShiftPayload>) =>
          editing && updateMutation.mutate({ id: editing.id, payload })
        }
        isLoading={updateMutation.isPending}
      />
      {assigning && (
        <ShiftAssignmentModal
          shift={assigning}
          onClose={() => setAssigning(null)}
          onSubmit={(employeeIds) =>
            assignMutation.mutate({ id: assigning.id, employeeIds })
          }
          isLoading={assignMutation.isPending}
        />
      )}
    </Card>
  );
}

function ShiftFormModal({
  open,
  onClose,
  departments,
  initial,
  onSubmit,
  isLoading,
}: any) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: initial
      ? {
          name: initial.name,
          code: initial.code ?? "",
          startTime: initial.startTime,
          endTime: initial.endTime,
          standardHours: initial.standardHours,
          graceMinutes: initial.graceMinutes,
          breakMinutes: initial.breakMinutes,
          overtimeAfterHours: initial.overtimeAfterHours,
          departmentId: initial.departmentId ?? "",
          isActive: initial.isActive,
        }
      : {
          name: "",
          code: "",
          startTime: "10:00",
          endTime: "19:00",
          standardHours: 8,
          graceMinutes: 15,
          breakMinutes: 60,
          overtimeAfterHours: 8,
          departmentId: "",
          isActive: true,
        },
  });

  const submit = (v: any) =>
    onSubmit({
      ...v,
      standardHours: Number(v.standardHours),
      graceMinutes: Number(v.graceMinutes),
      breakMinutes: Number(v.breakMinutes),
      overtimeAfterHours: Number(v.overtimeAfterHours),
      departmentId: v.departmentId || null,
      isActive: Boolean(v.isActive),
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit shift" : "Add shift"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isLoading}>
            {initial ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Shift name"
            required
            error={errors.name?.message as string}
            {...register("name", { required: "Shift name is required" })}
          />
          <TextField
            label="Code"
            hint="Optional unique code"
            {...register("code")}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start time"
            type="time"
            required
            {...register("startTime", { required: true })}
          />
          <TextField
            label="End time"
            type="time"
            required
            {...register("endTime", { required: true })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Standard hours"
            type="number"
            min={0.1}
            max={24}
            step={0.25}
            required
            {...register("standardHours", { required: true })}
          />
          <TextField
            label="Overtime after (hours)"
            type="number"
            min={0.1}
            max={24}
            step={0.25}
            required
            {...register("overtimeAfterHours", { required: true })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Grace minutes"
            type="number"
            min={0}
            max={1440}
            {...register("graceMinutes")}
          />
          <TextField
            label="Break minutes"
            type="number"
            min={0}
            max={1440}
            {...register("breakMinutes")}
          />
        </div>
        <SelectField label="Department default" {...register("departmentId")}>
          <option value="">Organization-wide</option>
          {departments.map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        {initial && (
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              {...register("isActive")}
              className="rounded accent-brand-500"
            />{" "}
            Active shift
          </label>
        )}
      </div>
    </Modal>
  );
}

function ShiftAssignmentModal({
  shift,
  onClose,
  onSubmit,
  isLoading,
}: {
  shift: AttendanceShift;
  onClose: () => void;
  onSubmit: (employeeIds: string[]) => void;
  isLoading: boolean;
}) {
  const { data, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "shift-assignment"],
    queryFn: () =>
      EmployeesApi.list({ status: "ACTIVE", page: 1, pageSize: 500 }),
  });
  const [selected, setSelected] = useState<string[]>(shift.employeeIds);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign employees — ${shift.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(selected)} isLoading={isLoading}>
            Save assignments
          </Button>
        </>
      }
    >
      {employeesLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : !data?.employees.length ? (
        <EmptyState icon={Users} title="No active employees" />
      ) : (
        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {data.employees.map((employee) => (
            <label
              key={employee.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(employee.id)}
                onChange={() => toggle(employee.id)}
                className="rounded accent-brand-500"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">
                  {employee.firstName} {employee.lastName}
                </span>
                <span className="block text-[11px] text-ink-faint">
                  {employee.employeeCode} · {employee.departmentName}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
