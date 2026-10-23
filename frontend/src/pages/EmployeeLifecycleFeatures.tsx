
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api } from "@/lib/api";
import { EmployeesApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  CalendarDays,
  FileText,
  UserRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

type Employee = {
  id: string;
  userId?: string | null;
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  departmentName?: string | null;
  designationTitle?: string | null;
  status?: string;
  dateOfJoining?: string | null;
  probationStartDate?: string | null;
  probationEndDate?: string | null;
};

type JobHistoryEntry = {
  _id?: string;
  changedAt?: string;
  changedBy?: string;
  reason?: string | null;
  previous?: Record<string, unknown>;
  next?: Record<string, unknown>;
};


const JOB_HISTORY_LABELS: Record<string, string> = {
  departmentId: "Department",
  designationId: "Designation",
  managerId: "Reporting Manager",
  grade: "Grade",
  workLocation: "Work Location",
};

type JobHistoryEmployeeLookup = Employee & {
  departmentId?: unknown;
  designationId?: unknown;
  managerId?: unknown;
  grade?: unknown;
};

function normaliseHistoryId(value: unknown): string {
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    value = item._id ?? item.id ?? item.value;
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function buildJobHistoryNameLookup(
  employees: Employee[],
  organizationNames: Map<string, string> = new Map(),
) {
  const lookup = new Map<string, string>(organizationNames);
  for (const rawEmployee of employees as JobHistoryEmployeeLookup[]) {
    const employeeName = `${rawEmployee.firstName ?? ""} ${rawEmployee.lastName ?? ""}`.trim();
    const pairs: Array<[unknown, unknown]> = [
      [rawEmployee.departmentId, rawEmployee.departmentName],
      [rawEmployee.designationId, rawEmployee.designationTitle],
      [rawEmployee.managerId, employeeName],
      [rawEmployee.id, employeeName],
    ];
    for (const [idValue, labelValue] of pairs) {
      const id = normaliseHistoryId(idValue);
      const label = typeof labelValue === "string" ? labelValue.trim() : "";
      if (id && label && !lookup.has(id)) lookup.set(id, label);
    }
  }
  return lookup;
}

function formatJobHistoryValue(
  value: unknown,
  field: string,
  nameLookup: Map<string, string>,
): string {
  if (value === null || value === undefined || value === "") {
    return "Not assigned";
  }

  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    const name = item.name ?? item.title ?? item.label ?? item.displayName ?? item.fullName;
    if (name !== undefined && name !== null && String(name).trim()) return String(name);
    value = item._id ?? item.id ?? item.value;
    if (value === null || value === undefined || value === "") return "Unavailable";
  }

  const raw = String(value).trim();
  if (!raw) return "Not assigned";
  if (["departmentId", "designationId", "managerId"].includes(field)) {
    return nameLookup.get(raw) ?? raw;
  }
  return raw;
}

function getJobHistoryChanges(
  entry: JobHistoryEntry,
  employees: Employee[],
  organizationNames: Map<string, string> = new Map(),
) {
  const previous = entry.previous ?? {};
  const next = entry.next ?? {};
  const nameLookup = buildJobHistoryNameLookup(employees, organizationNames);

  return Object.keys(JOB_HISTORY_LABELS)
    .filter((field) => {
      const oldValue = formatJobHistoryValue(previous[field], field, nameLookup);
      const newValue = formatJobHistoryValue(next[field], field, nameLookup);
      return oldValue !== newValue;
    })
    .map((field) => ({
      field,
      label: JOB_HISTORY_LABELS[field],
      previous: formatJobHistoryValue(previous[field], field, nameLookup),
      next: formatJobHistoryValue(next[field], field, nameLookup),
    }));
}


type SensitiveRequest = {
  _id: string;
  fields?: string[];
  requestedAt?: string;
  status?: string;
  reason?: string | null;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  reviewedByRole?: string | null;
  documentAvailable?: boolean;
  documentMimeType?: string | null;
  nextEligibleAt?: string | null;
};

type PendingRequest = {
  employeeId: string;
  employeeCode?: string;
  employeeName: string;
  request: SensitiveRequest;
};

type AdminHistoryRequest = {
  employeeId: string;
  employeeCode?: string | null;
  employeeName: string;
  request: SensitiveRequest;
};

const FIELD_LABELS: Record<string, string> = {
  employeeAadhaar: "Aadhaar",
  employeePan: "PAN",
  employeeTan: "TAN",
  bankAccountNumber: "Bank Account Number",
  bankIfscCode: "Bank IFSC Code",
  bankBranch: "Bank Branch",
  investmentDeclarations: "Investment Declarations",
  signature: "Signature",
};

function sensitiveFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
}

function formatChangedBy(
  changedBy: string | undefined,
  currentUser: unknown,
  employees: Employee[],
) {
  if (!changedBy) return "—";
  const authUser = (currentUser ?? {}) as Record<string, unknown>;
  const currentId = String(authUser.id ?? authUser.userId ?? "");
  if (currentId && currentId === changedBy) {
    const fullName = [authUser.firstName, authUser.lastName]
      .filter(Boolean)
      .join(" ");
    const currentName = authUser.name ?? authUser.fullName ?? fullName;
    if (currentName && String(currentName).trim()) return String(currentName);
  }
  const employee = employees.find((item) => String(item.userId ?? "") === changedBy);
  if (employee) {
    const name = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
    if (name) return name;
  }
  // Never expose internal user IDs in the UI when the actor is not in the employee list.
  return "HR/Admin user";
}

function getError(error: unknown): string {
  const e = error as {
    response?: {
      data?: { message?: unknown; error?: unknown };
    };
    message?: unknown;
  };

  const data = e?.response?.data;
  const message =
    typeof data?.message === "string"
      ? data.message
      : typeof data?.error === "string"
        ? data.error
        : typeof e?.message === "string"
          ? e.message
          : "Something went wrong. Please try again.";

  return message;
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        {icon}
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Status({ value }: { value?: string }) {
  const status = (value || "UNKNOWN").toUpperCase();

  const styles: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-800",
    ON_PROBATION: "bg-amber-100 text-amber-800",
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-rose-100 text-rose-800",
    TERMINATED: "bg-rose-100 text-rose-800",
    RESIGNED: "bg-slate-100 text-slate-700",
  };

  const labels: Record<string, string> = {
    PENDING: "Pending HR Approval",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    ON_PROBATION: "On Probation",
  };

  return (
    <span
  className={`inline-flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${
    styles[status] || "bg-slate-100 text-slate-700"
  }`}
>
  {labels[status] || status.replaceAll("_", " ")}
</span>
  );
}

export default function EmployeeLifecycleFeatures() {
  const { user } = useAuth();
  const role = String(user?.role ?? "").toUpperCase();
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const canManageLifecycle = isAdmin || role === "MANAGER";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [organizationNames, setOrganizationNames] = useState<Map<string, string>>(new Map());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [history, setHistory] = useState<JobHistoryEntry[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [adminHistory, setAdminHistory] = useState<AdminHistoryRequest[]>([]);
  const [myRequests, setMyRequests] = useState<SensitiveRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [documentBusy, setDocumentBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [sensitiveField, setSensitiveField] =
    useState("bankAccountNumber");
  const [sensitiveValue, setSensitiveValue] = useState("");
  const [sensitiveReason, setSensitiveReason] = useState("");

  const [sensitiveDocument, setSensitiveDocument] =
  useState<File | null>(null);

  

  const [extendDays, setExtendDays] = useState<
  Record<string, number | "">
>({});
  const [extendRemarks, setExtendRemarks] = useState<Record<string, string>>(
    {},
  );

  const loadEmployees = useCallback(async () => {
    try {
      const result = await EmployeesApi.list({
        page: 1,
        pageSize: 100,
      });

      const rows = Array.isArray(result.employees)
        ? (result.employees as Employee[])
        : [];

      setEmployees(rows);
      // Load authoritative organization names so historical IDs resolve even if no current employee uses them.
      try {
        const [departmentsResponse, designationsResponse] = await Promise.all([
          api.get<{ departments?: Array<Record<string, unknown>> }>("/organization/departments"),
          api.get<{ designations?: Array<Record<string, unknown>> }>("/organization/designations"),
        ]);
        const names = new Map<string, string>();
        for (const department of departmentsResponse.data.departments ?? []) {
          const id = normaliseHistoryId(department.id ?? department._id);
          const name = String(department.name ?? "").trim();
          if (id && name) names.set(id, name);
        }
        for (const designation of designationsResponse.data.designations ?? []) {
          const id = normaliseHistoryId(designation.id ?? designation._id);
          const name = String(designation.title ?? designation.name ?? "").trim();
          if (id && name) names.set(id, name);
        }
        setOrganizationNames(names);
      } catch {
        // Keep employee-derived name resolution as a fallback if organization lookups are unavailable.
        setOrganizationNames(new Map());
      }
      setSelectedEmployeeId((current) => {
        if (current && rows.some((employee) => String(employee.id) === current)) {
          return current;
        }
        return rows[0]?.id ? String(rows[0].id) : "";
      });
    } catch (e) {
      setError(getError(e));
    }
  }, []);

  const loadPendingRequests = useCallback(async () => {
    try {
      const response = await api.get<{ requests?: PendingRequest[] }>(
        "/employees/sensitive-change-requests/pending",
      );

      setPendingRequests(
        Array.isArray(response.data.requests)
          ? response.data.requests
          : [],
      );
    } catch (e) {
      setPendingRequests([]);
      setError(`Unable to load the HR approval queue: ${getError(e)}`);
    }
  }, []);

  const loadAdminHistory = useCallback(async () => {
    if (!isAdmin) {
      setAdminHistory([]);
      return;
    }

    try {
      const response = await api.get<{ requests?: AdminHistoryRequest[] }>(
        "/employees/sensitive-change-requests/history",
        { headers: { "Cache-Control": "no-cache" } },
      );

      setAdminHistory(
        Array.isArray(response.data.requests) ? response.data.requests : [],
      );
    } catch (e) {
      setAdminHistory([]);
      setError(`Unable to load HR review history: ${getError(e)}`);
    }
  }, [isAdmin]);

  const loadMyRequests = useCallback(async () => {
    try {
      const response = await api.get<{ requests?: SensitiveRequest[] }>(
        "/employees/me/sensitive-change-requests",
        { headers: { "Cache-Control": "no-cache" } },
      );

      const requests = Array.isArray(response.data.requests)
        ? response.data.requests
        : [];

      setMyRequests(
        [...requests].sort(
          (a, b) =>
            new Date(b.requestedAt ?? 0).getTime() -
            new Date(a.requestedAt ?? 0).getTime(),
        ),
      );
    } catch (e) {
      setMyRequests([]);
      setError(`Unable to load your sensitive-change history: ${getError(e)}`);
    }
  }, []);

  const loadHistory = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const response = await api.get<{ history?: JobHistoryEntry[] }>(
        `/employees/${encodeURIComponent(employeeId)}/internal-job-history`,
      );
      setHistory(
        Array.isArray(response.data.history) ? response.data.history : [],
      );
    } catch (e) {
      setHistory([]);
      setError(getError(e));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  

  const refresh = useCallback(async () => {
    setLoading(true);
    const tasks: Promise<unknown>[] = [];
    if (!isAdmin) tasks.push(loadMyRequests());
    if (canManageLifecycle) tasks.push(loadEmployees());
    if (isAdmin) {
      tasks.push(loadPendingRequests());
      tasks.push(loadAdminHistory());
    }
    await Promise.all(tasks);
    setLoading(false);
  }, [
    canManageLifecycle,
    isAdmin,
    loadEmployees,
    loadPendingRequests,
    loadAdminHistory,
    loadMyRequests,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (canManageLifecycle) void loadHistory(selectedEmployeeId);
    else setHistory([]);
  }, [selectedEmployeeId, canManageLifecycle, loadHistory]);

  const probationEmployees = employees.filter(
    (employee) => employee.status === "ON_PROBATION",
  );

  const selectedEmployee = employees.find(
    (employee) => String(employee.id) === selectedEmployeeId,
  );

  async function viewSupportingDocument(employeeId: string, requestId: string) {
    // Open a tab synchronously so browsers do not block it while the authenticated
    // document request is being fetched.
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setError("Your browser blocked the document preview. Allow pop-ups for this HRMS page and try again.");
      return;
    }

    previewWindow.document.title = "Supporting document";
    previewWindow.document.body.innerHTML = "<p style='font-family: sans-serif; padding: 1rem'>Loading secure document preview…</p>";
    setDocumentBusy(requestId);
    setError("");

    try {
      const response = await api.get<Blob>(
        `/employees/${encodeURIComponent(employeeId)}/sensitive-change-requests/${encodeURIComponent(requestId)}/document`,
        { responseType: "blob" },
      );
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: "application/octet-stream" });
      const objectUrl = URL.createObjectURL(blob);
      previewWindow.location.href = objectUrl;
      // Revoke the temporary URL after the browser has had time to load the preview.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      previewWindow.close();
      setError(`Unable to open the supporting document: ${getError(e)}`);
    } finally {
      setDocumentBusy("");
    }
  }

  async function confirmProbation(employee: Employee) {
    const id = String(employee.id);

    if (
      !window.confirm(
        `Confirm probation for ${employee.firstName ?? ""} ${employee.lastName ?? ""}?`,
      )
    ) {
      return;
    }

    setBusy(`confirm-${id}`);
    setError("");
    setNotice("");

    try {
      const response = await api.post(
        `/employees/${encodeURIComponent(id)}/confirm-probation`,
      );

      setNotice(
        response.data?.message || "Probation confirmed successfully.",
      );
      await loadEmployees();
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy("");
    }
  }

  async function extendProbation(employee: Employee) {
    const id = String(employee.id);
    const extensionDays = Number(extendDays[id] ?? 30);
    const remarks = (extendRemarks[id] ?? "").trim();

    if (
      !Number.isInteger(extensionDays) ||
      extensionDays < 1 ||
      extensionDays > 365
    ) {
      setError("Enter a probation extension between 1 and 365 days.");
      return;
    }

    if (!remarks) {
      setError("Please enter a reason for extending probation.");
      return;
    }

    setBusy(`extend-${id}`);
    setError("");
    setNotice("");

    try {
      const response = await api.post(
        `/employees/${encodeURIComponent(id)}/extend-probation`,
        { extensionDays, remarks },
      );

      setNotice(
        response.data?.message || "Probation extended successfully.",
      );
      await loadEmployees();
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy("");
    }
  }

async function submitSensitiveRequest(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const value = sensitiveValue.trim();
  const reason = sensitiveReason.trim();

  if (!value || !reason) {
    setError("Enter the new value and the reason for the change.");
    return;
  }

  if (reason.length < 3 || reason.length > 1000) {
    setError("The reason must contain between 3 and 1000 characters.");
    return;
  }

  if (!sensitiveDocument) {
    setError("Please attach a supporting PDF, JPG, or PNG document.");
    return;
  }

  if (sensitiveDocument.size > 5 * 1024 * 1024) {
    setError("The supporting document must be 5 MB or smaller.");
    return;
  }

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowedTypes.includes(sensitiveDocument.type)) {
    setError("Only PDF, JPG, and PNG documents are allowed.");
    return;
  }

  if (
    !window.confirm(
      "Submit this sensitive profile change and supporting document for HR approval?",
    )
  ) {
    return;
  }

  setBusy("submit-sensitive");
  setError("");
  setNotice("");

  try {
    const formData = new FormData();
    formData.append("field", sensitiveField);
    formData.append("value", value);
    formData.append("reason", reason);
    formData.append("document", sensitiveDocument);

    await api.post(
      "/employees/me/sensitive-change-requests",
      formData,
    );

    setNotice(
      "Sensitive change request submitted. The field is restricted for 90 days from submission, regardless of the review result.",
    );

    setSensitiveValue("");
    setSensitiveReason("");
    setSensitiveDocument(null);

    const refreshTasks: Promise<unknown>[] = [loadMyRequests()];

    if (canManageLifecycle) refreshTasks.push(loadEmployees());

    if (isAdmin) {
      refreshTasks.push(loadPendingRequests());
      refreshTasks.push(loadAdminHistory());
    }

    await Promise.all(refreshTasks);
  } catch (e) {
    setError(getError(e));
  } finally {
    setBusy("");
  }
}

  async function reviewRequest(
    item: PendingRequest,
    decision: "APPROVE" | "REJECT",
  ) {
    const comment = window.prompt(
      decision === "APPROVE"
        ? "Optional approval comment:"
        : "Reason for rejection:",
      "",
    );

    if (comment === null) return;

    if (decision === "REJECT" && !comment.trim()) {
      setError("Please provide a rejection reason.");
      return;
    }

    const requestId = item.request?._id;

    if (!requestId) {
      setError("This request has no valid request ID.");
      return;
    }

    const key = `review-${requestId}`;
    setBusy(key);
    setError("");
    setNotice("");

    try {
      const response = await api.post(
        `/employees/${encodeURIComponent(item.employeeId)}/sensitive-change-requests/${encodeURIComponent(requestId)}/review`,
        { decision, comment: comment.trim() },
      );

      if (response.data?.status === "APPROVED") {
        setNotice("Sensitive changes approved and applied.");
      } else if (response.data?.status === "REJECTED") {
        setNotice("Sensitive change request rejected.");
      } else {
        setNotice("Review response received. Refresh to verify its status.");
      }

      await Promise.all([
        loadPendingRequests(),
        loadAdminHistory(),
      ]);
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-800 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-950">
              {canManageLifecycle ? "Employee Lifecycle Management" : "My Profile Change Requests"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {canManageLifecycle
                ? "Job history, probation management, and sensitive profile-change approvals."
                : "Request a change to your bank or identity details and track HR approval."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              className="ml-auto"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
            <button
              type="button"
              className="ml-auto"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {canManageLifecycle && (
          <>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Employees loaded</p>
            <p className="mt-1 text-2xl font-bold">{employees.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Currently on probation</p>
            <p className="mt-1 text-2xl font-bold">
              {probationEmployees.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">
              Sensitive changes awaiting HR
            </p>
            <p className="mt-1 text-2xl font-bold">
              {pendingRequests.length}
            </p>
          </div>
        </div>

        <Panel
          title="Internal Job History"
          icon={<History className="h-5 w-5 text-indigo-600" />}
        >
          <label
            htmlFor="employee-history-select"
            className="mb-1 block text-sm font-semibold text-slate-700"
          >
            Select employee
          </label>

          
          <select
            id="employee-history-select"
            value={selectedEmployeeId}
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            className="mb-4 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode ? `${employee.employeeCode} — ` : ""}
                {employee.firstName} {employee.lastName}
              </option>
            ))}
          </select>

          {selectedEmployee && (
            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-semibold">
                {selectedEmployee.firstName} {selectedEmployee.lastName}
              </p>
              <p className="text-slate-600">
                {selectedEmployee.designationTitle || "No designation"} ·{" "}
                {selectedEmployee.departmentName || "No department"}
              </p>
            </div>
          )}

          {historyLoading ? (
            <p className="py-4 text-sm text-slate-500">
              Loading job history…
            </p>
          ) : history.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              No internal job-history records found for this employee.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((entry, index) => (
                <article
                  key={entry._id || `${entry.changedAt}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="grid gap-4 border-b border-slate-100 pb-3 md:grid-cols-3">
                    <div className="flex items-start gap-2.5">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {formatDate(entry.changedAt)}
                        </p>
                        {formatTime(entry.changedAt) && (
                          <p className="text-xs text-slate-500">
                            {formatTime(entry.changedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex min-w-0 items-start gap-2.5">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-600">Reason</p>
                        <p className="break-words text-sm text-slate-600">
                          {entry.reason?.trim() || "No reason provided"}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-start gap-2.5">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-600">Changed by</p>
                        <p className="break-all text-sm text-slate-700">
                          {formatChangedBy(entry.changedBy, user, employees)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const changes = getJobHistoryChanges(entry, employees, organizationNames);

                    return (
                      <div className="mt-3">
                        <p className="mb-2 text-sm font-semibold text-slate-800">
                          Changes made
                        </p>
                        {changes.length === 0 ? (
                          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                            No field-level changes are available for this record.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {changes.map((change) => (
                              <div
                                key={change.field}
                                className="grid gap-2 rounded-lg border border-slate-200 px-3 py-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
                              >
                                <p className="text-sm font-medium text-slate-700">
                                  {change.label}
                                </p>
                                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                                  <span className="max-w-full break-words rounded-md bg-rose-50 px-3 py-1.5 text-rose-700">
                                    {change.previous}
                                  </span>
                                  <span aria-label="changed to" className="text-slate-400">
                                    →
                                  </span>
                                  <span className="max-w-full break-words rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-700">
                                    {change.next}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Probation Management"
          icon={<Clock className="h-5 w-5 text-amber-600" />}
        >
          <p className="mb-4 text-sm text-slate-600">
            Confirm or extend employees who are currently on probation.
          </p>

          {probationEmployees.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              No employees are currently marked ON_PROBATION.
            </p>
          ) : (
            <div className="space-y-4">
              {probationEmployees.map((employee) => {
                const id = String(employee.id);

                return (
                  <article
                    key={id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row">
                      <div>
                        <p className="font-bold">
                          {employee.firstName} {employee.lastName}
                        </p>
                        <p className="text-sm text-slate-500">
                          {employee.employeeCode || id} ·{" "}
                          {employee.designationTitle || "No designation"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Joining: {formatDate(employee.dateOfJoining)} ·
                          Probation end: {formatDate(employee.probationEndDate)}
                        </p>
                        <div className="mt-2">
                          <Status value={employee.status} />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void confirmProbation(employee)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy === `confirm-${id}` ? "Confirming…" : "Confirm probation"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[150px_1fr_auto]">
                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">
                          Extend by (days)
                        </span>


                        <input
  type="number"
  min={1}
  max={365}
  step={1}
  value={extendDays[id] ?? 30}
  onChange={(event) => {
    const value = event.target.value;

    setExtendDays((current) => ({
      ...current,
      [id]: value === "" ? "" : Number(value),
    }));
  }}
  onBlur={() => {
    setExtendDays((current) => ({
      ...current,
      [id]: current[id] === "" || current[id] === undefined
        ? 30
        : current[id],
    }));
  }}
  className="w-full rounded-lg border border-slate-300 px-3 py-2"
/>

                      </label>

                      <label className="text-sm">
                        <span className="mb-1 block font-semibold">
                          Extension reason
                        </span>
                        <input
                          value={extendRemarks[id] ?? ""}
                          onChange={(event) =>
                            setExtendRemarks((current) => ({
                              ...current,
                              [id]: event.target.value,
                            }))
                          }
                          placeholder="Enter a reason"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>

                      <div className="flex items-end">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void extendProbation(employee)}
                          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50 sm:w-auto"
                        >
                          {busy === `extend-${id}` ? "Extending…" : "Extend probation"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

          </>
        )}

        {!isAdmin && (
        <Panel
          title="Request a Sensitive Profile Change"
          icon={<ShieldCheck className="h-5 w-5 text-indigo-600" />}
        >
          <p className="mb-4 text-sm text-slate-600">
            Submit a change to sensitive identity or bank information. It
            remains pending until an authorized administrator reviews it.
          </p>

          <form
            onSubmit={submitSensitiveRequest}
            className="grid gap-4 md:grid-cols-2"
          >
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Field to update</span>
              <select
                value={sensitiveField}
                onChange={(event) => setSensitiveField(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                {[
                  ["bankAccountNumber", "Bank account number"],
                  ["bankIfscCode", "Bank IFSC code"],
                  ["bankBranch", "Bank branch"],
                  ["employeePan", "PAN"],
                  ["employeeAadhaar", "Aadhaar"],
                  ["employeeTan", "TAN"],
                ].map(([field, label]) => {
                  const latestRequest = myRequests
                    .filter((request) => (request.fields ?? []).includes(field))
                    .sort(
                      (a, b) =>
                        new Date(b.requestedAt ?? 0).getTime() -
                        new Date(a.requestedAt ?? 0).getTime(),
                    )[0];
                  const nextEligibleAt = latestRequest?.nextEligibleAt;
                  const cooldownActive =
                    Boolean(nextEligibleAt) &&
                    new Date(nextEligibleAt as string).getTime() > Date.now();
                  return (
                    <option key={field} value={field} disabled={cooldownActive}>
                      {label}{cooldownActive ? ` (available ${formatDate(nextEligibleAt)})` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="text-sm md:col-span-2">
  <span className="mb-1 block font-semibold">
    Supporting document (required)
  </span>

  <input
    type="file"
    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
    required
    onChange={(event) => {
      const file = event.target.files?.[0] ?? null;

      if (file && file.size > 5 * 1024 * 1024) {
        setSensitiveDocument(null);
        event.target.value = "";
        setError("The supporting document must be 5 MB or smaller.");
        return;
      }

      setError("");
      setSensitiveDocument(file);
    }}
    className="w-full rounded-lg border border-slate-300 px-3 py-2"
  />

  <span className="mt-1 block text-xs text-slate-500">
    PDF, JPG or PNG. Maximum 5 MB. Your document is restricted to authorized access.
  </span>
</label>



            <label className="text-sm">
              <span className="mb-1 block font-semibold">New value</span>
              <input
                type="password"
                autoComplete="off"
                value={sensitiveValue}
                onChange={(event) => setSensitiveValue(event.target.value)}
                placeholder="Enter new value"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-semibold">
                Reason for change
              </span>
              <textarea
                rows={3}
                value={sensitiveReason}
                onChange={(event) => setSensitiveReason(event.target.value)}
                placeholder="Explain why the information needs to change"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={Boolean(busy)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "submit-sensitive" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Submit for approval
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Your reason is saved with the request. Sensitive values should
                be applied only after approval.
              </p>
            </div>
          </form>
        </Panel>
        )}

        {isAdmin && (
          <>
        <Panel
          title="HR Approval Queue"
          icon={<Users className="h-5 w-5 text-indigo-600" />}
        >
          <p className="mb-4 text-sm text-slate-600">
            Pending sensitive profile-change requests available to your account.
          </p>

          {pendingRequests.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              No pending requests returned by the API, or your account does not
              have permission to view the queue.
            </p>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((item) => {
                const requestId = item.request?._id;
                const isBusy = busy === `review-${requestId}`;

                return (
                  <article
                    key={`${item.employeeId}-${requestId}`}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row">
                      <div>
                        <p className="font-bold">{item.employeeName}</p>
                        <p className="text-xs text-slate-500">
                          {item.employeeCode || item.employeeId} · Requested{" "}
                          {formatDate(item.request.requestedAt)}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(item.request.fields ?? []).map((field) => (
                            <span
                              key={field}
                              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold"
                            >
                              {sensitiveFieldLabel(field)}
                            </span>
                          ))}
                        </div>

                        {item.request.reason && (
                          <p className="mt-2 text-sm text-slate-700">
                            <span className="font-semibold">Reason:</span>{" "}
                            {item.request.reason}
                          </p>
                        )}

                        <p className="mt-2 text-xs text-slate-500">
                          Submitted values are hidden for security.
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          <span className="font-semibold">Supporting document:</span>{" "}
                          {item.request.documentAvailable ? "Attached" : "Not recorded"}
                          {item.request.documentMimeType ? ` (${item.request.documentMimeType})` : ""}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          <span className="font-semibold">Next eligible submission:</span>{" "}
                          {item.request.nextEligibleAt ? formatDate(item.request.nextEligibleAt) : "—"}
                        </p>
                        <div className="mt-2">
                          <Status value={item.request.status || "PENDING"} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-start gap-2">
                        <button
                          type="button"
                          disabled={!requestId || !item.request.documentAvailable || documentBusy === requestId}
                          onClick={() => void viewSupportingDocument(item.employeeId, requestId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                        >
                          {documentBusy === requestId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          {documentBusy === requestId ? "Opening…" : "View Document"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy) || !requestId}
                          onClick={() => void reviewRequest(item, "APPROVE")}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy) || !requestId}
                          onClick={() => void reviewRequest(item, "REJECT")}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                        {isBusy && (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="HR Sensitive Change Review History"
          icon={<History className="h-5 w-5 text-indigo-600" />}
        >
          <p className="mb-4 text-sm text-slate-600">
            All employees' sensitive profile-change requests, including pending,
            approved, and rejected requests. Submitted values are hidden.
          </p>

          {adminHistory.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              No sensitive profile-change history found.
            </p>
          ) : (
            <div className="space-y-3">
              {adminHistory.map((item) => {
                const request = item.request;
                return (
                  <article
                    key={`${item.employeeId}-${request._id}`}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.employeeName || "Unknown employee"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.employeeCode || item.employeeId}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(request.fields ?? []).map((field) => (
                            <span
                              key={field}
                              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold"
                            >
                              {sensitiveFieldLabel(field)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Status value={request.status || "PENDING"} />
                    </div>

                    <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Supporting document:</span>{" "}
                        {request.documentAvailable ? "Attached" : "Not recorded"}
                        {request.documentMimeType ? ` (${request.documentMimeType})` : ""}
                      </p>
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Next eligible submission:</span>{" "}
                        {request.nextEligibleAt ? formatDate(request.nextEligibleAt) : "—"}
                      </p>
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Requested:</span>{" "}
                        {formatDate(request.requestedAt)}
                      </p>
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Reviewed:</span>{" "}
                        {formatDate(request.reviewedAt)}
                      </p>
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Reviewed by role:</span>{" "}
                        {request.reviewedByRole || "—"}
                      </p>
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Reason:</span>{" "}
                        {request.reason || "—"}
                      </p>
                    </div>

                    {request.documentAvailable && (
                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={documentBusy === request._id}
                          onClick={() => void viewSupportingDocument(item.employeeId, request._id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                        >
                          {documentBusy === request._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          {documentBusy === request._id ? "Opening…" : "View Document"}
                        </button>
                      </div>
                    )}

                    {request.reviewComment && (
                      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                        <span className="font-semibold">HR comment:</span>{" "}
                        {request.reviewComment}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

          </>
        )}

        {!isAdmin && (
        <Panel
          title="My Sensitive Change Requests"
          icon={<ShieldCheck className="h-5 w-5 text-slate-600" />}
        >
          {myRequests.length === 0 ? (
            <p className="text-sm text-slate-500">
              You have not submitted any sensitive profile-change requests yet. Submit a request above; its reason and approval status will appear here.
            </p>
          ) : (
            <div className="space-y-3">
              {myRequests.map((request, index) => (
                <article
                  key={request._id || index}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {(request.fields ?? [])
                        .map(sensitiveFieldLabel)
                        .join(", ") || "Profile change"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested {formatDate(request.requestedAt)}
                    </p>

                    {request.reason && (
                      <p className="mt-2 text-sm text-slate-600">
                        <span className="font-semibold">Reason:</span>{" "}
                        {request.reason}
                      </p>
                    )}

                    <p className="mt-2 text-sm text-slate-600">
                      <span className="font-semibold">Supporting document:</span>{" "}
                      {request.documentAvailable ? "Attached" : "Not recorded"}
                      {request.documentMimeType ? ` (${request.documentMimeType})` : ""}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      <span className="font-semibold">Next eligible submission:</span>{" "}
                      {request.nextEligibleAt ? formatDate(request.nextEligibleAt) : "—"}
                    </p>

                    {request.reviewedAt && (
                      <p className="mt-2 text-xs text-slate-500">
                        Reviewed: {formatDate(request.reviewedAt)}
                      </p>
                    )}

                    {request.reviewComment && (
                      <p className="mt-2 text-sm text-slate-600">
                        <span className="font-semibold">HR comment:</span>{" "}
                        {request.reviewComment}
                      </p>
                    )}
                  </div>

                  <Status value={request.status} />
                </article>
              ))}
            </div>
          )}
        </Panel>
        )}

        <p className="text-center text-xs text-slate-500">
          Employee data and request permissions are controlled by the backend.
        </p>
      </div>
    </main>
  );
}

