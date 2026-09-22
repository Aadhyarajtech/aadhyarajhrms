import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  IndianRupee,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { CandidatePortalApi } from "@/api/candidatePortal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { resolveAssetUrl, getErrorMessage } from "@/lib/api";
import { formatCurrencyINR } from "@/lib/format";

export default function CandidateOffer() {
  const { token = "" } = useParams<{ token: string }>();
  const [documentType, setDocumentType] = useState("Aadhaar / ID Proof");
  const [document, setDocument] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["candidate-offer", token],
    queryFn: () => CandidatePortalApi.get(token),
    enabled: Boolean(token),
    retry: false,
  });

  const responseMutation = useMutation({
    mutationFn: (status: "ACCEPTED" | "DECLINED") =>
      CandidatePortalApi.respond(token, status),
    onSuccess: () => {
      setMessage("Your response has been recorded successfully.");
      void query.refetch();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!document) throw new Error("Select a document first.");
      return CandidatePortalApi.uploadDocument(token, documentType, document);
    },
    onSuccess: () => {
      setDocument(null);
      setMessage("Your pre-boarding document was submitted successfully.");
      void query.refetch();
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  useEffect(() => {
    if (query.error)
      setMessage(
        getErrorMessage(
          query.error,
          "This candidate offer link is invalid or expired.",
        ),
      );
  }, [query.error]);

  if (query.isLoading) {
    return (
      <PageShell>
        <Card>
          <div className="flex min-h-40 items-center justify-center text-sm text-ink-soft">
            Loading your secure offer…
          </div>
        </Card>
      </PageShell>
    );
  }

  const candidate = query.data;
  if (!candidate) {
    return (
      <PageShell>
        <Card>
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger-50 text-danger-500">
              <XCircle size={22} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">
                Secure candidate portal
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
                Offer link unavailable
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-ink-faint">
                This secure link may have expired or is no longer valid. Please
                contact the recruitment team.
              </p>
            </div>
          </div>
        </Card>
      </PageShell>
    );
  }

  const offer = candidate.offer;
  const accepted = offer?.status === "ACCEPTED";
  const canRespond = offer?.status === "SENT";
  const bgvVerified = candidate.backgroundVerification?.status === "VERIFIED";
  const preboarding = candidate.preboarding;
  const preboardingComplete = preboarding?.status === "COMPLETED";

  return (
    <PageShell>
      <div className="space-y-6">
        {/* Premium portal hero */}
        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#17134f] via-[#4c35c7] to-[#2563eb] p-6 text-white shadow-[0_24px_70px_rgba(76,53,199,0.22)] sm:p-8">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                  <Sparkles size={22} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                    AadhyaRaj Technologies
                  </p>
                  <p className="mt-0.5 text-sm text-white/80">Candidate Portal</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/20">
                <LockKeyhole size={13} /> Secure access
              </span>
            </div>

            <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-sm font-medium text-white/70">Employment offer for</p>
                <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  {candidate.firstName} {candidate.lastName}
                </h1>
                <p className="mt-2 text-base text-white/80">{candidate.jobTitle}</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15 backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">
                  Offer status
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  {offer?.status?.replaceAll("_", " ") ?? "PENDING"}
                </div>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric label="Position" value={candidate.jobTitle || "—"} />
              <HeroMetric label="Joining date" value={offer?.joiningDate || "—"} />
              <HeroMetric label="Annual CTC" value={formatCurrencyINR(offer?.annualCtc ?? 0)} />
              <HeroMetric
                label="Issued"
                value={
                  offer?.generatedAt
                    ? new Date(offer.generatedAt).toLocaleDateString("en-IN")
                    : "—"
                }
              />
            </div>
          </div>
        </section>

        {message && (
          <div className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 shadow-sm">
            <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
            <span>{message}</span>
          </div>
        )}

        {/* Candidate journey */}
        <section className="grid gap-3 sm:grid-cols-4">
          <JourneyStep icon={<FileText size={16} />} label="Offer" active={Boolean(offer)} />
          <JourneyStep icon={<CheckCircle2 size={16} />} label="Acceptance" active={accepted} />
          <JourneyStep icon={<ShieldCheck size={16} />} label="Verification" active={bgvVerified} />
          <JourneyStep icon={<FileCheck2 size={16} />} label="Pre-boarding" active={preboardingComplete} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          {/* Compensation */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-line/70 bg-gradient-to-r from-violet-50 via-white to-blue-50 px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-soft">
                    <IndianRupee size={19} />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink">Offer & compensation</h2>
                    <p className="mt-0.5 text-xs text-ink-faint">Review the financial terms of your employment offer.</p>
                  </div>
                </div>
                {offer?.offerUrl && (
                  <a
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300"
                    href={resolveAssetUrl(offer.offerUrl) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText size={15} />
                    Offer letter
                  </a>
                )}
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Position" value={candidate.jobTitle} />
                <Info label="Joining date" value={offer?.joiningDate || "—"} />
                <Info label="Annual CTC" value={formatCurrencyINR(offer?.annualCtc ?? 0)} accent />
                <Info
                  label="Offer issued"
                  value={
                    offer?.generatedAt
                      ? new Date(offer.generatedAt).toLocaleDateString("en-IN")
                      : "—"
                  }
                />
              </div>

              <div className="mt-5 rounded-2xl border border-line/70 bg-slate-50/70 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">Compensation breakdown</p>
                    <p className="mt-0.5 text-xs text-ink-faint">Annual values included in the offer.</p>
                  </div>
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                    Annual
                  </span>
                </div>
                <div className="space-y-1">
                  <Row label="Basic Salary" value={formatCurrencyINR(offer?.basic ?? 0)} />
                  <Row label="HRA" value={formatCurrencyINR(offer?.hra ?? 0)} />
                  <Row label="Special Allowance" value={formatCurrencyINR(offer?.specialAllowance ?? 0)} />
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-3 text-sm font-bold text-ink shadow-sm ring-1 ring-line/60">
                    <span>Total Annual CTC</span>
                    <span className="text-brand-700">{formatCurrencyINR(offer?.annualCtc ?? 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Decision panel */}
          <Card className="overflow-hidden p-0">
            <div className="bg-gradient-to-br from-ink to-[#312e81] px-5 py-5 text-white sm:px-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Your decision</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Offer response</h2>
              <p className="mt-2 text-xs leading-5 text-white/70">Your response is securely recorded against this candidate offer.</p>
            </div>
            <div className="p-5 sm:p-6">
              {accepted ? (
                <StatusBox tone="success" title="Offer accepted" text="Your acceptance has been recorded successfully." />
              ) : offer?.status === "DECLINED" ? (
                <StatusBox tone="danger" title="Offer declined" text="Your response has been recorded for the recruitment team." />
              ) : canRespond ? (
                <>
                  <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
                        <LockKeyhole size={15} />
                      </div>
                      <p className="text-xs leading-5 text-brand-900">
                        Please review the offer details before submitting your decision. Only you can respond through this secure portal.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2">
                    <Button
                      isLoading={responseMutation.isPending}
                      onClick={() => responseMutation.mutate("ACCEPTED")}
                      leftIcon={<CheckCircle2 size={16} />}
                    >
                      Accept offer
                      <ArrowRight size={15} />
                    </Button>
                    <Button
                      variant="outline"
                      isLoading={responseMutation.isPending}
                      onClick={() => responseMutation.mutate("DECLINED")}
                      leftIcon={<XCircle size={16} />}
                    >
                      Decline offer
                    </Button>
                  </div>
                </>
              ) : (
                <StatusBox tone="warning" title="Awaiting response" text="The recruitment team has not opened a response action for this offer." />
              )}
            </div>
          </Card>
        </div>

        {/* Pre-boarding */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line/70 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                  <ShieldCheck size={19} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">Pre-boarding center</h2>
                  <p className="mt-0.5 text-xs text-ink-faint">Complete document submission after offer acceptance and verification.</p>
                </div>
              </div>
              <Badge tone={preboardingComplete ? "success" : accepted && bgvVerified ? "brand" : "warning"}>
                {preboarding?.status?.replaceAll("_", " ") ?? "NOT STARTED"}
              </Badge>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {!accepted ? (
              <GateState title="Offer acceptance required" text="Accept the offer to continue with candidate pre-boarding." />
            ) : !bgvVerified ? (
              <GateState title="Background verification in progress" text="Your offer is accepted. Document submission will open after background verification is completed by the recruitment team." />
            ) : (
              <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <p className="text-sm font-semibold text-ink">Submitted documents</p>
                  <p className="mt-1 text-xs leading-5 text-ink-faint">Documents already submitted through this portal appear here.</p>
                  {preboarding?.documents?.length ? (
                    <div className="mt-4 space-y-2">
                      {preboarding.documents.map((doc, index) => (
                        <div
                          key={`${doc.type}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-white px-3 py-3 text-xs shadow-sm"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FileCheck2 size={15} className="shrink-0 text-brand-600" />
                            <span className="truncate font-medium text-ink">{doc.type}</span>
                          </div>
                          <Badge tone={doc.verified ? "success" : "warning"}>
                            {doc.verified ? "Verified" : "Submitted"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-line bg-slate-50 px-4 py-5 text-center text-xs text-ink-faint">
                      No documents submitted yet.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-line/70 bg-slate-50/70 p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <Upload size={17} className="text-brand-600" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Submit a document</p>
                      <p className="text-xs text-ink-faint">PDF, DOC, DOCX or image files.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Document type</span>
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value)}
                        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                      >
                        <option>Aadhaar / ID Proof</option>
                        <option>PAN Card</option>
                        <option>Educational Certificate</option>
                        <option>Experience Certificate</option>
                        <option>Bank Proof</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Choose file</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setDocument(e.target.files?.[0] ?? null)}
                        className="block h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink-faint file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
                      />
                    </label>
                    <Button
                      isLoading={uploadMutation.isPending}
                      disabled={!document}
                      onClick={() => uploadMutation.mutate()}
                      leftIcon={<Upload size={16} />}
                    >
                      Submit
                    </Button>
                  </div>
                  {document && (
                    <p className="mt-3 text-xs font-medium text-brand-700">Selected: {document.name}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.08),_transparent_30%),#f6f8fc] px-4 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3.5 py-3 ring-1 ring-white/15 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function JourneyStep({
  icon,
  label,
  active,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3 transition ${active ? "border-brand-200 bg-brand-50 shadow-sm" : "border-line/70 bg-white"}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? "bg-brand-600 text-white" : "bg-slate-100 text-ink-faint"}`}>
          {icon}
        </span>
        <div>
          <p className="text-xs font-semibold text-ink">{label}</p>
          <p className={`text-[10px] font-medium ${active ? "text-brand-700" : "text-ink-faint"}`}>
            {active ? "Completed / active" : "Pending"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">{label}</p>
      <p className={`mt-1.5 truncate text-sm font-semibold ${accent ? "text-brand-700" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-2.5 text-sm last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function StatusBox({
  tone,
  title,
  text,
}: {
  tone: "success" | "danger" | "warning";
  title: string;
  text: string;
}) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <div className={`rounded-2xl border p-4 ${styles[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{text}</p>
    </div>
  );
}

function GateState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line/70 bg-slate-50/70 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
        <LockKeyhole size={18} />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-xs leading-5 text-ink-faint">{text}</p>
      </div>
    </div>
  );
}
