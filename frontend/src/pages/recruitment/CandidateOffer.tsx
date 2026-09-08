import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  FileText,
  ShieldCheck,
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
          <p className="text-sm text-ink-soft">Loading your offer…</p>
        </Card>
      </PageShell>
    );
  }

  const candidate = query.data;
  if (!candidate) {
    return (
      <PageShell>
        <Card>
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 text-danger-500" />
            <div>
              <h1 className="font-display text-xl font-medium text-ink">
                Offer link unavailable
              </h1>
              <p className="mt-1 text-sm text-ink-faint">
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

  return (
    <PageShell>
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">
                AadhyaRaj Technologies
              </p>
              <h1 className="mt-2 font-display text-2xl font-medium text-ink">
                Employment Offer
              </h1>
              <p className="mt-1 text-sm text-ink-faint">
                Secure candidate portal for {candidate.firstName}{" "}
                {candidate.lastName}
              </p>
            </div>
            <Badge
              tone={
                accepted
                  ? "success"
                  : offer?.status === "DECLINED"
                    ? "danger"
                    : "gold"
              }
            >
              {offer?.status?.replaceAll("_", " ")}
            </Badge>
          </div>
        </Card>

        {message && (
          <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            {message}
          </div>
        )}

        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Position" value={candidate.jobTitle} />
            <Info label="Joining date" value={offer?.joiningDate || "—"} />
            <Info
              label="Annual CTC"
              value={formatCurrencyINR(offer?.annualCtc ?? 0)}
            />
            <Info
              label="Offer issued"
              value={
                offer?.generatedAt
                  ? new Date(offer.generatedAt).toLocaleDateString("en-IN")
                  : "—"
              }
            />
          </div>

          <div className="mt-5 rounded-2xl border border-line/70 bg-ink/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText size={17} className="text-brand-600" />
              <h2 className="font-medium text-ink">Compensation breakdown</h2>
            </div>
            <div className="space-y-2 text-sm">
              <Row
                label="Basic Salary"
                value={formatCurrencyINR(offer?.basic ?? 0)}
              />
              <Row label="HRA" value={formatCurrencyINR(offer?.hra ?? 0)} />
              <Row
                label="Special Allowance"
                value={formatCurrencyINR(offer?.specialAllowance ?? 0)}
              />
              <Row
                label="Total Annual CTC"
                value={formatCurrencyINR(offer?.annualCtc ?? 0)}
                strong
              />
            </div>
          </div>

          {offer?.offerUrl && (
            <a
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline"
              href={resolveAssetUrl(offer.offerUrl) ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={16} /> View full offer letter
            </a>
          )}

          {canRespond && (
            <div className="mt-6 rounded-2xl border border-line/70 p-4">
              <p className="text-sm font-medium text-ink">
                Please confirm your decision
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Only you, the candidate, can submit this response through this
                secure portal.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  isLoading={responseMutation.isPending}
                  onClick={() => responseMutation.mutate("ACCEPTED")}
                  leftIcon={<CheckCircle2 size={16} />}
                >
                  Accept offer
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
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand-600" />
            <h2 className="font-display text-lg font-medium text-ink">
              Pre-boarding
            </h2>
          </div>
          {!accepted ? (
            <p className="mt-2 text-sm text-ink-faint">
              Accept the offer to continue with candidate pre-boarding.
            </p>
          ) : !bgvVerified ? (
            <p className="mt-2 text-sm text-ink-faint">
              Your offer is accepted. Pre-boarding document submission will open
              after background verification is completed by the recruitment
              team.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <Badge
                tone={preboarding?.status === "COMPLETED" ? "success" : "brand"}
              >
                {preboarding?.status?.replaceAll("_", " ") ?? "NOT STARTED"}
              </Badge>
              {preboarding?.documents?.length ? (
                <div className="space-y-2">
                  {preboarding.documents.map((doc, index) => (
                    <div
                      key={`${doc.type}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-3 py-2 text-xs"
                    >
                      <span className="text-ink">{doc.type}</span>
                      <Badge tone={doc.verified ? "success" : "warning"}>
                        {doc.verified ? "Verified" : "Submitted"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-500"
                  >
                    <option>Aadhaar / ID Proof</option>
                    <option>PAN Card</option>
                    <option>Educational Certificate</option>
                    <option>Experience Certificate</option>
                    <option>Bank Proof</option>
                    <option>Other</option>
                  </select>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setDocument(e.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-ink-faint"
                  />
                </div>
                <Button
                  isLoading={uploadMutation.isPending}
                  disabled={!document}
                  onClick={() => uploadMutation.mutate()}
                  leftIcon={<Upload size={16} />}
                >
                  Submit document
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f8fc] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">{children}</div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-ink/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-line/60 py-2 last:border-0 ${strong ? "font-semibold text-ink" : "text-ink-soft"}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
