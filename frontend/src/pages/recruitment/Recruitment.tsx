import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, MapPin, Users, Briefcase } from "lucide-react";
import { RecruitmentApi, OrganizationApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TextField, SelectField, TextareaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const jobSchema = z.object({
  title: z.string().min(2, "Required"),
  departmentId: z.string().min(1, "Required"),
  designationId: z.string().min(1, "Required"),
  location: z.string().optional(),
  experienceMin: z.coerce.number().min(0),
  experienceMax: z.coerce.number().min(0),
  openings: z.coerce.number().min(1),
  description: z.string().min(10, "Add a fuller description"),
});
type JobForm = z.infer<typeof jobSchema>;

const STAGE_ORDER = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

export default function Recruitment() {
  const navigate = useNavigate();
  const [postOpen, setPostOpen] = useState(false);
  const { data: jobs, isLoading } = useQuery({ queryKey: ["recruitment", "jobs"], queryFn: () => RecruitmentApi.jobs() });
  const { data: pipeline } = useQuery({ queryKey: ["recruitment", "pipeline"], queryFn: RecruitmentApi.pipelineSummary });

  const pipelineData = STAGE_ORDER.map((stage) => ({
    stage: stage.charAt(0) + stage.slice(1).toLowerCase(),
    count: pipeline?.find((p) => p.stage === stage)?.count ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Recruitment"
        subtitle="Manage job postings and track every candidate's journey."
        action={<Button leftIcon={<Plus size={16} />} onClick={() => setPostOpen(true)}>Post a job</Button>}
      />

      <Card className="mb-6">
        <CardHeader title="Pipeline overview" subtitle="Candidates by stage, across all open roles" />
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={pipelineData}>
            <CartesianGrid vertical={false} stroke="#EFEEEB" />
            <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "#8A8FA3" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E7E5E0", fontSize: 13 }} />
            <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#5B4FE5" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-3xl" />)}
        </div>
      ) : !jobs?.length ? (
        <EmptyState icon={Briefcase} title="No job postings yet" description="Post your first role to start building a pipeline." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Card key={job.id} hoverable className="cursor-pointer" onClick={() => navigate(`/app/recruitment/${job.id}`)}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-[16px] font-medium text-ink">{job.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-faint">{job.departmentName} · {job.designationTitle}</p>
                </div>
                <StatusBadge status={job.status} />
              </div>
              <div className="mt-4 flex items-center gap-4 text-[12px] text-ink-faint">
                <span className="flex items-center gap-1.5"><MapPin size={13} /> {job.location}</span>
                <span className="flex items-center gap-1.5"><Users size={13} /> {job.candidateCount} candidates</span>
              </div>
              <div className="mt-3 text-[12px] text-ink-faint">{job.experienceMin}–{job.experienceMax} yrs exp · {job.openings} opening(s)</div>
            </Card>
          ))}
        </div>
      )}

      <PostJobModal open={postOpen} onClose={() => setPostOpen(false)} />
    </div>
  );
}

function PostJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: departments } = useQuery({ queryKey: ["departments"], queryFn: OrganizationApi.departments, enabled: open });
  const { data: designations } = useQuery({ queryKey: ["designations"], queryFn: () => OrganizationApi.designations(), enabled: open });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: { experienceMin: 0, experienceMax: 5, openings: 1, location: "Bengaluru, India" },
  });

  const mutation = useMutation({
    mutationFn: RecruitmentApi.createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      showToast("Job posting created.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Post a new job" size="lg" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Post job</Button>
      </>
    }>
      <form className="grid gap-4 sm:grid-cols-2">
        <TextField label="Job title" required className="sm:col-span-2" error={errors.title?.message} {...register("title")} />
        <SelectField label="Department" required error={errors.departmentId?.message} {...register("departmentId")}>
          <option value="">Select</option>
          {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectField>
        <SelectField label="Designation" required error={errors.designationId?.message} {...register("designationId")}>
          <option value="">Select</option>
          {designations?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </SelectField>
        <TextField label="Location" {...register("location")} />
        <TextField label="Openings" type="number" required {...register("openings")} />
        <TextField label="Min experience (yrs)" type="number" required {...register("experienceMin")} />
        <TextField label="Max experience (yrs)" type="number" required {...register("experienceMax")} />
        <TextareaField label="Job description" required className="sm:col-span-2" error={errors.description?.message} {...register("description")} />
      </form>
    </Modal>
  );
}
