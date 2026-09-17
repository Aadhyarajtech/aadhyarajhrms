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
  Sparkles,
  ShieldCheck,
  Settings2,
} from "lucide-react";
import {
  EmployeesApi,
  OrganizationApi,
  PerformanceApi,
  AttendanceShiftApi,
  type PerformanceCycle,
  type AttendanceShift,
  type AttendanceShiftPayload,
} from "@/lib/endpoints";
import { api, getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { TextField, SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import GovernanceSettings from "./GovernanceSettings";

export default function Settings() {
  const { hasPermission } = useAuth();
  const canManageOrganization = hasPermission("organization.manage");
  const canManageCycles = hasPermission("performance.manage");
  const canManageShifts = hasPermission("attendance.manage");


  const [tab, setTab] = useState(
    canManageOrganization
      ? "departments"
      : canManageCycles
        ? "cycles"
        : canManageShifts
          ? "shifts"
          : "governance",
  );

  const tabs = [
  { key: "departments", label: "Departments" },
  { key: "designations", label: "Designations" },
  { key: "holidays", label: "Holidays" },
  { key: "cycles", label: "Review Cycles" },
  { key: "shifts", label: "Shifts" },
  { key: "governance", label: "Governance" },
];

  const openTab = (nextTab: string, allowed: boolean) => {
    if (allowed) setTab(nextTab);
  };

  return (
    <div className="premium-page space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-[#4f46e5] via-[#6366f1] to-[#2563eb] p-6 text-white shadow-[0_22px_60px_-28px_rgba(79,70,229,0.55)] sm:p-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">
              <Sparkles size={13} /> Organization control center
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Settings & configuration
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
              Configure the organization structure, performance cycles, holiday
              calendar, workforce shifts and governance from one administration
              workspace.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!canManageOrganization}
              onClick={() => openTab("departments", canManageOrganization)}
              className="rounded-2xl border border-white/15 bg-white/10 p-4 text-left backdrop-blur transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Building2 size={18} className="mb-3 text-white/80" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                Structure
              </p>
              <p className="mt-1 text-sm font-semibold">
                Departments & roles
              </p>
              <span className="mt-2 block text-[11px] text-white/60">
                Open configuration →
              </span>
            </button>
            <button
              type="button"
              disabled={!canManageShifts}
              onClick={() => openTab("shifts", canManageShifts)}
              className="rounded-2xl border border-white/15 bg-white/10 p-4 text-left backdrop-blur transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock3 size={18} className="mb-3 text-white/80" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                Workforce
              </p>
              <p className="mt-1 text-sm font-semibold">Calendar & shifts</p>
              <span className="mt-2 block text-[11px] text-white/60">
                Open shifts →
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          disabled={!canManageOrganization}
          onClick={() => openTab("departments", canManageOrganization)}
          className="group rounded-[22px] border border-violet-100 bg-white p-5 text-left shadow-[0_12px_35px_-24px_rgba(79,70,229,0.5)] transition-all hover:-translate-y-1 hover:border-violet-200 hover:shadow-[0_20px_45px_-24px_rgba(79,70,229,0.45)] focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <Settings2 size={19} />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500">
              Core setup
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-ink">
            Organization structure
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-faint">
            Departments and designations keep employee records consistent.
          </p>
          <span className="mt-3 block text-xs font-semibold text-violet-500">
            Open Departments →
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("governance")}
          className="group rounded-[22px] border border-emerald-100 bg-white p-5 text-left shadow-[0_12px_35px_-24px_rgba(16,185,129,0.45)] transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_20px_45px_-24px_rgba(16,185,129,0.4)] focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck size={19} />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              Controlled
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-ink">HR governance</p>
          <p className="mt-1 text-xs leading-5 text-ink-faint">
            Role-aware controls keep sensitive workforce configuration
            protected.
          </p>
          <span className="mt-3 block text-xs font-semibold text-emerald-500">
            Open Governance →
          </span>
        </button>

        <button
          type="button"
          disabled={!canManageCycles}
          onClick={() => openTab("cycles", canManageCycles)}
          className="group rounded-[22px] border border-amber-100 bg-white p-5 text-left shadow-[0_12px_35px_-24px_rgba(245,158,11,0.45)] transition-all hover:-translate-y-1 hover:border-amber-200 hover:shadow-[0_20px_45px_-24px_rgba(245,158,11,0.4)] focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <ClipboardList size={19} />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
              Reviews
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-ink">
            HR calendar & reviews
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-faint">
            Manage performance review cycles and keep HR planning organized.
          </p>
          <span className="mt-3 block text-xs font-semibold text-amber-500">
            Open Review Cycles →
          </span>
        </button>
      </section>

      <section className="rounded-[24px] border border-line/70 bg-white/80 p-2 shadow-[0_15px_40px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
        <Tabs
          tabs={tabs}
          active={tab}
          onChange={setTab}
          className="w-full overflow-x-auto"
        />
      </section>

      <div className="min-w-0">
        {tab === "departments" && canManageOrganization && <DepartmentsTab />}
        {tab === "designations" && canManageOrganization && <DesignationsTab />}
        {tab === "holidays" && canManageOrganization && <HolidaysTab />}
        {tab === "cycles" && canManageCycles && <CyclesTab />}
        {tab === "shifts" && canManageShifts && <ShiftsTab />}
        {tab === "governance" && <GovernanceSettings />}

      </div>
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
      selfWeight: 40,
      managerWeight: 60,
      competencies: "Technical Skills:30, Quality:20, Communication:20, Teamwork:15, Leadership:15",
      selfReviewDueDate: "",
      managerReviewDueDate: "",
      finalReviewDueDate: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (value: any) => {
      const competencies = String(value.competencies ?? "")
        .split(",")
        .map((item: string) => {
          const [name, weight] = item.split(":");
          return { name: String(name ?? "").trim(), weight: Number(weight ?? 0) };
        })
        .filter((item: any) => item.name && Number.isFinite(item.weight));
      return PerformanceApi.createCycle({
        name: value.name, startDate: value.startDate, endDate: value.endDate, type: value.type, purpose: value.purpose,
        ratingScale: [1, 2, 3, 4, 5],
        ratingWeights: { self: Number(value.selfWeight), manager: Number(value.managerWeight) },
        competencies,
        selfReviewDueDate: value.selfReviewDueDate || undefined,
        managerReviewDueDate: value.managerReviewDueDate || undefined,
        finalReviewDueDate: value.finalReviewDueDate || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance", "cycles"] });
      showToast("Review cycle created.");
      reset();
      setOpen(false);
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  const mutationCycleStatus = useMutation<
    PerformanceCycle,
    unknown,
    { id: string; isActive: boolean }
  >({
    mutationFn: ({ id, isActive }) =>
      api
        .patch<{ cycle: PerformanceCycle }>(
          `/performance/cycles/${id}/status`,
          { isActive },
        )
        .then((response) => response.data.cycle),
    onSuccess: (cycle) => {
      queryClient.invalidateQueries({ queryKey: ["performance", "cycles"] });
      showToast(
        cycle.isActive
          ? "Review cycle activated."
          : "Review cycle deactivated.",
      );
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
              <div className="flex items-center gap-2">
                {c.isActive ? (
                  <>
                    <StatusBadge status="ACTIVE" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutationCycleStatus.mutate({ id: c.id, isActive: false })
                      }
                      isLoading={
                        mutationCycleStatus.isPending &&
                        mutationCycleStatus.variables?.id === c.id
                      }
                    >
                      Deactivate
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutationCycleStatus.mutate({ id: c.id, isActive: true })
                    }
                    isLoading={
                      mutationCycleStatus.isPending &&
                      mutationCycleStatus.variables?.id === c.id
                    }
                  >
                    Activate
                  </Button>
                )}
              </div>
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
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Self-review weight (%)" type="number" min={0} max={100} {...register("selfWeight", { valueAsNumber: true })} />
            <TextField label="Manager-review weight (%)" type="number" min={0} max={100} {...register("managerWeight", { valueAsNumber: true })} />
          </div>
          <TextField label="Competencies (name:weight)" placeholder="Technical Skills:30, Communication:20, Teamwork:20" {...register("competencies")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField label="Self-review due" type="date" {...register("selfReviewDueDate")} />
            <TextField label="Manager review due" type="date" {...register("managerReviewDueDate")} />
            <TextField label="Final review due" type="date" {...register("finalReviewDueDate")} />
          </div>
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
