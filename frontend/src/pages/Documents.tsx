import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Briefcase,
  UserRound,
  FileBadge2,
  ClipboardList,
  Send,
  Inbox,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { DocumentsApi, EmployeesApi } from "@/lib/endpoints";
import type {
  CompanyIssuedDocType,
  EmployeeProvidedDocType,
} from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import type { Asset } from "@/types";

// Full set of document types the finalized backend/model accepts. Used for
// the "direct upload" flow, which is unrestricted by request direction.
const DOC_TYPES = [
  { value: "OFFER_LETTER", label: "Offer letter" },
  { value: "ID_PROOF", label: "ID proof" },
  { value: "ADDRESS_PROOF", label: "Address proof" },
  { value: "EDUCATIONAL", label: "Educational" },
  { value: "CONTRACT", label: "Contract" },
  { value: "APPOINTMENT_LETTER", label: "Appointment letter" },
  { value: "EXPERIENCE_LETTER", label: "Experience letter" },
  { value: "RELIEVING_LETTER", label: "Relieving letter" },
  { value: "SALARY_CERTIFICATE", label: "Salary certificate" },
  { value: "EMPLOYMENT_CERTIFICATE", label: "Employment certificate" },
  { value: "OTHER", label: "Other" },
] as const;

// Documents that can be requested FROM an employee (COMPANY_TO_EMPLOYEE).
const EMPLOYEE_PROVIDED_TYPES: {
  value: EmployeeProvidedDocType;
  label: string;
}[] = [
  { value: "ID_PROOF", label: "ID proof" },
  { value: "ADDRESS_PROOF", label: "Address proof" },
  { value: "EDUCATIONAL", label: "Educational certificate" },
  { value: "CONTRACT", label: "Contract" },
  { value: "OTHER", label: "Other" },
];

// Company-issued documents an employee can request (EMPLOYEE_TO_COMPANY).
const COMPANY_ISSUED_TYPES: { value: CompanyIssuedDocType; label: string }[] = [
  { value: "OFFER_LETTER", label: "Offer letter" },
  { value: "APPOINTMENT_LETTER", label: "Appointment letter" },
  { value: "EXPERIENCE_LETTER", label: "Experience letter" },
  { value: "RELIEVING_LETTER", label: "Relieving letter" },
  { value: "SALARY_CERTIFICATE", label: "Salary certificate" },
  { value: "EMPLOYMENT_CERTIFICATE", label: "Employment certificate" },
  { value: "OTHER", label: "Other" },
];

function typeLabel(value: string) {
  const match = DOC_TYPES.find((t) => t.value === value);
  return match ? match.label : String(value).replace(/_/g, " ");
}

export default function Documents() {
  const { user } = useAuth();
  const employeeId = user?.employee?.id ?? "";
  const role = user?.role;

  // Can directly upload any document / delete documents / edit asset status.
  const canManage =
    !!role && ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(role);
  // Can create a COMPANY_TO_EMPLOYEE request against another employee.
  const canRequestFromEmployee =
    !!role && ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(role);
  // Can view/process EMPLOYEE_TO_COMPANY requests raised by employees.
  const canProcessCompanyRequests =
    !!role && ["SUPER_ADMIN", "HR_ADMIN"].includes(role);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isRequestCompanyOpen, setIsRequestCompanyOpen] = useState(false);
  const [fulfillTarget, setFulfillTarget] = useState<{
    employeeId: string;
    request: any;
  } | null>(null);

  const queryClient = useQueryClient();

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["documents", employeeId],
    queryFn: () => DocumentsApi.list(employeeId),
    enabled: !!employeeId,
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ["assets", employeeId],
    queryFn: () => DocumentsApi.assetsForEmployee(employeeId),
    enabled: !!employeeId,
  });

  const { data: documentRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["document-requests", employeeId],
    queryFn: () => DocumentsApi.listDocumentRequests(employeeId),
    enabled: !!employeeId,
  });

  const { data: companyRequests = [], isLoading: companyRequestsLoading } =
    useQuery({
      queryKey: ["company-document-requests"],
      queryFn: () => DocumentsApi.listCompanyDocumentRequests(),
      enabled: canProcessCompanyRequests,
    });

  const requestedFromMe = useMemo(
    () =>
      documentRequests.filter(
        (r: any) => r.direction === "COMPANY_TO_EMPLOYEE",
      ),
    [documentRequests],
  );
  const requestedByMe = useMemo(
    () =>
      documentRequests.filter(
        (r: any) => r.direction === "EMPLOYEE_TO_COMPANY",
      ),
    [documentRequests],
  );

  const documentForRequest = (requestId: string) =>
    documents.find((d: any) => d.requestId === requestId);

  const pendingIncoming = requestedFromMe.filter(
    (request: any) =>
      request.status === "PENDING" || request.status === "OPEN",
  ).length;

  const pendingOutgoing = requestedByMe.filter(
    (request: any) =>
      request.status === "PENDING" || request.status === "OPEN",
  ).length;

  const invalidateAfterFulfillment = (targetEmployeeId: string) => {
    queryClient.invalidateQueries({
      queryKey: ["documents", targetEmployeeId],
    });
    queryClient.invalidateQueries({ queryKey: ["document-requests"] });
    queryClient.invalidateQueries({ queryKey: ["company-document-requests"] });
  };

  return (
    <div className="premium-page space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Uploaded employee records, compliance files, and assigned company assets."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canRequestFromEmployee && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Send size={14} />}
                onClick={() => setIsRequestOpen(true)}
              >
                Request document
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                leftIcon={<Upload size={14} />}
                onClick={() => setIsUploadOpen(true)}
              >
                Upload document
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="group relative overflow-hidden rounded-[22px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(79,70,229,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(79,70,229,0.11)]">
          <div className="absolute -right-7 -top-7 h-20 w-20 rounded-full bg-indigo-100/50 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">Documents</p>
              <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">{documents.length}</p>
              <p className="mt-1 text-[11px] text-slate-500">Secure records available</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100">
              <FileText size={17} />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(16,185,129,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(16,185,129,0.10)]">
          <div className="absolute -right-7 -top-7 h-20 w-20 rounded-full bg-emerald-100/50 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">Assets</p>
              <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">{assets.length}</p>
              <p className="mt-1 text-[11px] text-slate-500">Assigned equipment</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
              <Briefcase size={17} />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-[22px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(245,158,11,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(245,158,11,0.10)]">
          <div className="absolute -right-7 -top-7 h-20 w-20 rounded-full bg-amber-100/50 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600">Action needed</p>
              <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">{pendingIncoming}</p>
              <p className="mt-1 text-[11px] text-slate-500">Requests from HR / manager</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm ring-1 ring-amber-100">
              <Inbox size={17} />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-[22px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-white p-4 shadow-[0_8px_24px_rgba(124,58,237,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(124,58,237,0.10)]">
          <div className="absolute -right-7 -top-7 h-20 w-20 rounded-full bg-violet-100/50 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">My requests</p>
              <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900">{pendingOutgoing}</p>
              <p className="mt-1 text-[11px] text-slate-500">Awaiting company documents</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-100">
              <ClipboardList size={17} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden border-indigo-100/80 bg-gradient-to-br from-white via-white to-[#F7F5FF] shadow-[0_10px_30px_rgba(79,70,229,0.055)]">
          <CardHeader
            title="My documents"
            subtitle="All documents visible to the employee and HR admins."
          />
          {docsLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : !documents.length ? (
            <EmptyState
              icon={FileBadge2}
              title="No documents uploaded"
              description="Offer letters, identity proof, and employee records will appear here."
            />
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <DocumentRow key={doc.id} doc={doc} canManage={canManage} />
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden border-sky-100/80 bg-gradient-to-br from-white via-white to-[#F4FAFF] shadow-[0_10px_30px_rgba(14,165,233,0.05)]">
          <CardHeader
            title="Assigned assets"
            subtitle="Laptop, phone, and other equipment allocated to the employee."
          />
          {assetsLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : !assets.length ? (
            <EmptyState
              icon={Briefcase}
              title="No assets assigned"
              description="Assigned equipment and inventory will appear here once issued."
            />
          ) : (
            <div className="space-y-2">
              {assets.map((asset: Asset) => (
                <AssetRow key={asset.id} asset={asset} canManage={canManage} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {!!employeeId && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="overflow-hidden border-slate-200/70 bg-gradient-to-br from-white to-[#FBFAFF]">
            <CardHeader
              title="Documents requested from me"
              subtitle="Document requests raised by HR, admins, or your manager."
            />
            {requestsLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !requestedFromMe.length ? (
              <EmptyState
                icon={Inbox}
                title="No pending requests"
                description="Documents requested from you will appear here."
              />
            ) : (
              <div className="space-y-2">
                {requestedFromMe.map((request: any) => (
                  <IncomingRequestRow
                    key={request.id}
                    request={request}
                    onUpload={() => setFulfillTarget({ employeeId, request })}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden border-slate-200/70 bg-gradient-to-br from-white to-[#F8FBFF]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardHeader
                title="Documents I requested"
                subtitle="Company-issued documents you've requested from HR."
              />
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Send size={14} />}
                className="whitespace-nowrap px-4"
                onClick={() => setIsRequestCompanyOpen(true)}
              >
                New request
              </Button>
            </div>
            {requestsLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !requestedByMe.length ? (
              <EmptyState
                icon={ClipboardList}
                title="No requests yet"
                description="Offer letters, salary certificates, and other company documents you request will appear here."
              />
            ) : (
              <div className="space-y-2">
                {requestedByMe.map((request: any) => (
                  <OutgoingRequestRow
                    key={request.id}
                    request={request}
                    document={documentForRequest(request.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {canProcessCompanyRequests && (
        <Card className="overflow-hidden border-slate-200/70 bg-gradient-to-br from-white to-[#FFFCF7]">
          <CardHeader
            title="Company document requests"
            subtitle="Company-issued documents employees have requested. Upload the completed document to fulfil each request."
          />
          {companyRequestsLoading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : !companyRequests.length ? (
            <EmptyState
              icon={ClipboardList}
              title="No requests to process"
              description="Employee requests for offer letters, certificates, and other company documents will appear here."
            />
          ) : (
            <div className="space-y-2">
              {companyRequests.map((request: any) => (
                <CompanyRequestRow
                  key={request.id}
                  request={request}
                  onUpload={() =>
                    setFulfillTarget({
                      employeeId: request.employeeId,
                      request,
                    })
                  }
                />
              ))}
            </div>
          )}
        </Card>
      )}

      <UploadDocumentModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        selfEmployeeId={employeeId}
        role={role}
      />

      <FulfillRequestModal
        open={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        employeeId={fulfillTarget?.employeeId ?? ""}
        request={fulfillTarget?.request ?? null}
        onSuccess={() => {
          if (fulfillTarget)
            invalidateAfterFulfillment(fulfillTarget.employeeId);
        }}
      />

      <RequestDocumentModal
        open={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        selfEmployeeId={employeeId}
        role={role}
      />

      <RequestCompanyDocumentModal
        open={isRequestCompanyOpen}
        onClose={() => setIsRequestCompanyOpen(false)}
      />
    </div>
  );
}

async function openPrivateDocument(
  id: string,
  fileName: string,
  showToast: (message: string, variant?: "success" | "error" | "info") => void,
) {
  // Open synchronously to avoid popup blockers, then populate it after the
  // authenticated API request completes.
  const popup = window.open("about:blank", "_blank");

  try {
    const blob = await DocumentsApi.download(id);
    const objectUrl = URL.createObjectURL(blob);

    if (popup) {
      popup.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } else {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  } catch (err) {
    popup?.close();
    showToast(getErrorMessage(err), "error");
  }
}

function DocumentRow({ doc, canManage }: { doc: any; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const deleteMutation = useMutation({
    mutationFn: () => DocumentsApi.delete(doc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", doc.employeeId],
      });
      showToast("Document removed.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.025)] transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_10px_22px_rgba(79,70,229,0.07)]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 p-2.5 text-indigo-600 ring-1 ring-indigo-100">
          <FileText size={16} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {doc.fileName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
            <Badge tone="neutral">{String(doc.type).replace(/_/g, " ")}</Badge>
            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() =>
            void openPrivateDocument(doc.id, doc.fileName, showToast)
          }
          className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white px-2.5 text-[12px] font-medium text-ink hover:border-brand-300 hover:text-brand-700"
        >
          <Download size={14} className="mr-1.5" />
          Open
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-danger-200 bg-danger-50 px-2.5 text-[12px] font-medium text-danger-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={14} className="mr-1.5" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function AssetRow({ asset, canManage }: { asset: Asset; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [status, setStatus] = useState(asset.status);

  const mutation = useMutation({
    mutationFn: (nextStatus: string) =>
      DocumentsApi.updateAssetStatus(asset.id, nextStatus),
    onSuccess: (updated) => {
      const updatedAsset = updated as Asset;
      setStatus(updatedAsset.status);
      queryClient.invalidateQueries({ queryKey: ["assets", asset.employeeId] });
      showToast("Asset status updated.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.025)] transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_10px_22px_rgba(14,165,233,0.07)]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{asset.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <UserRound size={12} /> {asset.firstName ?? "Employee"}{" "}
            {asset.lastName ?? ""}
          </span>
          <span className="font-mono">{asset.assetTag}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={status} />
        {canManage && (
          <select
            value={status}
            onChange={(e) => mutation.mutate(e.target.value)}
            disabled={mutation.isPending}
            className="h-8 rounded-lg border border-line bg-white px-2 text-[12px] text-ink outline-none focus:border-brand-400"
          >
            <option value="ASSIGNED">Assigned</option>
            <option value="RETURNED">Returned</option>
            <option value="DAMAGED">Damaged</option>
            <option value="LOST">Lost</option>
          </select>
        )}
      </div>
    </div>
  );
}

// A COMPANY_TO_EMPLOYEE request, shown to the employee it targets.
function IncomingRequestRow({
  request,
  onUpload,
}: {
  request: any;
  onUpload: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.025)] transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_10px_22px_rgba(14,165,233,0.07)]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">
          {typeLabel(request.type)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
          {request.note && <span className="truncate">{request.note}</span>}
          <span>
            Requested {new Date(request.requestedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={request.status} />
        {request.status === "PENDING" && (
          <Button size="sm" leftIcon={<Upload size={14} />} onClick={onUpload}>
            Upload
          </Button>
        )}
      </div>
    </div>
  );
}

// An EMPLOYEE_TO_COMPANY request, shown to the employee who raised it.
function OutgoingRequestRow({
  request,
  document,
}: {
  request: any;
  document: any;
}) {
  const { showToast } = useToast();

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.025)] transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_10px_22px_rgba(14,165,233,0.07)]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">
          {typeLabel(request.type)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
          {request.note && <span className="truncate">{request.note}</span>}
          <span>
            Requested {new Date(request.requestedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={request.status} />
        {request.status === "UPLOADED" && document && (
          <button
            type="button"
            onClick={() =>
              void openPrivateDocument(
                document.id,
                document.fileName,
                showToast,
              )
            }
            className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white px-2.5 text-[12px] font-medium text-ink hover:border-brand-300 hover:text-brand-700"
          >
            <Download size={14} className="mr-1.5" />
            Open
          </button>
        )}
      </div>
    </div>
  );
}

// An EMPLOYEE_TO_COMPANY request, shown to HR/admin users who need to
// fulfil it.
function CompanyRequestRow({
  request,
  onUpload,
}: {
  request: any;
  onUpload: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-3.5 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.025)] transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_10px_22px_rgba(14,165,233,0.07)]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">
          {typeLabel(request.type)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <UserRound size={12} /> {request.firstName ?? "Employee"}{" "}
            {request.lastName ?? ""}
          </span>
          {request.note && <span className="truncate">{request.note}</span>}
          <span>
            Requested {new Date(request.requestedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={request.status} />
        {request.status === "PENDING" && (
          <Button size="sm" leftIcon={<Upload size={14} />} onClick={onUpload}>
            Upload
          </Button>
        )}
      </div>
    </div>
  );
}

// Direct, non-request-based upload — give (upload) a document to an employee.
// Only opened for SUPER_ADMIN /
// HR_ADMIN / MANAGER (see canManage), so the employee picker below is
// always shown. Defaults to the current user's own record; MANAGERs are
// scoped to only the employees assigned to them, HR/Admin can pick anyone.
function UploadDocumentModal({
  open,
  onClose,
  selfEmployeeId,
  role,
}: {
  open: boolean;
  onClose: () => void;
  selfEmployeeId: string;
  role?: string;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] =
    useState<(typeof DOC_TYPES)[number]["value"]>("OFFER_LETTER");
  const [targetEmployeeId, setTargetEmployeeId] = useState(selfEmployeeId);

  const isManager = role === "MANAGER";

  const { data: employeesData } = useQuery({
    queryKey: ["employees", "for-document-upload", isManager, selfEmployeeId],
    queryFn: () =>
      EmployeesApi.list(
        isManager
          ? { managerId: selfEmployeeId, pageSize: 100 }
          : { pageSize: 100 },
      ),
    enabled: open,
  });
  const employees = employeesData?.employees ?? [];

  const mutation = useMutation({
    mutationFn: () => DocumentsApi.upload(targetEmployeeId, file!, type),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", targetEmployeeId],
      });
      setFile(null);
      setType("OFFER_LETTER");
      setTargetEmployeeId(selfEmployeeId);
      showToast("Document uploaded.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={!file || !targetEmployeeId}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Employee <span className="text-danger-500">*</span>
          </label>
          <select
            value={targetEmployeeId}
            onChange={(e) => setTargetEmployeeId(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-brand-400"
          >
            <option value={selfEmployeeId}>Myself</option>
            {employees
              .filter((emp: any) => emp.id !== selfEmployeeId)
              .map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Document type <span className="text-danger-500">*</span>
          </label>
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as (typeof DOC_TYPES)[number]["value"])
            }
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-brand-400"
          >
            {DOC_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            File <span className="text-danger-500">*</span>
          </label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-2.5 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-700"
          />
        </div>
      </div>
    </Modal>
  );
}

// Upload against an existing request (either direction). The document type
// is locked to the request's type, and requestId is always sent so the
// backend associates and completes the correct request.
function FulfillRequestModal({
  open,
  onClose,
  employeeId,
  request,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  request: any | null;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      DocumentsApi.upload(employeeId, file!, request!.type, request!.id),
    onSuccess: () => {
      setFile(null);
      showToast("Document uploaded.");
      onSuccess();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  if (!request) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload requested document"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={!file}
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Document type <span className="text-danger-500">*</span>
          </label>
          <div className="mt-1.5 flex h-10 w-full items-center rounded-xl border border-line bg-surface px-3.5 text-sm text-ink-soft">
            {typeLabel(request.type)}
          </div>
        </div>
        {request.note && (
          <div>
            <label className="text-[13px] font-medium text-ink-soft">
              Note
            </label>
            <p className="mt-1.5 text-sm text-ink-soft">{request.note}</p>
          </div>
        )}
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            File <span className="text-danger-500">*</span>
          </label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-2.5 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-700"
          />
        </div>
      </div>
    </Modal>
  );
}

// HR/Admin/Manager requesting a document FROM an employee.
function RequestDocumentModal({
  open,
  onClose,
  selfEmployeeId,
  role,
}: {
  open: boolean;
  onClose: () => void;
  selfEmployeeId: string;
  role?: string;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [type, setType] = useState<EmployeeProvidedDocType>("ID_PROOF");
  const [note, setNote] = useState("");

  const isManager = role === "MANAGER";

  // A MANAGER can only request documents from employees assigned to them;
  // SUPER_ADMIN/HR_ADMIN can request from anyone in the company.
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: [
      "employees",
      "for-document-request",
      isManager,
      selfEmployeeId,
      employeeSearch,
    ],
    queryFn: () =>
      EmployeesApi.list(
        isManager
          ? {
              managerId: selfEmployeeId,
              pageSize: 100,
              search: employeeSearch.trim() || undefined,
            }
          : { search: employeeSearch.trim() || undefined, pageSize: 100 },
      ),
    enabled: open,
  });
  const employees = useMemo(() => {
    return [...(employeesData?.employees ?? [])].sort((a: any, b: any) => {
      const nameA = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
      const nameB = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim();
      return nameA.localeCompare(nameB, undefined, {
        sensitivity: "base",
      });
    });
  }, [employeesData?.employees]);

  const mutation = useMutation({
    mutationFn: () =>
      DocumentsApi.requestDocument({
        employeeId: selectedEmployeeId,
        type,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      setSelectedEmployeeId("");
      setEmployeeSearch("");
      setType("ID_PROOF");
      setNote("");
      showToast("Document request sent.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request document"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={!selectedEmployeeId}
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Employee <span className="text-danger-500">*</span>
          </label>
          <input
            type="text"
            value={employeeSearch}
            onChange={(e) => {
              setEmployeeSearch(e.target.value);
              setSelectedEmployeeId("");
            }}
            placeholder="Search employee..."
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-brand-400"
          />

          <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-line bg-white">
            {employeesLoading ? (
              <div className="px-3.5 py-3 text-sm text-ink-faint">
                Loading employees...
              </div>
            ) : employees.length > 0 ? (
              employees.map((emp: any) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => {
                    setSelectedEmployeeId(emp.id);
                    setEmployeeSearch(
                      `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim(),
                    );
                  }}
                  className={`block w-full px-3.5 py-2.5 text-left text-sm hover:bg-brand-50 ${
                    selectedEmployeeId === emp.id
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink"
                  }`}
                >
                  {emp.firstName} {emp.lastName}
                </button>
              ))
            ) : employeeSearch.trim() ? (
              <div className="px-3.5 py-3 text-sm text-ink-faint">
                No employees found
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Document type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EmployeeProvidedDocType)}
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-brand-400"
          >
            {EMPLOYEE_PROVIDED_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1.5 block w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-brand-400"
            placeholder="Add any context for the employee..."
          />
        </div>
      </div>
    </Modal>
  );
}

// Employee requesting a company-issued document FOR themselves.
function RequestCompanyDocumentModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<CompanyIssuedDocType>("OFFER_LETTER");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      DocumentsApi.requestCompanyDocument({
        type,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-requests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["company-document-requests"],
      });
      setType("OFFER_LETTER");
      setNote("");
      showToast("Request submitted.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request a company document"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
          >
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Document type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CompanyIssuedDocType)}
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-brand-400"
          >
            {COMPANY_ISSUED_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Reason / note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1.5 block w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-brand-400"
            placeholder="Let HR know why you need this..."
          />
        </div>
      </div>
    </Modal>
  );
}
