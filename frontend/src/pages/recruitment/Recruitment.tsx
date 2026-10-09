import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Briefcase,
  FileText,
  MapPin,
  Plus,
  Users,
  Sparkles,
  TrendingUp,
  UserPlus,
  CheckCircle2,
  Clock3,
  Search,
  X,
  ChevronRight,
  UserCheck,
  Building2,
  GraduationCap,
} from "lucide-react";
import { RecruitmentApi, OrganizationApi } from "@/lib/endpoints";
import { api, getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
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
    walkInExpectedCandidates: z.preprocess((value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }
      const numberValue = Number(value);
      return Number.isNaN(numberValue) ? undefined : numberValue;
    }, z.number().int().min(0).optional()),

    campusCollegeName: z.string().optional(),
    campusLocation: z.string().optional(),
    campusDriveDate: z.string().optional(),
    campusStartTime: z.string().optional(),
    campusEndTime: z.string().optional(),
    campusPlacementCoordinator: z.string().optional(),
    campusCoordinatorContact: z.string().optional(),
    campusExpectedCandidates: z.preprocess((value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }
      const numberValue = Number(value);
      return Number.isNaN(numberValue) ? undefined : numberValue;
    }, z.number().int().min(0).optional()),

    skillsText: z.string().optional(),

    description: z.preprocess((value) => {
      if (typeof value === "string" && value.trim() === "") {
        return undefined;
      }
      return value;
    }, z.string().min(10, "Job description must contain at least 10 characters").optional()),

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
  const { user } = useAuth();
  // Only roles that already manage recruitment can access the management workspace.
  // Every other authenticated role receives the read-only available-roles view.
  const role = String(user?.role ?? "").trim().toUpperCase();
  const canManageRecruitment = ["SUPER_ADMIN", "HR_ADMIN", "RECRUITER"].includes(role);
  const isEmployeeView = !canManageRecruitment;
  const [postOpen, setPostOpen] = useState(false);
  const [selectedAvailableJob, setSelectedAvailableJob] = useState<any | null>(null);

  // Frontend-only workspace filters. Existing recruitment APIs and workflows are unchanged.
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [hiringModeFilter, setHiringModeFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  const {
    data: jobs,
    isLoading,
    isError: jobsLoadFailed,
    error: jobsLoadError,
    refetch: refetchJobs,
  } = useQuery({
    queryKey: ["recruitment", "jobs"],
    queryFn: () => RecruitmentApi.jobs(),
    retry: 1,
  });

  const { data: pipeline } = useQuery({
    queryKey: ["recruitment", "pipeline"],
    queryFn: RecruitmentApi.pipelineSummary,
    enabled: canManageRecruitment,
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
    enabled: canManageRecruitment,
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
    enabled: canManageRecruitment,
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
    enabled: canManageRecruitment,
  });

  const pipelineData = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage: stage.charAt(0) + stage.slice(1).toLowerCase(),
        count: pipeline?.find((item) => item.stage === stage)?.count ?? 0,
      })),
    [pipeline],
  );

  const totalCandidates = (jobs ?? []).reduce(
    (total, job) => total + (job.candidateCount ?? 0),
    0,
  );

  const pipelineTotal = pipelineData.reduce(
    (total, item) => total + item.count,
    0,
  );

  const hiredCount =
    pipeline?.find((item) => item.stage === "HIRED")?.count ?? 0;

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredJobs = (jobs ?? []).filter((job: any) => {
    const matchesSearch =
      !normalizedSearch ||
      [
        job.title,
        job.departmentName,
        job.designationTitle,
        job.location,
        job.status,
        job.requisitionStatus,
        job.hiringMode,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch),
        );

    const matchesStatus =
      statusFilter === "ALL" ||
      String(job.status ?? "").toUpperCase() === statusFilter;

    const matchesHiringMode =
      hiringModeFilter === "ALL" ||
      String(job.hiringMode ?? "STANDARD").toUpperCase() === hiringModeFilter;

    const matchesDepartment =
      departmentFilter === "ALL" ||
      String(job.departmentName ?? "") === departmentFilter;

    return matchesSearch && matchesStatus && matchesHiringMode && matchesDepartment;
  });

  const departmentOptions = Array.from(
    new Set(
      (jobs ?? [])
        .map((job: any) => job.departmentName)
        .filter(Boolean)
        .map(String),
    ),
  ).sort();

  const statusOptions = Array.from(
    new Set(
      (jobs ?? [])
        .map((job: any) => job.status)
        .filter(Boolean)
        .map((value) => String(value).toUpperCase()),
    ),
  ).sort();

  const pendingApprovalCount = (jobs ?? []).filter(
    (job: any) =>
      String(job.requisitionStatus ?? "").toUpperCase() === "PENDING_APPROVAL",
  ).length;

  const totalOpenings = (jobs ?? []).reduce(
    (total, job: any) => total + Number(job.openings ?? job.headcount ?? 0),
    0,
  );

  const averageCandidatesPerRole = jobs?.length
    ? Math.round(totalCandidates / jobs.length)
    : 0;

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    statusFilter !== "ALL" ||
    hiringModeFilter !== "ALL" ||
    departmentFilter !== "ALL";

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setHiringModeFilter("ALL");
    setDepartmentFilter("ALL");
  };

  // Employees can browse available roles but must not see recruitment management tools.
  // Keep the existing recruiter/admin workspace unchanged below.
  if (isEmployeeView) {
    const availableJobs = (jobs ?? []).filter((job: any) => {
      const status = String(job.status ?? "").trim().toUpperCase();
      const requisitionStatus = String(job.requisitionStatus ?? "").trim().toUpperCase();

      // Do not expose drafts, closed roles, or requisitions that still need approval.
      const unavailableStatuses = [
        "CLOSED", "CANCELLED", "CANCELED", "INACTIVE", "DRAFT", "REJECTED",
      ];
      const unavailableRequisitionStatuses = [
        "PENDING_APPROVAL", "REJECTED", "CANCELLED", "CANCELED", "DRAFT",
      ];

      return (
        !unavailableStatuses.includes(status) &&
        !unavailableRequisitionStatuses.includes(requisitionStatus)
      );
    });

    const isReferralRole = (job: any) => {
      const channels = Array.isArray(job.postingChannels)
        ? job.postingChannels.map((channel: unknown) => String(channel).toUpperCase())
        : [];
      return (
        channels.includes("REFERRALS") ||
        job.referralEligible === true ||
        job.isReferralEligible === true
      );
    };

    const formatEmploymentType = (value: unknown) =>
      String(value ?? "Not specified").replace(/_/g, " ").toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

    return (
      <div className="premium-page space-y-4">
        <PageHeader
          title="Available Job Roles"
          subtitle="Browse approved openings and identify positions available for employee referrals. Candidate information and recruitment management remain restricted."
        />

        {!isLoading && !jobsLoadFailed && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Available roles</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{availableJobs.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Referral opportunities</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {availableJobs.filter(isReferralRole).length}
              </p>
            </div>
          </div>
        )}

        {jobsLoadFailed ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-950">Unable to load available job roles</h2>
            <p className="mt-1 text-sm text-amber-900">
              The job-listing request failed. This is different from having no open roles.
              {jobsLoadError instanceof Error ? ` ${jobsLoadError.message}` : ""}
            </p>
            <Button className="mt-3" variant="outline" onClick={() => void refetchJobs()}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-44 rounded-3xl" />
            ))}
          </div>
        ) : availableJobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No available roles"
            description="There are no currently available job roles to display."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableJobs.map((job: any) => (
              <Card key={job.id} className="flex h-full min-h-[300px] flex-col border-slate-200/80 bg-white p-4 shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Briefcase size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 font-display text-sm font-semibold leading-5 text-slate-900">{job.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {[job.departmentName, job.designationTitle].filter(Boolean).join(" · ") || "Department not specified"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex-1 space-y-1.5 text-xs leading-5 text-slate-600">
                  <p className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" />{job.location || "Location not specified"}</p>
                  <p><span className="font-medium">Experience:</span> {job.experienceMin ?? 0}–{job.experienceMax ?? 0} years</p>
                  <p><span className="font-medium">Employment type:</span> {formatEmploymentType(job.employmentType)}</p>
                  <p><span className="font-medium">Open positions:</span> {job.openings ?? job.headcount ?? 1}</p>
                  {isReferralRole(job) && (
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                      <UserPlus size={13} /> Employee referral available
                    </p>
                  )}
                  {Array.isArray(job.skills) && job.skills.length > 0 && (
                    <p className="line-clamp-2"><span className="font-medium">Required skills:</span> {job.skills.join(", ")}</p>
                  )}
                  {typeof job.skills === "string" && job.skills.trim() && (
                    <p className="line-clamp-2"><span className="font-medium">Required skills:</span> {job.skills}</p>
                  )}
                  {job.description && (
                    <p className="line-clamp-4 min-h-[5rem] border-t border-slate-100 pt-2 leading-5 text-slate-500">{job.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAvailableJob(job)}
                  className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-3 text-left text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  aria-label={`Read full details for ${job.title}`}
                >
                  <span>Read role details</span>
                  <ChevronRight size={14} />
                </button>
              </Card>
            ))}
          </div>
        )}
        {selectedAvailableJob && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedAvailableJob(null);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="available-job-detail-title"
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Available job role</p>
                  <h2 id="available-job-detail-title" className="mt-1 font-display text-xl font-semibold text-slate-900">
                    {selectedAvailableJob.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {[selectedAvailableJob.departmentName, selectedAvailableJob.designationTitle].filter(Boolean).join(" · ") || "Department not specified"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAvailableJob(null)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label="Close job details"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5 px-5 py-5 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Location</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{selectedAvailableJob.location || "Not specified"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Employment type</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{formatEmploymentType(selectedAvailableJob.employmentType)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Experience</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{selectedAvailableJob.experienceMin ?? 0}–{selectedAvailableJob.experienceMax ?? 0} years</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Open positions</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{selectedAvailableJob.openings ?? selectedAvailableJob.headcount ?? 1}</p>
                  </div>
                </div>

                {isReferralRole(selectedAvailableJob) && (
                  <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    <UserPlus size={14} /> Employee referral available
                  </p>
                )}

                {(Array.isArray(selectedAvailableJob.skills) ? selectedAvailableJob.skills.length > 0 : Boolean(String(selectedAvailableJob.skills ?? "").trim())) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Required skills</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {Array.isArray(selectedAvailableJob.skills) ? selectedAvailableJob.skills.join(", ") : selectedAvailableJob.skills}
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Job description</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {selectedAvailableJob.description || "No job description has been provided."}
                  </p>
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-100 px-5 py-4 sm:px-6">
                <Button variant="outline" onClick={() => setSelectedAvailableJob(null)}>Close</Button>
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="premium-page space-y-5">
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

      <div className="relative overflow-hidden rounded-[28px] border border-indigo-100/80 bg-gradient-to-br from-[#312E81] via-[#5146E5] to-[#7C5CFF] p-5 text-white shadow-[0_18px_50px_rgba(79,70,229,0.17)] sm:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-100 backdrop-blur">
              <Sparkles size={13} />
              Talent acquisition intelligence
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
              Build Your Next Great Team.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-indigo-100">
              Track requisitions, candidate movement, hiring sources and
              volume-hiring activity from one workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="min-w-[125px] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-indigo-100">
                <Briefcase size={15} />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
                  Roles
                </span>
              </div>
              <p className="mt-1 font-display text-2xl font-semibold">{jobs?.length ?? 0}</p>
            </div>

            <div className="min-w-[125px] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-indigo-100">
                <Users size={15} />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
                  Candidates
                </span>
              </div>
              <p className="mt-1 font-display text-2xl font-semibold">{totalCandidates}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-[22px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(79,70,229,0.06)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">Open roles</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{jobs?.length ?? 0}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100">
              <Briefcase size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Current recruitment requisitions</p>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(14,165,233,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-600">In pipeline</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{pipelineTotal}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm ring-1 ring-sky-100">
              <TrendingUp size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Candidates across all stages</p>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(16,185,129,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">Hired</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{hiredCount}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
              <CheckCircle2 size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Completed hiring outcomes</p>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(245,158,11,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600">Referrals</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{referralAnalytics?.totalReferrals ?? 0}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm ring-1 ring-amber-100">
              <UserPlus size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Employee referral volume</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-orange-100 bg-white p-4 shadow-[0_8px_24px_rgba(249,115,22,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-600">Pending approval</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{pendingApprovalCount}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Clock3 size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Requisitions awaiting approval</p>
        </div>

        <div className="rounded-[22px] border border-cyan-100 bg-white p-4 shadow-[0_8px_24px_rgba(6,182,212,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-600">Total openings</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{totalOpenings}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
              <Briefcase size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Planned positions across requisitions</p>
        </div>

        <div className="rounded-[22px] border border-fuchsia-100 bg-white p-4 shadow-[0_8px_24px_rgba(217,70,239,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-600">Avg. candidates / role</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{averageCandidatesPerRole}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600">
              <UserCheck size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Average candidate volume per role</p>
        </div>

        <div className="rounded-[22px] border border-violet-100 bg-white p-4 shadow-[0_8px_24px_rgba(124,92,255,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Hiring mix</p>
              <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{(jobs ?? []).filter((job: any) => String(job.hiringMode ?? "STANDARD") !== "STANDARD").length}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <GraduationCap size={17} />
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Walk-in or campus requisitions</p>
        </div>
      </div>

      <Card className="mb-6 border-indigo-100/70 bg-gradient-to-br from-white to-[#FBFAFF] shadow-[0_10px_30px_rgba(79,70,229,0.05)]">
        <CardHeader
          title="Pipiline Overview"
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
        <Card className="border-slate-200/70 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.045)]">
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
          <Card className="border-amber-100/80 bg-gradient-to-br from-white to-[#FFFBF2] shadow-[0_10px_28px_rgba(245,158,11,0.045)]">
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

          <Card className="border-sky-100/80 bg-gradient-to-br from-white to-[#F5FBFF] shadow-[0_10px_28px_rgba(14,165,233,0.045)]">
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
          {Array.from({ length: 6 }).map((_, index) => (
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
        <>
          <div className="mb-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">Hiring workspace</p>
                <h3 className="mt-1 font-display text-lg font-semibold tracking-[-0.015em] text-slate-900">Current Requisitions</h3>
                <p className="mt-1 text-[11px] text-slate-500">Search and filter requisitions without changing the existing recruitment workflow.</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-500">
                <Building2 size={13} />
                {filteredJobs.length} of {jobs.length} roles shown
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(260px,1.6fr)_repeat(3,minmax(150px,0.7fr))_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search title, department, designation, location..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="ALL">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
                ))}
              </select>

              <select
                value={hiringModeFilter}
                onChange={(event) => setHiringModeFilter(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="ALL">All hiring modes</option>
                <option value="STANDARD">Standard</option>
                <option value="WALK_IN">Walk-in</option>
                <option value="CAMPUS">Campus</option>
              </select>

              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="ALL">All departments</option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>

              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} leftIcon={<X size={15} />}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {!filteredJobs.length ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Search size={20} />
              </div>
              <h4 className="mt-4 font-display text-base font-semibold text-slate-900">No matching requisitions</h4>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Try another search term or clear the filters to see all current requisitions.</p>
              {hasActiveFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredJobs.map((job: any) => (
                <Card
                  key={job.id}
                  hoverable
                  className="group cursor-pointer border-slate-200/70 bg-gradient-to-br from-white via-white to-[#FBFAFF] shadow-[0_8px_24px_rgba(15,23,42,0.045)] hover:border-indigo-200/80 hover:shadow-[0_16px_34px_rgba(79,70,229,0.10)]"
                  onClick={() => navigate(`/app/recruitment/${job.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-[16px] font-medium text-ink">{job.title}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-ink-faint">{job.departmentName} · {job.designationTitle}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={job.status} />
                      <ChevronRight size={15} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><MapPin size={12} /> Location</div>
                      <p className="mt-1 truncate text-xs font-medium text-slate-700" title={job.location}>{job.location || "Not specified"}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Users size={12} /> Candidates</div>
                      <p className="mt-1 text-xs font-medium text-slate-700">{job.candidateCount ?? 0}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{job.experienceMin ?? 0}–{job.experienceMax ?? 0} yrs</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{job.openings ?? job.headcount ?? 0} opening(s)</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{String(job.hiringMode ?? "STANDARD").replace(/_/g, " ")}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                      <FileText size={12} className="shrink-0" />
                      <span className="truncate">Requisition: {String(job.requisitionStatus ?? "NOT_SET").replace(/_/g, " ").toLowerCase()}</span>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-indigo-600">Open role</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
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
    mutationFn: (payload: Record<string, unknown>) =>
      RecruitmentApi.createJob(payload),

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

  const aiJobDescriptionMutation = useMutation({
    mutationFn: (
      payload: Parameters<typeof RecruitmentApi.generateJobDescription>[0],
    ) => RecruitmentApi.generateJobDescription(payload),

    onSuccess: (
      draft: Awaited<ReturnType<typeof RecruitmentApi.generateJobDescription>>,
    ) => {
      setValue("departmentId", draft.departmentId, {
        shouldDirty: true,
        shouldValidate: true,
      });

      setValue("designationId", draft.designationId, {
        shouldDirty: true,
        shouldValidate: true,
      });

      setValue("roleCategory", draft.roleCategory, {
        shouldDirty: true,
        shouldValidate: true,
      });

      setValue(
        "employmentType",
        draft.employmentType as JobForm["employmentType"],
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );

      setValue("location", draft.location, {
        shouldDirty: true,
        shouldValidate: true,
      });

      setValue("experienceMin", draft.experienceMin, {
        shouldDirty: true,
        shouldValidate: true,
      });

      setValue("experienceMax", draft.experienceMax, {
        shouldDirty: true,
        shouldValidate: true,
      });

      setValue("skillsText", draft.skills.join(", "), {
        shouldDirty: true,
        shouldValidate: true,
      });

      setValue(
        "screeningQuestionsText",
        draft.screeningQuestions.join("\n"),
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );

      setValue("description", draft.description, {
        shouldDirty: true,
        shouldValidate: true,
      });

      showToast("AI job description generated successfully.");
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
            registrationDeadline:
              values.walkInRegistrationDeadline || null,
            expectedCandidates:
              values.walkInExpectedCandidates ?? null,
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
            expectedCandidates:
              values.campusExpectedCandidates ?? null,
          }
          : null,

      shortlistingCriteria: {
        enabled: values.shortlistingCriteria.enabled,
        minimumJobFitScore:
          values.shortlistingCriteria.minimumJobFitScore,
        requiredSkills: shortlistingRequiredSkills,
        minimumExperience:
          values.shortlistingCriteria.minimumExperience,
      },

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
            type="submit"
            form="create-job-requisition-form"
            isLoading={mutation.isPending}
          >
            Submit Requisition
          </Button>
        </>
      }
    >
      <form
        id="create-job-requisition-form"
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={handleSubmit(submitJob, (validationErrors) => {
          const firstError = Object.entries(validationErrors).find(
            ([, error]) => Boolean(error),
          );

          if (firstError) {
            const [fieldName, fieldError] = firstError;
            const message =
              typeof fieldError === "object" &&
                fieldError &&
                "message" in fieldError
                ? String(
                  (fieldError as { message?: unknown }).message ??
                  "Please check this field.",
                )
                : "Please check this field.";
            showToast(`${fieldName}: ${message}`, "error");
          } else {
            showToast("Please check the requisition fields.", "error");
          }
        })}
      >
        <div className="sm:col-span-2 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-semibold text-ink">
              Basic information
            </p>

            <p className="text-xs text-ink-faint">
              Define the role, organizational details and recruitment
              requirements.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="primary"
            leftIcon={<Sparkles size={14} />}
            onClick={() =>
              aiJobDescriptionMutation.mutate({
                jobTitle: watch("title"),
                departmentId: watch("departmentId"),
                designationId: watch("designationId"),
                roleCategory: watch("roleCategory"),
                employmentType: watch("employmentType"),
                location: watch("location"),
                experienceMin: watch("experienceMin"),
                experienceMax: watch("experienceMax"),
                skills: watch("skillsText"),
              })
            }
            isLoading={aiJobDescriptionMutation.isPending}
            disabled={
              !watch("title")?.trim() ||
              aiJobDescriptionMutation.isPending
            }
          >
            Generate with AI
          </Button>
        </div>
        <TextField
          label="Job title"
          required
          className="sm:col-span-2"
          error={errors.title?.message}
          {...register("title")}
        />

        <p className="sm:col-span-2 -mt-3 text-[11px] text-ink-faint">
          <span className="font-medium text-ink">💡</span> Enter a job title and click{" "}
          <span className="font-medium text-brand-600">Generate with AI</span> to automatically fill the job details.
        </p>

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
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${checked
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


