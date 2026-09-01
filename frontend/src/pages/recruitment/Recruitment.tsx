import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Briefcase, FileText, MapPin, Plus, Users } from "lucide-react";
import { RecruitmentApi, OrganizationApi } from "@/lib/endpoints";
import { api, getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TextField, SelectField, TextareaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
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
   ROLE TEMPLATES
========================================================= */

const ROLE_TEMPLATES = {
  ENGINEERING: {
    label: "Engineering",
    description:
      "We are looking for a skilled engineering professional to design, develop, test, and maintain high-quality software solutions. The candidate will collaborate with cross-functional teams, participate in code reviews, and contribute to the continuous improvement of our products and engineering processes.",
    skills: "Problem Solving, Programming, System Design, Git, Communication",
    approvalLevelRequired: 1,
  },

  DATA: {
    label: "Data",
    description:
      "We are looking for a data professional to collect, analyze, transform, and manage data for business and technology initiatives. The candidate will work with stakeholders to build reliable data solutions and deliver meaningful insights.",
    skills: "SQL, Python, Data Analysis, Problem Solving, Communication",
    approvalLevelRequired: 1,
  },

  HR: {
    label: "Human Resources",
    description:
      "We are looking for an HR professional to support people operations, recruitment, employee engagement, and organizational processes. The candidate will work closely with managers and employees to ensure smooth HR operations.",
    skills:
      "Recruitment, Communication, Employee Relations, HR Operations, Organization",
    approvalLevelRequired: 1,
  },

  SALES: {
    label: "Sales",
    description:
      "We are looking for a sales professional to identify business opportunities, build client relationships, manage the sales pipeline, and contribute to revenue growth.",
    skills:
      "Communication, Negotiation, Lead Generation, CRM, Relationship Management",
    approvalLevelRequired: 1,
  },

  MARKETING: {
    label: "Marketing",
    description:
      "We are looking for a marketing professional to support campaigns, brand initiatives, content creation, digital marketing, and performance analysis.",
    skills:
      "Digital Marketing, Content Marketing, Communication, Analytics, Campaign Management",
    approvalLevelRequired: 1,
  },

  FINANCE: {
    label: "Finance",
    description:
      "We are looking for a finance professional to support financial planning, reporting, budgeting, analysis, and compliance activities.",
    skills:
      "Financial Analysis, Excel, Budgeting, Reporting, Attention to Detail",
    approvalLevelRequired: 1,
  },

  MANAGEMENT: {
    label: "Management",
    description:
      "We are looking for an experienced management professional to lead teams, drive strategic initiatives, manage business outcomes, and collaborate with senior stakeholders.",
    skills:
      "Leadership, People Management, Strategic Planning, Decision Making, Communication",
    approvalLevelRequired: 2,
  },

  SENIOR: {
    label: "Senior Leadership",
    description:
      "We are looking for a senior professional with strong leadership, domain expertise, and strategic decision-making capabilities. The candidate will lead initiatives, mentor team members, and work with leadership on key business objectives.",
    skills:
      "Leadership, Strategic Planning, Decision Making, Stakeholder Management, Mentoring",
    approvalLevelRequired: 2,
  },
} as const;

type RoleCategory = keyof typeof ROLE_TEMPLATES;

/* =========================================================
   JOB REQUISITION FORM
========================================================= */

const jobSchema = z
  .object({
    title: z.string().min(2, "Job title is required"),

    departmentId: z.string().min(1, "Department is required"),

    designationId: z.string().min(1, "Designation is required"),

    roleCategory: z.string().optional(),

    useTemplate: z.boolean(),

    location: z.string().optional(),

    employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),

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

    budgetCtc: z.preprocess((value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }

      const numberValue = Number(value);

      return Number.isNaN(numberValue) ? undefined : numberValue;
    }, z.number().min(0, "Budget cannot be negative").optional()),

    approvalLevelRequired: z.coerce.number().int().min(1).max(10),

    postingChannels: z.array(z.string()).default(["CAREERS"]),

    screeningQuestionsText: z.string().optional(),

    hiringMode: z.enum(["STANDARD", "WALK_IN", "CAMPUS"]),
    walkInDriveDate: z.string().optional(),
    walkInStartTime: z.string().optional(),
    walkInEndTime: z.string().optional(),
    walkInVenue: z.string().optional(),
    walkInCoordinatorName: z.string().optional(),
    walkInCoordinatorContact: z.string().optional(),
    walkInRegistrationDeadline: z.string().optional(),
    walkInExpectedCandidates: z.preprocess(
      (value) => (value === "" ? undefined : Number(value)),
      z.number().int().min(0).optional(),
    ),

    campusCollegeName: z.string().optional(),
    campusLocation: z.string().optional(),
    campusDriveDate: z.string().optional(),
    campusStartTime: z.string().optional(),
    campusEndTime: z.string().optional(),
    campusPlacementCoordinator: z.string().optional(),
    campusCoordinatorContact: z.string().optional(),
    campusExpectedCandidates: z.preprocess(
      (value) => (value === "" ? undefined : Number(value)),
      z.number().int().min(0).optional(),
    ),

    skillsText: z.string().optional(),

    description: z
      .string()
      .min(10, "Job description must contain at least 10 characters")
      .optional(),

    shortlistingCriteria: z.object({
      enabled: z.boolean().default(false),
      minimumJobFitScore: z.coerce.number().min(0).max(100).default(60),
      requiredSkillsText: z.string().optional(),
      minimumExperience: z.coerce.number().min(0).default(0),
    }),
  })
  .refine((data) => data.experienceMax >= data.experienceMin, {
    message:
      "Maximum experience must be greater than or equal to minimum experience",
    path: ["experienceMax"],
  });

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

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["recruitment", "jobs"],
    queryFn: () => RecruitmentApi.jobs(),
  });

  const { data: pipeline } = useQuery({
    queryKey: ["recruitment", "pipeline"],
    queryFn: RecruitmentApi.pipelineSummary,
  });

  const { data: sourceAnalytics } = useQuery({
    queryKey: ["recruitment", "analytics", "sources"],
    queryFn: () =>
      api
        .get<{
          data: Array<{
            source: string;
            applications: number;
            screening: number;
            interviews: number;
            offers: number;
            accepted: number;
            hired: number;
            hireConversionRate: number;
            acceptanceRate: number;
          }>;
        }>("/recruitment/analytics/sources")
        .then((response) => response.data.data ?? []),
  });

  const { data: referralAnalytics } = useQuery({
    queryKey: ["recruitment", "analytics", "referrals"],
    queryFn: () =>
      api
        .get<{
          data: {
            totalReferrals: number;
            inPipeline: number;
            interviewed: number;
            offers: number;
            accepted: number;
            hired: number;
            conversionRate: number;
          };
        }>("/recruitment/analytics/referrals")
        .then((response) => response.data.data),
  });

  const { data: volumeHiringAnalytics } = useQuery({
    queryKey: ["recruitment", "analytics", "volume-hiring"],
    queryFn: () =>
      api
        .get<{
          data: {
            walkIn: {
              source: string;
              applications: number;
              screening: number;
              interviewed: number;
              hired: number;
              conversionRate: number;
            };
            campus: {
              source: string;
              applications: number;
              screening: number;
              interviewed: number;
              hired: number;
              conversionRate: number;
            };
          };
        }>("/recruitment/analytics/volume-hiring")
        .then((response) => response.data.data),
  });

  const pipelineData = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage: stage.charAt(0) + stage.slice(1).toLowerCase(),
        count: pipeline?.find((item) => item.stage === stage)?.count ?? 0,
      })),
    [pipeline],
  );

  return (
    <div>
      <PageHeader
        title="Recruitment"
        subtitle="Manage job requisitions, approvals, postings, and every candidate's journey."
        action={
          <Button
            leftIcon={<Plus size={16} />}
            onClick={() => setPostOpen(true)}
          >
            Create requisition
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader
          title="Pipeline overview"
          subtitle="Candidates by stage across all recruitment roles"
        />

        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={pipelineData}>
            <CartesianGrid vertical={false} stroke="#EFEEEB" />

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

            <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#5B4FE5" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recruitment Source Analytics"
            subtitle="Applications and hiring performance by source"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium">Applications</th>
                  <th className="px-3 py-3 font-medium">Interviews</th>
                  <th className="px-3 py-3 font-medium">Offers</th>
                  <th className="px-3 py-3 font-medium">Hired</th>
                  <th className="px-5 py-3 font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {sourceAnalytics?.length ? (
                  sourceAnalytics.map((item) => (
                    <tr
                      key={item.source}
                      className="border-b border-line/70 last:border-0"
                    >
                      <td className="px-5 py-3 font-medium text-ink">
                        {item.source}
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {item.applications}
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {item.interviews}
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {item.offers}
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{item.hired}</td>
                      <td className="px-5 py-3 font-semibold text-ink">
                        {item.hireConversionRate}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-sm text-ink-faint"
                    >
                      No source analytics available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader
              title="Employee Referrals"
              subtitle="Referral pipeline performance"
            />
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Total", referralAnalytics?.totalReferrals ?? 0],
                ["Pipeline", referralAnalytics?.inPipeline ?? 0],
                ["Offers", referralAnalytics?.offers ?? 0],
                ["Hired", referralAnalytics?.hired ?? 0],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl bg-canvas px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-faint">
              Hire conversion:{" "}
              <span className="font-semibold text-ink">
                {referralAnalytics?.conversionRate ?? 0}%
              </span>
            </p>
          </Card>

          <Card>
            <CardHeader
              title="Volume Hiring"
              subtitle="Walk-in and campus recruitment"
            />
            {[volumeHiringAnalytics?.walkIn, volumeHiringAnalytics?.campus].map(
              (item, index) => (
                <div
                  key={item?.source ?? index}
                  className="mb-3 last:mb-0 rounded-xl border border-line px-3 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink">
                      {item?.source ?? (index === 0 ? "Walk-in" : "Campus")}
                    </p>
                    <p className="text-sm font-semibold text-ink">
                      {item?.conversionRate ?? 0}%
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    {item?.applications ?? 0} applications ·{" "}
                    {item?.interviewed ?? 0} interviews · {item?.hired ?? 0}{" "}
                    hired
                  </p>
                </div>
              ),
            )}
          </Card>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({
            length: 6,
          }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-3xl" />
          ))}
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
              onClick={() => navigate(`/app/recruitment/${job.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[16px] font-medium text-ink">
                    {job.title}
                  </p>

                  <p className="mt-0.5 text-[12.5px] text-ink-faint">
                    {job.departmentName} · {job.designationTitle}
                  </p>
                </div>

                <StatusBadge status={job.status} />
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
                {job.experienceMin}–{job.experienceMax} yrs exp · {job.openings}{" "}
                opening(s)
              </div>

              {job.requisitionStatus && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
                  <FileText size={12} />
                  Requisition:{" "}
                  {String(job.requisitionStatus)
                    .replace(/_/g, " ")
                    .toLowerCase()}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <PostJobModal open={postOpen} onClose={() => setPostOpen(false)} />
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

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: OrganizationApi.departments,
    enabled: open,
  });

  const { data: designations } = useQuery({
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
      title: "",
      departmentId: "",
      designationId: "",
      roleCategory: "",
      useTemplate: true,
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
      walkInDriveDate: "",
      walkInStartTime: "",
      walkInEndTime: "",
      walkInVenue: "",
      walkInCoordinatorName: "",
      walkInCoordinatorContact: "",
      walkInRegistrationDeadline: "",
      walkInExpectedCandidates: undefined,

      campusCollegeName: "",
      campusLocation: "",
      campusDriveDate: "",
      campusStartTime: "",
      campusEndTime: "",
      campusPlacementCoordinator: "",
      campusCoordinatorContact: "",
      campusExpectedCandidates: undefined,
      skillsText: "",
      description: "",
      shortlistingCriteria: {
        enabled: false,
        minimumJobFitScore: 60,
        requiredSkillsText: "",
        minimumExperience: 0,
      },
    },
  });

  const selectedHiringMode = watch("hiringMode");

  const selectedChannels = watch("postingChannels") ?? [];

  const selectedRoleCategory = watch("roleCategory") ?? "";

  const useTemplate = watch("useTemplate");

  const selectedDepartmentId = watch("departmentId");

  const filteredDesignations =
    designations?.filter(
      (designation: any) =>
        !selectedDepartmentId ||
        !designation.departmentId ||
        designation.departmentId === selectedDepartmentId,
    ) ?? [];

  const mutation = useMutation({
    mutationFn: RecruitmentApi.createJob,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["recruitment"],
      });

      showToast("Job requisition created successfully.");

      reset({
        title: "",
        departmentId: "",
        designationId: "",
        roleCategory: "",
        useTemplate: true,
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

        walkInDriveDate: "",
        walkInStartTime: "",
        walkInEndTime: "",
        walkInVenue: "",
        walkInCoordinatorName: "",
        walkInCoordinatorContact: "",
        walkInRegistrationDeadline: "",
        walkInExpectedCandidates: undefined,

        campusCollegeName: "",
        campusLocation: "",
        campusDriveDate: "",
        campusStartTime: "",
        campusEndTime: "",
        campusPlacementCoordinator: "",
        campusCoordinatorContact: "",
        campusExpectedCandidates: undefined,

        skillsText: "",
        description: "",
        shortlistingCriteria: {
          enabled: false,
          minimumJobFitScore: 60,
          requiredSkillsText: "",
          minimumExperience: 0,
        },
      });

      onClose();
    },

    onError: (error) => {
      showToast(getErrorMessage(error), "error");
    },
  });

  const toggleChannel = (channel: string) => {
    const current = selectedChannels ?? [];

    if (current.includes(channel)) {
      setValue(
        "postingChannels",
        current.filter((item) => item !== channel),
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
    } else {
      setValue("postingChannels", [...current, channel], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const applyRoleTemplate = (category: string) => {
    setValue("roleCategory", category, {
      shouldDirty: true,
    });

    if (!category || !useTemplate) {
      return;
    }

    const template = ROLE_TEMPLATES[category as RoleCategory];

    if (!template) {
      return;
    }

    setValue("description", template.description, {
      shouldDirty: true,
      shouldValidate: true,
    });

    setValue("skillsText", template.skills, {
      shouldDirty: true,
    });

    setValue("approvalLevelRequired", template.approvalLevelRequired, {
      shouldDirty: true,
    });
  };

  const submitJob = (values: JobForm) => {
    const screeningQuestions = values.screeningQuestionsText
      ? values.screeningQuestionsText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const skills = values.skillsText
      ? values.skillsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const shortlistingRequiredSkills = values.shortlistingCriteria
      .requiredSkillsText
      ? values.shortlistingCriteria.requiredSkillsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const payload = {
      title: values.title.trim(),

      departmentId: values.departmentId,

      designationId: values.designationId,

      roleCategory: values.roleCategory || undefined,

      useTemplate: values.useTemplate,

      location: values.location?.trim() || "Bengaluru, India",

      employmentType: values.employmentType,

      experienceMin: values.experienceMin,

      experienceMax: values.experienceMax,

      description: values.description?.trim() || undefined,

      openings: values.openings,

      headcount: values.openings,

      budgetCtc: values.budgetCtc,

      approvalLevelRequired: values.approvalLevelRequired,

      postingChannels: values.postingChannels.length
        ? values.postingChannels
        : ["CAREERS"],

      screeningQuestions,

      hiringMode: values.hiringMode,

      walkInDrive:
        values.hiringMode === "WALK_IN"
          ? {
              driveDate: values.walkInDriveDate || null,

              startTime: values.walkInStartTime || null,

              endTime: values.walkInEndTime || null,

              venue: values.walkInVenue?.trim() || null,

              coordinatorName: values.walkInCoordinatorName?.trim() || null,

              coordinatorContact:
                values.walkInCoordinatorContact?.trim() || null,

              registrationDeadline: values.walkInRegistrationDeadline || null,

              expectedCandidates: values.walkInExpectedCandidates ?? null,
            }
          : null,

      campusDrive:
        values.hiringMode === "CAMPUS"
          ? {
              collegeName: values.campusCollegeName?.trim() || null,

              campusLocation: values.campusLocation?.trim() || null,

              driveDate: values.campusDriveDate || null,

              startTime: values.campusStartTime || null,

              endTime: values.campusEndTime || null,

              placementCoordinator:
                values.campusPlacementCoordinator?.trim() || null,

              coordinatorContact:
                values.campusCoordinatorContact?.trim() || null,

              expectedCandidates: values.campusExpectedCandidates ?? null,
            }
          : null,

      shortlistingCriteria: {
        enabled: values.shortlistingCriteria.enabled,
        minimumJobFitScore: values.shortlistingCriteria.minimumJobFitScore,
        requiredSkills: shortlistingRequiredSkills,
        minimumExperience: values.shortlistingCriteria.minimumExperience,
      },

      skills,
    };

    mutation.mutate(payload as any);
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
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-semibold text-ink">
            Basic information
          </p>

          <p className="text-xs text-ink-faint">
            Define the role, organizational details and recruitment
            requirements.
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
          error={errors.departmentId?.message}
          {...register("departmentId", {
            onChange: () => {
              setValue("designationId", "", {
                shouldDirty: true,
              });
            },
          })}
        >
          <option value="">Select department</option>

          {departments?.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
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

          {filteredDesignations.map((designation: any) => (
            <option key={designation.id} value={designation.id}>
              {designation.title}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Role category"
          value={selectedRoleCategory}
          onChange={(event) => applyRoleTemplate(event.target.value)}
        >
          <option value="">Auto detect from job title</option>

          {Object.entries(ROLE_TEMPLATES).map(([value, template]) => (
            <option key={value} value={value}>
              {template.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Employment type"
          required
          {...register("employmentType")}
        >
          <option value="FULL_TIME">Full Time</option>

          <option value="PART_TIME">Part Time</option>

          <option value="CONTRACT">Contract</option>

          <option value="INTERN">Intern</option>
        </SelectField>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3">
            <input
              type="checkbox"
              checked={useTemplate}
              onChange={(event) => {
                const checked = event.target.checked;

                setValue("useTemplate", checked, {
                  shouldDirty: true,
                });

                if (checked && selectedRoleCategory) {
                  applyRoleTemplate(selectedRoleCategory);
                }
              }}
              className="h-4 w-4"
            />

            <div>
              <p className="text-sm font-medium text-ink">Use role template</p>

              <p className="text-xs text-ink-faint">
                Automatically fill the job description and suggested skills from
                the selected role.
              </p>
            </div>
          </label>
        </div>

        <TextField
          label="Location"
          placeholder="Bengaluru, India"
          {...register("location")}
        />

        <div />

        <div className="sm:col-span-2 mt-1">
          <p className="mb-1 text-sm font-semibold text-ink">
            Hiring requirements
          </p>

          <p className="text-xs text-ink-faint">
            Specify headcount, experience and compensation requirements.
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
          error={errors.experienceMin?.message}
          {...register("experienceMin")}
        />

        <TextField
          label="Maximum experience (years)"
          type="number"
          min="0"
          required
          error={errors.experienceMax?.message}
          {...register("experienceMax")}
        />

        <div className="sm:col-span-2 mt-1">
          <p className="mb-1 text-sm font-semibold text-ink">
            Approval workflow
          </p>

          <p className="text-xs text-ink-faint">
            Senior and management roles may automatically require additional
            approval levels.
          </p>
        </div>

        <SelectField
          label="Approval levels required"
          required
          error={errors.approvalLevelRequired?.message}
          {...register("approvalLevelRequired")}
        >
          <option value="1">1 level</option>

          <option value="2">2 levels</option>

          <option value="3">3 levels</option>

          <option value="4">4 levels</option>

          <option value="5">5 levels</option>
        </SelectField>

        {selectedHiringMode === "WALK_IN" && (
          <div className="sm:col-span-2 grid gap-5 rounded-xl border border-line bg-canvas p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-semibold text-ink">
                Walk-in Drive Details
              </p>

              <p className="mt-1 text-xs text-ink-faint">
                Configure the venue, schedule and coordinator details for the
                walk-in drive.
              </p>
            </div>

            <TextField
              label="Drive date"
              type="date"
              required
              {...register("walkInDriveDate")}
            />

            <TextField
              label="Expected candidates"
              type="number"
              min="0"
              placeholder="100"
              {...register("walkInExpectedCandidates")}
            />

            <TextField
              label="Start time"
              type="time"
              required
              {...register("walkInStartTime")}
            />

            <TextField
              label="End time"
              type="time"
              required
              {...register("walkInEndTime")}
            />

            <TextField
              label="Venue"
              required
              className="sm:col-span-2"
              placeholder="Office address or walk-in venue"
              {...register("walkInVenue")}
            />

            <TextField
              label="Coordinator name"
              required
              placeholder="HR / Recruitment coordinator"
              {...register("walkInCoordinatorName")}
            />

            <TextField
              label="Coordinator contact"
              required
              placeholder="Phone number or email"
              {...register("walkInCoordinatorContact")}
            />

            <TextField
              label="Registration deadline"
              type="date"
              {...register("walkInRegistrationDeadline")}
            />
          </div>
        )}
        <div className="sm:col-span-2 mt-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">
                Automated Shortlisting
              </p>

              <p className="mt-1 text-xs text-ink-faint">
                Automatically recommend candidates based on job-fit score,
                required skills and experience.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                {...register("shortlistingCriteria.enabled")}
              />
              Enable
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <TextField
              label="Minimum Job Fit Score"
              type="number"
              min="0"
              max="100"
              error={errors.shortlistingCriteria?.minimumJobFitScore?.message}
              {...register("shortlistingCriteria.minimumJobFitScore")}
            />

            <TextField
              label="Minimum Experience (Years)"
              type="number"
              min="0"
              error={errors.shortlistingCriteria?.minimumExperience?.message}
              {...register("shortlistingCriteria.minimumExperience")}
            />

            <TextField
              label="Required Skills"
              placeholder="React, TypeScript, Node.js"
              error={errors.shortlistingCriteria?.requiredSkillsText?.message}
              {...register("shortlistingCriteria.requiredSkillsText")}
            />
          </div>
        </div>

        {selectedHiringMode === "CAMPUS" && (
          <div className="sm:col-span-2 grid gap-5 rounded-xl border border-line bg-canvas p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-semibold text-ink">
                Campus Drive Details
              </p>

              <p className="mt-1 text-xs text-ink-faint">
                Configure the college, campus location, drive schedule and
                placement coordinator.
              </p>
            </div>

            <TextField
              label="College name"
              required
              className="sm:col-span-2"
              placeholder="Enter college or university name"
              {...register("campusCollegeName")}
            />

            <TextField
              label="Campus location"
              required
              placeholder="City, State"
              {...register("campusLocation")}
            />

            <TextField
              label="Expected candidates"
              type="number"
              min="0"
              placeholder="100"
              {...register("campusExpectedCandidates")}
            />

            <TextField
              label="Drive date"
              type="date"
              required
              {...register("campusDriveDate")}
            />

            <TextField
              label="Start time"
              type="time"
              required
              {...register("campusStartTime")}
            />

            <TextField
              label="End time"
              type="time"
              required
              {...register("campusEndTime")}
            />

            <TextField
              label="Placement coordinator"
              required
              placeholder="Coordinator name"
              {...register("campusPlacementCoordinator")}
            />

            <TextField
              label="Coordinator contact"
              required
              placeholder="Phone number or email"
              {...register("campusCoordinatorContact")}
            />
          </div>
        )}

        <SelectField label="Hiring mode" required {...register("hiringMode")}>
          <option value="STANDARD">Standard recruitment</option>

          <option value="WALK_IN">Walk-in recruitment</option>

          <option value="CAMPUS">Campus recruitment</option>
        </SelectField>

        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium text-ink">Posting channels</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["CAREERS", "Company Careers Page"],
              ["LINKEDIN", "LinkedIn"],
              ["NAUKRI", "Naukri"],
              ["INDEED", "Indeed"],
              ["REFERRALS", "Employee Referrals"],
            ].map(([value, label]) => {
              const checked = selectedChannels.includes(value);

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
                    onChange={() => toggleChannel(value)}
                    className="h-4 w-4"
                  />

                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <TextField
          label="Required skills"
          placeholder="React, Node.js, MongoDB"
          className="sm:col-span-2"
          {...register("skillsText")}
        />

        <p className="sm:col-span-2 -mt-3 text-[11px] text-ink-faint">
          Separate skills with commas. These skills are used by the AI-assisted
          candidate screening system.
        </p>

        <TextareaField
          label="Screening questions"
          placeholder={
            "Do you have 4+ years of experience?\nAre you willing to relocate?"
          }
          className="sm:col-span-2"
          error={errors.screeningQuestionsText?.message}
          {...register("screeningQuestionsText")}
        />

        <p className="sm:col-span-2 -mt-3 text-[11px] text-ink-faint">
          Enter one question per line.
        </p>

        <TextareaField
          label="Job description"
          className="sm:col-span-2"
          error={errors.description?.message}
          placeholder="Describe responsibilities, qualifications, expectations and other requirements. You can also select a role category and use the automatic template."
          {...register("description")}
        />

        <p className="sm:col-span-2 -mt-3 text-[11px] text-ink-faint">
          When role templates are enabled, the backend can automatically use the
          selected template if no description is entered.
        </p>
      </form>
    </Modal>
  );
}
