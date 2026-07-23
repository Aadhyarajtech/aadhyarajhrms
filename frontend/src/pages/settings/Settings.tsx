import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Plus, Trash2, Building2, Layers, PartyPopper, ClipboardList } from "lucide-react";
import { OrganizationApi, PerformanceApi } from "@/lib/endpoints";
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

export default function Settings() {
  const [tab, setTab] = useState("departments");
  const tabs = [
    { key: "departments", label: "Departments" },
    { key: "designations", label: "Designations" },
    { key: "holidays", label: "Holidays" },
    { key: "cycles", label: "Review Cycles" },
  ];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure the organization structure and HR calendar." />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6 w-fit" />
      {tab === "departments" && <DepartmentsTab />}
      {tab === "designations" && <DesignationsTab />}
      {tab === "holidays" && <HolidaysTab />}
      {tab === "cycles" && <CyclesTab />}
    </div>
  );
}

function DepartmentsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["departments"], queryFn: OrganizationApi.departments });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { name: "", code: "", description: "", colorHex: "#5B4FE5" } });

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
      <CardHeader title="Departments" action={<Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setOpen(true)}>Add department</Button>} />
      {isLoading ? <Skeleton className="h-48 rounded-2xl" /> : !data?.length ? (
        <EmptyState icon={Building2} title="No departments yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <div key={d.id} className="rounded-2xl border border-line/60 p-4">
              <div className="flex items-center justify-between">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.colorHex }} />
                <Badge tone="neutral">{d.headcount} people</Badge>
              </div>
              <p className="mt-2 text-[14px] font-medium text-ink">{d.name}</p>
              <p className="text-[12px] text-ink-faint">{d.code} {d.headFirstName ? `· Led by ${d.headFirstName} ${d.headLastName}` : ""}</p>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add department" footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Create</Button>
        </>
      }>
        <div className="space-y-4">
          <TextField label="Name" required error={errors.name?.message} {...register("name", { required: true })} />
          <TextField label="Code" required hint="Short uppercase code, e.g. ENG" error={errors.code?.message} {...register("code", { required: true })} />
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
  const { data: departments } = useQuery({ queryKey: ["departments"], queryFn: OrganizationApi.departments });
  const { data, isLoading } = useQuery({ queryKey: ["designations"], queryFn: () => OrganizationApi.designations() });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { title: "", level: 1, departmentId: "" } });

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
      <CardHeader title="Designations" action={<Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setOpen(true)}>Add designation</Button>} />
      {isLoading ? <Skeleton className="h-48 rounded-2xl" /> : !data?.length ? (
        <EmptyState icon={Layers} title="No designations yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-ink-faint"><th className="pb-2 font-medium">Title</th><th className="pb-2 font-medium">Department</th><th className="pb-2 font-medium">Level</th></tr>
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
      <Modal open={open} onClose={() => setOpen(false)} title="Add designation" footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => mutation.mutate({ ...v, level: Number(v.level) }))} isLoading={mutation.isPending}>Create</Button>
        </>
      }>
        <div className="space-y-4">
          <TextField label="Title" required error={errors.title?.message} {...register("title", { required: true })} />
          <SelectField label="Department" required {...register("departmentId", { required: true })}>
            <option value="">Select</option>
            {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectField>
          <TextField label="Level" type="number" min={1} max={10} required {...register("level")} />
        </div>
      </Modal>
    </Card>
  );
}

function HolidaysTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["holidays"], queryFn: () => OrganizationApi.holidays() });
  const { register, handleSubmit, reset } = useForm({ defaultValues: { name: "", date: "", isOptional: false } });

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
      <CardHeader title="Holiday calendar" action={<Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setOpen(true)}>Add holiday</Button>} />
      {isLoading ? <Skeleton className="h-48 rounded-2xl" /> : !data?.length ? (
        <EmptyState icon={PartyPopper} title="No holidays configured" />
      ) : (
        <div className="space-y-2">
          {data.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-50 text-success-700"><PartyPopper size={15} /></span>
                <div>
                  <p className="text-[13px] font-medium text-ink">{h.name} {h.isOptional && <Badge tone="neutral" className="ml-1">Optional</Badge>}</p>
                  <p className="text-[12px] text-ink-faint">{formatDate(h.date)}</p>
                </div>
              </div>
              <button onClick={() => deleteMutation.mutate(h.id)} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger-50 hover:text-danger-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Add holiday" footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => createMutation.mutate(v))} isLoading={createMutation.isPending}>Add</Button>
        </>
      }>
        <div className="space-y-4">
          <TextField label="Name" required {...register("name", { required: true })} />
          <TextField label="Date" type="date" required {...register("date", { required: true })} />
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" {...register("isOptional")} className="rounded accent-brand-500" /> Optional holiday
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
  const { data, isLoading } = useQuery({ queryKey: ["performance", "cycles"], queryFn: PerformanceApi.cycles });
  const { register, handleSubmit, reset } = useForm({ defaultValues: { name: "", startDate: "", endDate: "" } });

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
      <CardHeader title="Performance review cycles" action={<Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setOpen(true)}>New cycle</Button>} />
      {isLoading ? <Skeleton className="h-32 rounded-2xl" /> : !data?.length ? (
        <EmptyState icon={ClipboardList} title="No cycles created yet" />
      ) : (
        <div className="space-y-2">
          {data.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-ink">{c.name}</p>
                <p className="text-[12px] text-ink-faint">{formatDate(c.startDate)} – {formatDate(c.endDate)}</p>
              </div>
              {c.isActive && <StatusBadge status="ACTIVE" />}
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New review cycle" footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Create</Button>
        </>
      }>
        <div className="space-y-4">
          <TextField label="Name" required placeholder="e.g. H2 2026" {...register("name", { required: true })} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Start date" type="date" required {...register("startDate", { required: true })} />
            <TextField label="End date" type="date" required {...register("endDate", { required: true })} />
          </div>
        </div>
      </Modal>
    </Card>
  );
}
