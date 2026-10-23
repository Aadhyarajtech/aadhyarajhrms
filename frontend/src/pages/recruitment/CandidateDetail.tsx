import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Download,
  Mail,
  Phone,
  UserRound,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react";

import { RecruitmentApi } from "@/lib/endpoints";
import { getErrorMessage, resolveAssetUrl } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatCurrencyINR } from "@/lib/format";
import type { Candidate } from "@/types";

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  return String(value);
}

function candidateCode(candidate: Candidate): string {
  // MongoDB's existing _id (exposed as candidate.id) is unique and stable.
  // Prefixing it provides a readable Candidate ID without a risky data migration.
  return `CAN-${candidate.id.toUpperCase()}`;
}

function stageLabel(stage: string): string {
  return stage
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function CandidateDetail() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const candidateQuery = useQuery<Candidate>({
    queryKey: ["recruitment", "candidate", candidateId],
    queryFn: () => RecruitmentApi.candidate(candidateId as string),
    enabled: Boolean(candidateId),
    retry: 1,
  });

  const candidate = candidateQuery.data;
  const resumeUrl = candidate?.resumeUrl
    ? resolveAssetUrl(candidate.resumeUrl)
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/app/recruitment"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Recruitment
        </Link>
        {candidate && (
          <div className="text-sm text-muted-foreground">
            Candidate ID: <span className="font-semibold text-foreground">{candidateCode(candidate)}</span>
          </div>
        )}
      </div>

      {candidateQuery.isPending && (
        <Card className="flex min-h-56 items-center justify-center p-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading candidate details…
          </div>
        </Card>
      )}

      {candidateQuery.isError && (
        <Card className="space-y-3 p-6">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <AlertCircle className="h-5 w-5" />
            Unable to load candidate
          </div>
          <p className="text-sm text-muted-foreground">
            {getErrorMessage(candidateQuery.error, "The candidate could not be found or you do not have permission to view this record.")}
          </p>
          <div>
            <Button variant="secondary" onClick={() => candidateQuery.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {candidate && (
        <>
          <Card className="space-y-5 p-5 md:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {candidate.firstName} {candidate.lastName}
                  </h1>
                  <p className="mt-1 break-all text-sm text-muted-foreground">{candidate.email}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Candidate ID: {candidateCode(candidate)}</p>
                </div>
              </div>
              <Badge>{stageLabel(candidate.stage)}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><BriefcaseBusiness className="h-4 w-4" /> Applied role</div>
                <p className="font-medium">{displayValue(candidate.jobTitle)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" /> Phone</div>
                <p className="font-medium">{displayValue(candidate.phone)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> Applied on</div>
                <p className="font-medium">{candidate.appliedAt ? formatDate(candidate.appliedAt) : "Not available"}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">Application details</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Source</dt><dd className="text-right font-medium">{displayValue(candidate.source)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Experience</dt><dd className="text-right font-medium">{candidate.extractedExperience == null ? "Not provided" : `${candidate.extractedExperience} years`}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Expected CTC</dt><dd className="text-right font-medium">{candidate.expectedCtc == null ? "Not provided" : formatCurrencyINR(candidate.expectedCtc)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Job-fit score</dt><dd className="text-right font-medium">{candidate.jobFitScore == null ? "Not evaluated" : `${candidate.jobFitScore}%`}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Screening recommendation</dt><dd className="text-right font-medium">{displayValue(candidate.screeningRecommendation)}</dd></div>
              </dl>
            </Card>

            <Card className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">Resume and screening</h2>
              {resumeUrl ? (
                <a href={resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Download className="h-4 w-4" /> Open candidate resume
                </a>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4" /> No resume has been attached.</p>
              )}
              <div>
                <h3 className="mb-1 text-sm font-medium">Screening summary</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{candidate.screeningSummary || "No screening summary is available yet."}</p>
              </div>
              {candidate.extractedSkills?.length ? (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Extracted skills</h3>
                  <div className="flex flex-wrap gap-2">{candidate.extractedSkills.map((skill) => <Badge key={skill}>{skill}</Badge>)}</div>
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-4 w-4" /> {candidate.email}</div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
