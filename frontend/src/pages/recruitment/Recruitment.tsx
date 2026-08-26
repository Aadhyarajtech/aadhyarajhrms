import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Briefcase,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import {
  RecruitmentApi,
  OrganizationApi,
} from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import {
  TextField,
  SelectField,
  TextareaField,
} from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import {
  Skeleton,
  EmptyState,
} from "@/components/ui/EmptyState";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/* =========================================================
   JOB REQUISITION FORM
========================================================= */

const jobSchema = z
  .object({
    title: z.string().min(2, "Job title is required"),

    departmentId: z
      .string()
      .min(1, "Department is required"),

    designationId: z
      .string()
      .min(1, "Designation is required"),

    location: z.string().optional(),

    employmentType: z.enum([
      "FULL_TIME",
      "PART_TIME",
      "CONTRACT",
      "INTERN",
    ]),

    experienceMin: z.coerce
      .number()
      .min(0, "Minimum experience cannot be negative"),

    experienceMax: z.coerce
      .number()
      .min(0, "Maximum experience cannot be negative"),

    openings: z.coerce
      .number()
      .int()
      .min(1, "At least one opening is required"),

    budgetCtc: z.coerce
      .number()
      .min(0, "Budget cannot be negative")
      .optional(),

    approvalLevelRequired: z.coerce
      .number()
      .int()
      .min(1)
      .max(10),

    postingChannels: z.array(z.string()).default(["CAREERS"]),

    screeningQuestionsText: z.string().optional(),

    hiringMode: z.enum([
      "STANDARD",
      "WALK_IN",
      "CAMPUS",
    ]),

    skillsText: z.string().optional(),

    description: z
      .string()
      .min(10, "Add a fuller job description"),
  })
  .refine(
    (data) => data.experienceMax >= data.experienceMin,
    {
      message:
        "Maximum experience must be greater than or equal to minimum experience",
      path: ["experienceMax"],
    },
  );

type JobForm = z.infer<typeof jobSchema>;

/* =========================================================
   PIPELINE
========================================================= */

const STAGE_ORDER = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

/* =========================================================
   RECRUITMENT PAGE
========================================================= */

export default function Recruitment() {
  const navigate = useNavigate();
  const [postOpen, setPostOpen] = useState(false);

  const {
    data: jobs,
    isLoading,
  } = useQuery({
    queryKey: ["recruitment", "jobs"],
    queryFn: () => RecruitmentApi.jobs(),
  });

  const {
    data: pipeline,
  } = useQuery({
    queryKey: ["recruitment", "pipeline"],
    queryFn: RecruitmentApi.pipelineSummary,
  });

  const pipelineData = STAGE_ORDER.map((stage) => ({
    stage:
      stage.charAt(0) +
      stage.slice(1).toLowerCase(),
    count:
      pipeline?.find(
        (item) => item.stage === stage,
      )?.count ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Recruitment"
        subtitle="Manage job requisitions, postings, and every candidate's journey."
        action={
          <Button
            leftIcon={<Plus size={16} />}
            onClick={() => setPostOpen(true)}
          >
            Post a job
          </Button>
        }
      />

      {/* =====================================================
          PIPELINE OVERVIEW
      ===================================================== */}

      <Card className="mb-6">
        <CardHeader
          title="Pipeline overview"
          subtitle="Candidates by stage, across all open roles"
        />

        <ResponsiveContainer
          width="100%"
          height={180}
        >
          <BarChart data={pipelineData}>
            <CartesianGrid
              vertical={false}
              stroke="#EFEEEB"
            />

            <XAxis
              dataKey="stage"
              tick={{
                fontSize: 11,
                fill: "#8A8FA3",
              }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis hide />

            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #E7E5E0",
                fontSize: 13,
              }}
            />

            <Bar
              dataKey="count"
              radius={[8, 8, 0, 0]}
              fill="#5B4FE5"
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* =====================================================
          JOB LIST
      ===================================================== */}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map(
            (_, index) => (
              <Skeleton
                key={index}
                className="h-48 rounded-3xl"
              />
            ),
          )}
        </div>
      ) : !jobs?.length ? (
        <EmptyState
          icon={Briefcase}
          title="No job postings yet"
          description="Create your first job requisition to start building your recruitment pipeline."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Card
              key={job.id}
              hoverable
              className="cursor-pointer"
              onClick={() =>
                navigate(
                  `/app/recruitment/${job.id}`,
                )
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[16px] font-medium text-ink">
                    {job.title}
                  </p>

                  <p className="mt-0.5 text-[12.5px] text-ink-faint">
                    {job.departmentName} ·{" "}
                    {job.designationTitle}
                  </p>
                </div>

                <StatusBadge
                  status={job.status}
                />
              </div>

              <div className="mt-4 flex items-center gap-4 text-[12px] text-ink-faint">
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} />
                  {job.location}
                </span>

                <span className="flex items-center gap-1.5">
                  <Users size={13} />
                  {job.candidateCount} candidates
                </span>
              </div>

              <div className="mt-3 text-[12px] text-ink-faint">
                {job.experienceMin}–{job.experienceMax} yrs exp ·{" "}
                {job.openings} opening(s)
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* =====================================================
          POST JOB MODAL
      ===================================================== */}

      <PostJobModal
        open={postOpen}
        onClose={() => setPostOpen(false)}
      />
    </div>
  );
}

/* =========================================================
   POST JOB MODAL
========================================================= */

function PostJobModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: departments,
  } = useQuery({
    queryKey: ["departments"],
    queryFn: OrganizationApi.departments,
    enabled: open,
  });

 const {
  data: designations,
} = useQuery({
  queryKey: ["designations"],
  queryFn: () => OrganizationApi.designations(),
  enabled: open,
});

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      location: "Bengaluru, India",
      employmentType: "FULL_TIME",
      experienceMin: 0,
      experienceMax: 5,
      openings: 1,
      budgetCtc: undefined,
      approvalLevelRequired: 1,
      postingChannels: ["CAREERS"],
      screeningQuestionsText: "",
      hiringMode: "STANDARD",
      skillsText: "",
      description: "",
    },
  });

  const selectedChannels =
    watch("postingChannels") ?? [];

  const mutation = useMutation({
    mutationFn: RecruitmentApi.createJob,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["recruitment"],
      });

      showToast(
        "Job requisition created successfully.",
      );

      reset();
      onClose();
    },

    onError: (error) => {
      showToast(
        getErrorMessage(error),
        "error",
      );
    },
  });

  /* =======================================================
     CHANNEL TOGGLE
  ======================================================= */

  const toggleChannel = (
    channel: string,
  ) => {
    const current =
      selectedChannels ?? [];

    if (current.includes(channel)) {
      setValue(
        "postingChannels",
        current.filter(
          (item) => item !== channel,
        ),
      );
    } else {
      setValue(
        "postingChannels",
        [...current, channel],
      );
    }
  };

  /* =======================================================
     SUBMIT
  ======================================================= */

  const submitJob = (values: JobForm) => {
    const screeningQuestions =
      values.screeningQuestionsText
        ? values.screeningQuestionsText
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    const skills =
      values.skillsText
        ? values.skillsText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    const payload = {
      title: values.title,
      departmentId:
        values.departmentId,
      designationId:
        values.designationId,

      location:
        values.location ||
        "Bengaluru, India",

      employmentType:
        values.employmentType,

      experienceMin:
        values.experienceMin,

      experienceMax:
        values.experienceMax,

      description:
        values.description,

      openings:
        values.openings,

      headcount:
        values.openings,

      budgetCtc:
        values.budgetCtc,

      approvalLevelRequired:
        values.approvalLevelRequired,

      postingChannels:
        values.postingChannels,

      screeningQuestions,

      hiringMode:
        values.hiringMode,

      skills,
    };

    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Job Requisition"
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit(submitJob)}
            isLoading={mutation.isPending}
          >
            Submit Requisition
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={handleSubmit(submitJob)}
      >
        {/* =================================================
            BASIC INFORMATION
        ================================================= */}

        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-semibold text-ink">
            Basic information
          </p>

          <p className="text-xs text-ink-faint">
            Define the role and organizational details.
          </p>
        </div>

        <TextField
          label="Job title"
          required
          className="sm:col-span-2"
          error={errors.title?.message}
          {...register("title")}
        />

        <SelectField
          label="Department"
          required
          error={
            errors.departmentId?.message
          }
          {...register("departmentId")}
        >
          <option value="">
            Select department
          </option>

          {departments?.map((department) => (
            <option
              key={department.id}
              value={department.id}
            >
              {department.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Designation"
          required
          error={
            errors.designationId?.message
          }
          {...register("designationId")}
        >
          <option value="">
            Select designation
          </option>

          {designations?.map(
            (designation) => (
              <option
                key={designation.id}
                value={designation.id}
              >
                {designation.title}
              </option>
            ),
          )}
        </SelectField>

        <TextField
          label="Location"
          placeholder="Bengaluru, India"
          {...register("location")}
        />

        <SelectField
          label="Employment type"
          required
          {...register(
            "employmentType",
          )}
        >
          <option value="FULL_TIME">
            Full Time
          </option>

          <option value="PART_TIME">
            Part Time
          </option>

          <option value="CONTRACT">
            Contract
          </option>

          <option value="INTERN">
            Intern
          </option>
        </SelectField>

        {/* =================================================
            HEADCOUNT
        ================================================= */}

        <div className="sm:col-span-2 mt-1">
          <p className="mb-1 text-sm font-semibold text-ink">
            Hiring requirements
          </p>

          <p className="text-xs text-ink-faint">
            Specify headcount, experience and approved
            compensation range.
          </p>
        </div>

        <TextField
          label="Openings"
          type="number"
          min="1"
          required
          error={errors.openings?.message}
          {...register("openings")}
        />

        <TextField
          label="Maximum budget / CTC per employee"
          type="number"
          min="0"
          placeholder="Optional"
          error={errors.budgetCtc?.message}
          {...register("budgetCtc")}
        />

        <TextField
          label="Minimum experience (years)"
          type="number"
          min="0"
          required
          error={
            errors.experienceMin?.message
          }
          {...register("experienceMin")}
        />

        <TextField
          label="Maximum experience (years)"
          type="number"
          min="0"
          required
          error={
            errors.experienceMax?.message
          }
          {...register("experienceMax")}
        />

        {/* =================================================
            APPROVAL
        ================================================= */}

        <div className="sm:col-span-2 mt-1">
          <p className="mb-1 text-sm font-semibold text-ink">
            Approval workflow
          </p>

          <p className="text-xs text-ink-faint">
            The requisition remains on hold until the
            required approval levels are completed.
          </p>
        </div>

        <SelectField
          label="Approval levels required"
          required
          error={
            errors.approvalLevelRequired
              ?.message
          }
          {...register(
            "approvalLevelRequired",
          )}
        >
          <option value="1">
            1 level
          </option>

          <option value="2">
            2 levels
          </option>

          <option value="3">
            3 levels
          </option>

          <option value="4">
            4 levels
          </option>

          <option value="5">
            5 levels
          </option>
        </SelectField>

        <SelectField
          label="Hiring mode"
          required
          {...register("hiringMode")}
        >
          <option value="STANDARD">
            Standard recruitment
          </option>

          <option value="WALK_IN">
            Walk-in recruitment
          </option>

          <option value="CAMPUS">
            Campus recruitment
          </option>
        </SelectField>

        {/* =================================================
            POSTING CHANNELS
        ================================================= */}

        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium text-ink">
            Posting channels
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["CAREERS", "Company Careers Page"],
              ["LINKEDIN", "LinkedIn"],
              ["NAUKRI", "Naukri"],
              ["INDEED", "Indeed"],
              ["REFERRALS", "Employee Referrals"],
            ].map(
              ([value, label]) => {
                const checked =
                  selectedChannels.includes(
                    value,
                  );

                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                      checked
                        ? "border-brand-300 bg-brand-50"
                        : "border-line hover:bg-canvas"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleChannel(
                          value,
                        )
                      }
                      className="h-4 w-4"
                    />

                    <span>
                      {label}
                    </span>
                  </label>
                );
              },
            )}
          </div>
        </div>

        {/* =================================================
            SKILLS
        ================================================= */}

        <TextField
          label="Required skills"
          placeholder="React, Node.js, MongoDB"
          className="sm:col-span-2"
          {...register("skillsText")}
        />

        <p className="sm:col-span-2 -mt-3 text-[11px] text-ink-faint">
          Separate skills with commas.
        </p>

        {/* =================================================
            SCREENING QUESTIONS
        ================================================= */}

        <TextareaField
          label="Screening questions"
          placeholder={
            "Do you have 4+ years of experience?\nAre you willing to relocate?"
          }
          className="sm:col-span-2"
          error={
            errors.screeningQuestionsText
              ?.message
          }
          {...register(
            "screeningQuestionsText",
          )}
        />

        <p className="sm:col-span-2 -mt-3 text-[11px] text-ink-faint">
          Enter one question per line.
        </p>

        {/* =================================================
            DESCRIPTION
        ================================================= */}

        <TextareaField
          label="Job description"
          required
          className="sm:col-span-2"
          error={
            errors.description?.message
          }
          placeholder="Describe responsibilities, qualifications, expectations and other requirements..."
          {...register("description")}
        />
      </form>
    </Modal>
  );
}