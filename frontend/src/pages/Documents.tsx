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

import { EmployeesApi } from "@/lib/endpoints";
import {
  DocumentsApi,
} from "@/lib/endpoints";

import {
  type CompanyIssuedDocType,
  type EmployeeProvidedDocType,
} from "@/api/recruitment";

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

 

// -----------------------------------------------------------------------------

// NEW FEATURE: Smart Document Compliance

// -----------------------------------------------------------------------------

// These rules are used only by the new compliance card below. They do not

// change the existing upload, request, download, delete, or asset flows.

type DocumentRequirement = {

  type: (typeof DOC_TYPES)[number]["value"];

  label: string;

  required: boolean;

};

 

const EXPIRING_SOON_DAYS = 30;

 

function getDocumentExpiryStatus(expiryDate?: string | null) {

  if (!expiryDate) return "NONE" as const;

 

  const expiry = new Date(`${expiryDate}T23:59:59`);

  if (Number.isNaN(expiry.getTime())) return "NONE" as const;

 

  const now = new Date();

  if (expiry.getTime() < now.getTime()) return "EXPIRED" as const;

 

  const daysRemaining = Math.ceil(

    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),

  );

 

  return daysRemaining <= EXPIRING_SOON_DAYS

    ? "EXPIRING_SOON" as const

    : "VALID" as const;

}

 

function formatExpiryDate(expiryDate?: string | null) {

  if (!expiryDate) return null;

  const expiry = new Date(`${expiryDate}T00:00:00`);

  if (Number.isNaN(expiry.getTime())) return null;

  return expiry.toLocaleDateString();

}

 

const DOCUMENT_REQUIREMENTS: DocumentRequirement[] = [

  { type: "ID_PROOF", label: "ID proof", required: true },

  { type: "ADDRESS_PROOF", label: "Address proof", required: true },

  { type: "EDUCATIONAL", label: "Educational certificate", required: true },

  { type: "CONTRACT", label: "Employment contract", required: true },

  { type: "OFFER_LETTER", label: "Offer letter", required: true },

];

 

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
  const [showInsights,setShowInsights ] = useState(false);
  void showInsights;
void setShowInsights;

  const { user, hasPermission } = useAuth();

  const employeeId = user?.employee?.id ?? "";

  const role = user?.role;
  const canManageDocuments =
  !!role && ["SUPER_ADMIN", "HR_ADMIN"].includes(role);

const [selectedEmployeeId, setSelectedEmployeeId] =
  useState(employeeId);

const { data: employeesData } = useQuery({
  queryKey: ["employees", "documents-management"],
  queryFn: () => EmployeesApi.list({ pageSize: 100 }),
  enabled: canManageDocuments,
});

const documentEmployeeId = canManageDocuments
  ? selectedEmployeeId
  : employeeId;

 

  // Governance controls management/review actions. Employees can upload their own documents.
  const canManage = hasPermission("documents.manage");
  const canUploadOwn = !!employeeId;

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

    queryKey: ["documents", documentEmployeeId],

queryFn: () => DocumentsApi.list(documentEmployeeId),
    enabled: !!documentEmployeeId,
    refetchInterval: 5000,

  });

 

  const { data: assets = [], isLoading: assetsLoading } = useQuery({

    queryKey: ["assets", employeeId],

    queryFn: () => DocumentsApi.assetsForEmployee(employeeId),

    enabled: !!documentEmployeeId,

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

 

  // NEW FEATURE: automatically calculate the current employee's document

  // compliance from the documents already returned by the existing API.

  const compliance = useMemo(() => {

    const requiredDocuments = DOCUMENT_REQUIREMENTS.filter(

      (requirement) => requirement.required,

    );

 

    const complianceItems = requiredDocuments.map((requirement) => {

      const document = documents.find(

        (item: any) => item.type === requirement.type,

      );

 

      return {

        ...requirement,

        document: document ?? null,

        status: document ? "COMPLETE" : "MISSING",

        expiryStatus: getDocumentExpiryStatus(document?.expiryDate),

      };

    });

 

    const completed = complianceItems.filter(

      (item) =>

        item.status === "COMPLETE" && item.expiryStatus !== "EXPIRED",

    ).length;

 

        const expiringDocuments = documents.filter(
      (document: any) =>
        getDocumentExpiryStatus(document.expiryDate) === "EXPIRING_SOON",
    );

    const expiredDocuments = documents.filter(
      (document: any) =>
        getDocumentExpiryStatus(document.expiryDate) === "EXPIRED",
    );

    const total = complianceItems.length;

    const missingDocuments = complianceItems.filter(
      (item) => item.status === "MISSING",
    );



    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

 

    return {

      total,

      completed,

      missing: total - completed,

      percentage,

      isComplete: completed === total,

      missingDocuments,

      complianceItems,

      expiringDocuments,

      expiredDocuments,
  

    };

  }, [documents]);

 

  const documentForRequest = (requestId: string) =>

    documents.find((d: any) => d.requestId === requestId);

 

  const invalidateAfterFulfillment = (targetEmployeeId: string) => {

    queryClient.invalidateQueries({

      queryKey: ["documents", targetEmployeeId],

    });

    queryClient.invalidateQueries({ queryKey: ["document-requests"] });

    queryClient.invalidateQueries({ queryKey: ["company-document-requests"] });

  };

 

  return (

    <div className="space-y-6">

      <PageHeader

        title="Documents"

        subtitle="Uploaded employee records, compliance files, and assigned company assets."

        action={

          <div className="flex items-center gap-2">

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

            {(canManage || canUploadOwn) && (
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

      {/* Document Insights */}
{!!employeeId && (
  <Card id="document-compliance" className="mb-6">
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">
             Document Insights
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Review document compliance and identify important issues.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setShowInsights((value) => !value)}
        >
          ✨ {showInsights ? "Hide insights" : "Show insights"}
        </Button>
      </div>

      {showInsights && (
        <div className="space-y-4">
          {canManageDocuments && (
            <div>
              <label className="text-sm font-medium text-ink">
                Employee
              </label>

              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-400"
              >
                {employeesData?.employees?.map((employee: any) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-faint">
                Overall compliance
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {compliance.percentage}%
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-faint">
                Missing documents
              </p>
              <p className="mt-1 text-2xl font-semibold text-danger-700">
                {compliance.missing}
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-faint">
                Valid documents
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">
                {compliance.completed}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
  <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
    <p className="text-xs font-medium text-amber-700">
      Expiring soon
    </p>
    <p className="mt-1 text-2xl font-semibold text-ink">
      {compliance.expiringDocuments.length}
    </p>
  </div>

  <div className="rounded-xl border border-danger-100 bg-danger-50/40 p-4">
    <p className="text-xs font-medium text-danger-700">
      Expired documents
    </p>
    <p className="mt-1 text-2xl font-semibold text-ink">
      {compliance.expiredDocuments.length}
    </p>
  </div>
</div>

          

          <div className="flex flex-wrap gap-2 pt-1">
           

            {canRequestFromEmployee && (
              <Button
                size="sm"
                onClick={() => setIsRequestOpen(true)}
              >
                Request missing documents
              </Button>
            )}

            
          </div>
        </div>
      )}
    </div>
  </Card>
)}

      {/* -----------------------------------------------------------------
          

 

      {/* -----------------------------------------------------------------

          NEW FEATURE: Smart Document Compliance card

          Existing document/asset/request sections remain unchanged below.

          ----------------------------------------------------------------- */}

      

 

      <div className="grid gap-6">

        <Card>

          <CardHeader

            title="My documents"

            subtitle="All documents visible to the employee and HR admins."

          />
          {canManageDocuments && (
  <select
    value={selectedEmployeeId}
    onChange={(e) => setSelectedEmployeeId(e.target.value)}
    className="h-9 rounded-lg border border-line bg-white px-3 text-sm"
  >
    {employeesData?.employees?.map((employee: any) => (
      <option key={employee.id} value={employee.id}>
        {employee.firstName} {employee.lastName}
      </option>
    ))}
  </select>
)}

          {docsLoading ? (

            <Skeleton className="h-40 rounded-2xl" />

          ) : !documents.length ? (

            <EmptyState

              icon={FileBadge2}

              title="No documents uploaded"

              description="Offer letters, identity proof, and employee records will appear here."

            />

          ) : (

            <div id="documents-list" className="space-y-2">

              {documents.map((doc: any) => (

                <DocumentRow key={doc.id} doc={doc} />

              ))}

            </div>

          )}

        </Card>

 

        <Card>

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

              {assets.map((asset) => (

                <AssetRow key={asset.id} asset={asset} canManage={canManage} />

              ))}

            </div>

          )}

        </Card>

      </div>

 

      {!!employeeId && (

        <div className="grid gap-6">

          <Card>

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

 

          <Card>

            <div className="flex items-center justify-between gap-3">

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

        <Card>

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
void openPrivateDocument;
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

 
const DOCUMENT_REJECTION_REASONS = [
  "Document is unclear",
  "Wrong document uploaded",
  "Document has expired",
  "Details do not match",
  "Document is incomplete",
] as const;
function DocumentRow({ doc }: { doc: any }): JSX.Element {

  const queryClient = useQueryClient();

  const { showToast } = useToast();
  const { user, hasPermission } = useAuth();
  const canDelete =
  user?.role !== "EMPLOYEE" &&
  (doc.uploadedBy === user?.id || hasPermission("documents.manage"));
  
  const canReview =
  hasPermission("documents.manage") &&
  String(doc.status).trim().toUpperCase() === "PENDING";
  console.log("DOCUMENT REVIEW DEBUG", {
  role: user?.role,
  canManage: hasPermission("documents.manage"),
  status: doc.status,
});

  const deleteMutation = useMutation({

    mutationFn: () => DocumentsApi.delete(doc.id),

    onSuccess: (_data) => {
      queryClient.invalidateQueries({

        queryKey: ["documents", doc.employeeId],

      });

      showToast("Document removed.");

    },

    onError: (err) => showToast(getErrorMessage(err), "error"),

  });
  const reviewMutation = useMutation({
  mutationFn: ({
    status,
    rejectionReason,
  }: {
    status: "VERIFIED" | "REJECTED";
    rejectionReason?: string;
  }) => DocumentsApi.review(doc.id, status, rejectionReason),

  onSuccess: (_data, variables) => {

  queryClient.invalidateQueries({

    queryKey: ["documents", doc.employeeId],

  });

  showToast(
  variables.status === "REJECTED"
    ? "Document rejected."
    : "Document verified.",
  variables.status === "REJECTED" ? "error" : "success"
);

},

onError: (err) => showToast(getErrorMessage(err), "error"),

});
const expiryMutation = useMutation({
  mutationFn: (expiryDate: string | null) =>
    DocumentsApi.updateExpiryDate(doc.id, expiryDate),

  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["documents", doc.employeeId],
    });

    showToast("Expiry date updated.", "success");
  },

  onError: (err) => showToast(getErrorMessage(err), "error"),
});


const [showRejectOptions, setShowRejectOptions] = useState(false);

 

  return (

    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-3">

      <div className="flex min-w-0 items-center gap-3">

        <div className="rounded-xl bg-brand-50 p-2 text-brand-600">

          <FileText size={16} />

        </div>

        <div className="min-w-0">

          <p className="truncate text-sm font-medium text-ink">

            {doc.fileName}

          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">

            <Badge tone="neutral">{String(doc.type).replace(/_/g, " ")}</Badge>

            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>

            {getDocumentExpiryStatus(doc.expiryDate) === "EXPIRED" && (

              <span className="rounded-full bg-danger-50 px-2 py-0.5 font-semibold text-danger-700">

                Expired

              </span>

            )}

            {getDocumentExpiryStatus(doc.expiryDate) === "EXPIRING_SOON" && (

              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">

                Expires {formatExpiryDate(doc.expiryDate)}

              </span>

            )}

            {getDocumentExpiryStatus(doc.expiryDate) === "VALID" && (

              <span>Expires {formatExpiryDate(doc.expiryDate)}</span>

            )}
            {doc.status === "PENDING" && (
  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
    Verification Pending
  </span>
)}

{doc.status === "VERIFIED" && (
  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
    ✓ Verified
  </span>
)}

{doc.status === "REJECTED" && (
  <span className="rounded-full bg-danger-50 px-2 py-0.5 font-semibold text-danger-700">
    ✕ Rejected
  </span>
)}
{doc.status !== "PENDING" && doc.reviewedAt && (
  <div className="mt-2 text-xs text-muted">
    <div>
  Reviewed by:{" "}
  <span className="font-medium text-ink">
  {doc.reviewedBy ?? ""}
</span>
</div>

    <div>
      Reviewed on:{" "}
      <span className="font-medium text-ink">
        {new Date(doc.reviewedAt).toLocaleString()}
      </span>
    </div>
  </div>
)}

          </div>

        </div>

      </div>

 

      

        <div className="grid grid-cols-2 gap-2">

  <a
    href={doc.fileUrl}
    target="_blank"
    rel="noreferrer"
    className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white px-2.5 text-[12px] font-medium text-ink hover:border-brand-300 hover:text-brand-700"
  >
    <Download size={14} className="mr-1.5" />
    Open
  </a>

  {canDelete && (
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

  {canReview && (
    <button
      type="button"
      onClick={() => reviewMutation.mutate({ status: "VERIFIED" })}
      disabled={reviewMutation.isPending}
      className="inline-flex h-8 items-center justify-center rounded-lg border border-green-200 bg-green-50 px-2.5 text-[12px] font-medium text-green-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Verify
    </button>
  )}

  {canReview && (
    <button
      type="button"
      onClick={() => setShowRejectOptions(true)}
      disabled={reviewMutation.isPending}
      className="inline-flex h-8 items-center justify-center rounded-lg border border-danger-200 bg-danger-50 px-2.5 text-[12px] font-medium text-danger-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Reject
    </button>
  )}
  {canReview && (
  <div className="inline-flex flex-col gap-1">
    <label className="text-[12px] font-medium text-slate-600">
      Expiry date
    </label>

    <input
      type="date"
      value={
        doc.expiryDate
          ? String(doc.expiryDate).slice(0, 10)
          : ""
      }
      onChange={(e) => {
        expiryMutation.mutate(e.target.value || null);
      }}
      disabled={expiryMutation.isPending}
      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-brand-400 focus:ring-0"
    />
  </div>
)}
   
  {showRejectOptions && (
    <div className="col-span-2 mt-2 grid gap-2 rounded-xl border border-line bg-white p-3 shadow-lg">
      {DOCUMENT_REJECTION_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          onClick={() => {
            reviewMutation.mutate({
              status: "REJECTED",
              rejectionReason: reason,
            });
            setShowRejectOptions(false);
          }}
          className="block w-full rounded-lg border border-line bg-surface px-3 py-3 text-left text-xs font-medium text-ink shadow-sm hover:border-brand-300 hover:bg-white"
        >
          {reason}
        </button>
      ))}
    </div>
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

      setStatus(updated.status);

      queryClient.invalidateQueries({ queryKey: ["assets", asset.employeeId] });

      showToast("Asset status updated.");

    },

    onError: (err) => showToast(getErrorMessage(err), "error"),

  });

 

  return (

    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-3">

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

    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-3">

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

  return (

    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-3">

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

          <a

            href={document.fileUrl}

            target="_blank"

            rel="noreferrer"

            className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white px-2.5 text-[12px] font-medium text-ink hover:border-brand-300 hover:text-brand-700"

          >

            <Download size={14} className="mr-1.5" />

            Open

          </a>

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

    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-3">

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

  const [expiryDate, setExpiryDate] = useState("");

 

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
  mutationFn: async () => {
    const uploaded = await DocumentsApi.upload(
      targetEmployeeId,
      file!,
      type,
    );

    if (expiryDate && uploaded?.id) {
      await DocumentsApi.updateExpiryDate(
        uploaded.id,
        expiryDate,
      );
    }

    return uploaded;
  },

  onSuccess: (_data) => {

      queryClient.invalidateQueries({

        queryKey: ["documents", targetEmployeeId],

      });

      setFile(null);

      setType("OFFER_LETTER");

      setTargetEmployeeId(selfEmployeeId);

      setExpiryDate("");

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

            {role && ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(role) &&
  employees
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

        {role !== "EMPLOYEE" && (
  <div>
    <label className="text-[13px] font-medium text-ink-soft">
      Expiry date{" "}
      <span className="text-ink-faint">(optional)</span>
    </label>

    <input
      type="date"
      value={expiryDate}
      onChange={(e) => setExpiryDate(e.target.value)}
      className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-brand-400 focus:ring-0"
    />

    <p className="mt-1 text-[11px] text-ink-faint">
      Select the date this document expires. This is used by Smart Document
      Compliance to identify expired and soon-to-expire documents.
    </p>
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

  const [, setExpiryDate] = useState("");

 

  const mutation = useMutation({

    mutationFn: () =>

      DocumentsApi.upload(

        employeeId,

        file!,

        request!.type,

        request!.id,
        

        

      ),

    onSuccess: () => {

      setFile(null);

      setExpiryDate("");

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