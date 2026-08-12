import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, Download, Trash2, Briefcase, UserRound, FileBadge2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { DocumentsApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Skeleton, EmptyState } from "@/components/ui/EmptyState";
import type { Asset } from "@/types";

const DOC_TYPES = [
  { value: "OFFER_LETTER", label: "Offer letter" },
  { value: "ID_PROOF", label: "ID proof" },
  { value: "ADDRESS_PROOF", label: "Address proof" },
  { value: "EDUCATIONAL", label: "Educational" },
  { value: "CONTRACT", label: "Contract" },
  { value: "OTHER", label: "Other" },
] as const;

export default function Documents() {
  const { user } = useAuth();
  const employeeId = user?.employee?.id ?? "";
  const canManage = !!user && ["SUPER_ADMIN", "HR_ADMIN"].includes(user.role);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Uploaded employee records, compliance files, and assigned company assets."
        action={
          canManage && (
            <Button size="sm" leftIcon={<Upload size={14} />} onClick={() => setIsUploadOpen(true)}>
              Upload document
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Employee documents" subtitle="All documents visible to the employee and HR admins." />
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
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} canManage={canManage} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Assigned assets" subtitle="Laptop, phone, and other equipment allocated to the employee." />
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

      <UploadDocumentModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        employeeId={employeeId}
      />
    </div>
  );
}

function DocumentRow({ doc, canManage }: { doc: any; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const deleteMutation = useMutation({
    mutationFn: () => DocumentsApi.delete(doc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", doc.employeeId] });
      showToast("Document removed.");
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-xl bg-brand-50 p-2 text-brand-600">
          <FileText size={16} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{doc.fileName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
            <Badge tone="neutral">{String(doc.type).replace(/_/g, " ")}</Badge>
            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white px-2.5 text-[12px] font-medium text-ink hover:border-brand-300 hover:text-brand-700"
        >
          <Download size={14} className="mr-1.5" />
          Open
        </a>
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
    mutationFn: (nextStatus: string) => DocumentsApi.updateAssetStatus(asset.id, nextStatus),
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
          <span className="inline-flex items-center gap-1"><UserRound size={12} /> {asset.firstName ?? "Employee"} {asset.lastName ?? ""}</span>
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

function UploadDocumentModal({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<(typeof DOC_TYPES)[number]["value"]>("OFFER_LETTER");

  const mutation = useMutation({
    mutationFn: () => DocumentsApi.upload(employeeId, file!, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", employeeId] });
      setFile(null);
      setType("OFFER_LETTER");
      showToast("Document uploaded.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Upload document" size="md" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending} disabled={!file}>
          Upload
        </Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="text-[13px] font-medium text-ink-soft">Document type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as (typeof DOC_TYPES)[number]["value"])}
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-brand-400"
          >
            {DOC_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">File</label>
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
