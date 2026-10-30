
import { useCallback, useEffect, useState } from "react";
import { api, getErrorMessage } from "@/lib/api";
import { EmployeesApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    XCircle,
} from "lucide-react";

type BreakGlassField =
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "emergencyContactRelationship"
    | "emergencyContactEmail"
    | "medicalConditions"
    | "bloodGroup"
    | "insurancePolicyNumber"
    | "employeeAadhaar"
    | "employeePan"
    | "employeeTan"
    | "bankAccountNumber"
    | "bankIfscCode"
    | "bankBranch";

type RequestStatus =
    | "PENDING"
    | "APPROVAL_AUDIT_PENDING"
    | "REJECTION_AUDIT_PENDING"
    | "APPROVED"
    | "REJECTED"
    | "REVOKED"
    | "EXPIRED";

type BreakGlassRequest = {
    id: string;
    requesterUserId: string;
    targetEmployeeId: string;
    reason: string;
    requestedFields: BreakGlassField[];
    durationMinutes: number;
    status: RequestStatus;
    createdAt: string;
    approvedAt?: string | null;
    expiresAt?: string | null;
    revokedAt?: string | null;
    decisionNote?: string | null;
    approverUserId?: string | null;
};

type Employee = {
    id: string;
    employeeCode?: string;
    firstName?: string;
    lastName?: string;
    email?: string | null;
};

type GrantedData = {
    requestId: string;
    targetEmployeeId: string;
    expiresAt: string;
    fields: Record<string, unknown>;
};

const FIELDS: { value: BreakGlassField; label: string }[] = [
    { value: "emergencyContactName", label: "Emergency Contact Name" },
    { value: "emergencyContactPhone", label: "Emergency Contact Phone" },
    { value: "emergencyContactRelationship", label: "Emergency Contact Relationship" },
    { value: "emergencyContactEmail", label: "Emergency Contact Email" },
    { value: "medicalConditions", label: "Medical Conditions" },
    { value: "bloodGroup", label: "Blood Group" },
    { value: "insurancePolicyNumber", label: "Insurance Policy Number" },
    { value: "employeeAadhaar", label: "Aadhaar" },
    { value: "employeePan", label: "PAN" },
    { value: "employeeTan", label: "TAN" },
    { value: "bankAccountNumber", label: "Bank Account Number" },
    { value: "bankIfscCode", label: "Bank IFSC Code" },
    { value: "bankBranch", label: "Bank Branch" },
];

const STATUS_STYLES: Record<RequestStatus, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVAL_AUDIT_PENDING: "bg-amber-100 text-amber-800",
    REJECTION_AUDIT_PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-rose-100 text-rose-800",
    REVOKED: "bg-slate-200 text-slate-700",
    EXPIRED: "bg-slate-200 text-slate-700",
};

const FIELD_LABELS = Object.fromEntries(
    FIELDS.map((field) => [field.value, field.label]),
) as Record<BreakGlassField, string>;

function displayDate(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function displayValue(value: unknown) {
    if (value === null || value === undefined || value === "") {
        return "Not available";
    }
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

export default function BreakGlass() {
    const { user } = useAuth();
    const role = String(user?.role ?? "").toUpperCase();
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [requests, setRequests] = useState<BreakGlassRequest[]>([]);
    const [targetEmployeeId, setTargetEmployeeId] = useState("");
    const [selectedFields, setSelectedFields] = useState<BreakGlassField[]>([
        "bloodGroup",
    ]);
    const [durationMinutes, setDurationMinutes] = useState(15);
    const [reason, setReason] = useState("");
    const [decisionNote, setDecisionNote] = useState("");
    const [busy, setBusy] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [revealedData, setRevealedData] = useState<GrantedData | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const requestResponse = await api.get<{ requests: BreakGlassRequest[] }>(
                "/break-glass",
                { headers: { "Cache-Control": "no-cache" } },
            );
            setRequests(requestResponse.data.requests ?? []);


            try {
                const employeeResponse = await EmployeesApi.list({
                    page: 1,
                    pageSize: 100,
                });
                setEmployees(employeeResponse.employees as Employee[]);
            } catch {
                // Employees without directory access can request access
                // for their own employee profile only.
                if (user?.employee?.id) {
                    setEmployees([
                        {
                            id: user.employee.id,
                            firstName: user.employee.firstName,
                            lastName: user.employee.lastName,
                            employeeCode: user.employee.employeeCode,
                        },
                    ]);
                } else {
                    setEmployees([]);
                }
            }

        } catch (err) {
            setError(getErrorMessage(err, "Could not load Break-Glass requests."));
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        return () => setRevealedData(null);
    }, []);

    async function createRequest(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setMessage("");
        setRevealedData(null);

        if (!targetEmployeeId) {
            setError("Please select the employee who needs emergency assistance.");
            return;
        }
        if (selectedFields.length === 0) {
            setError("Select at least one field.");
            return;
        }
        if (!reason.trim()) {
            setError("Enter the emergency reason.");
            return;
        }

        setBusy("create");
        try {
            await api.post("/break-glass", {
                targetEmployeeId,
                requestedFields: selectedFields,
                durationMinutes,
                reason: reason.trim(),
            });
            setReason("");
            setMessage("Emergency access request submitted for approval.");
            await loadData();
        } catch (err) {
            setError(getErrorMessage(err, "Could not submit the request."));
        } finally {
            setBusy("");
        }
    }

    async function reviewRequest(id: string, decision: "approve" | "reject") {
        setBusy(`${decision}-${id}`);
        setError("");
        setMessage("");
        try {
            await api.post(`/break-glass/${encodeURIComponent(id)}/${decision}`, {
                note: decisionNote.trim() || undefined,
            });
            setDecisionNote("");
            setMessage(`Request ${decision === "approve" ? "approved" : "rejected"}.`);
            await loadData();
        } catch (err) {
            setError(getErrorMessage(err, `Could not ${decision} this request.`));
        } finally {
            setBusy("");
        }
    }

    async function revokeRequest(id: string) {
        if (!window.confirm("Revoke this emergency access grant immediately?")) return;

        setBusy(`revoke-${id}`);
        setError("");
        setMessage("");
        setRevealedData(null);
        try {
            await api.post(`/break-glass/${encodeURIComponent(id)}/revoke`, {});
            setMessage("Emergency access revoked.");
            await loadData();
        } catch (err) {
            setError(getErrorMessage(err, "Could not revoke this grant."));
        } finally {
            setBusy("");
        }
    }

    async function viewGrantedData(request: BreakGlassRequest) {
        setBusy(`data-${request.id}`);
        setError("");
        setMessage("");
        setRevealedData(null);
        try {
            const response = await api.get<GrantedData>(
                `/break-glass/${encodeURIComponent(request.id)}/data`,
                { headers: { "Cache-Control": "no-cache" } },
            );
            setRevealedData(response.data);
        } catch (err) {
            setError(getErrorMessage(err, "Emergency data is not available."));
        } finally {
            setBusy("");
        }
    }

    const employeeName = (id: string) => {
        const employee = employees.find((item) => item.id === id);
        if (!employee) return id;
        const name = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();
        return name || employee.employeeCode || id;
    };

    return (
        <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-800 sm:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-rose-50 p-3 text-rose-700">
                            <ShieldAlert size={26} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Break-Glass Access</h1>
                            <p className="mt-1 max-w-2xl text-sm text-slate-500">
                                Controlled emergency access to selected sensitive employee
                                information. Every request requires approval and is time-limited.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadData()}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </header>

                {error && (
                    <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        <AlertCircle size={18} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {message && (
                    <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        <CheckCircle2 size={18} className="shrink-0" />
                        <span>{message}</span>
                    </div>
                )}

                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                        <ShieldCheck size={19} className="mt-0.5 shrink-0" />
                        <div>
                            <p className="font-semibold">Emergency Access Safeguards</p>
                            <p className="mt-1">
                                Request only the minimum information needed. Access is unavailable
                                until an authorized administrator approves it, and grants expire
                                automatically after the selected duration.
                            </p>
                        </div>
                    </div>
                </section>
                {!isAdmin && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold">Request Emergency Access</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Provide a clear reason and select only the fields needed for the emergency.
                        </p>

                        <form onSubmit={createRequest} className="mt-5 space-y-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="block text-sm font-semibold">
                                    Target Employee
                                    <select
                                        value={targetEmployeeId}
                                        onChange={(event) => setTargetEmployeeId(event.target.value)}
                                        required
                                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
                                    >
                                        <option value="">Select Employee</option>
                                        {employees.map((employee) => (
                                            <option key={employee.id} value={employee.id}>
                                                {employeeName(employee.id)}
                                                {employee.employeeCode ? ` (${employee.employeeCode})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block text-sm font-semibold">
                                    Access Duration
                                    <select
                                        value={durationMinutes}
                                        onChange={(event) => setDurationMinutes(Number(event.target.value))}
                                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
                                    >
                                        <option value={5}>5 Minutes</option>
                                        <option value={10}>10 Minutes</option>
                                        <option value={15}>15 Minutes</option>
                                        <option value={30}>30 Minutes</option>
                                    </select>
                                </label>
                            </div>

                            <fieldset>
                                <legend className="text-sm font-semibold">Sensitive fields requested</legend>
                                <p className="mt-1 text-xs text-slate-500">
                                    Select one or more permitted fields. Avoid requesting unrelated information.
                                </p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {FIELDS.map((field) => (
                                        <label
                                            key={field.value}
                                            className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm hover:bg-slate-50"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedFields.includes(field.value)}
                                                onChange={(event) => {
                                                    setSelectedFields((current) =>
                                                        event.target.checked
                                                            ? [...current, field.value]
                                                            : current.filter((item) => item !== field.value),
                                                    );
                                                }}
                                                className="mt-0.5"
                                            />
                                            <span>{field.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            <label className="block text-sm font-semibold">
                                Emergency Reason
                                <textarea
                                    value={reason}
                                    onChange={(event) => setReason(event.target.value)}
                                    required
                                    maxLength={1000}
                                    rows={3}
                                    placeholder="Explain why this information is urgently required."
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"
                                />
                            </label>

                            <button
                                type="submit"
                                disabled={busy !== "" || loading}
                                className="rounded-xl bg-rose-700 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                            >
                                {busy === "create" ? "Submitting..." : "Submit Emergeny Request"}
                            </button>
                        </form>
                    </section>
                )}
                {isAdmin && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold">Administrator review</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Review each pending request before granting access. You cannot approve or reject your own request.
                        </p>
                        <label className="mt-4 block text-sm font-semibold">
                            Decision note (optional)
                            <input
                                value={decisionNote}
                                onChange={(event) => setDecisionNote(event.target.value)}
                                maxLength={1000}
                                placeholder="Reason for the decision"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"
                            />
                        </label>
                    </section>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div>
                            <h2 className="text-lg font-bold">
                                {isAdmin ? "All emergency access requests" : "My Emergeny Access Request"}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {requests.length} request{requests.length === 1 ? "" : "s"} returned by the server
                            </p>
                        </div>
                        <Clock size={20} className="text-slate-400" />
                    </div>

                    {loading ? (
                        <p className="py-8 text-center text-sm text-slate-500">Loading requests...</p>
                    ) : requests.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-500">No emergency access requests found.</p>
                    ) : (
                        <div className="mt-4 space-y-4">
                            {requests.map((request) => {
                                const isOwnRequest = request.requesterUserId === user?.id;
                                const canReview = isAdmin && request.status === "PENDING" && !isOwnRequest;
                                const canRevoke = isAdmin && request.status === "APPROVED";
                                const canView = isOwnRequest && request.status === "APPROVED";

                                return (
                                    <article key={request.id} className="rounded-xl border border-slate-200 p-4">
                                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-semibold">
                                                        {employeeName(request.targetEmployeeId)}
                                                    </h3>
                                                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[request.status]}`}>
                                                        {request.status.replaceAll("_", " ")}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm text-slate-600">{request.reason}</p>
                                                <p className="mt-2 text-xs text-slate-500">
                                                    Requested {displayDate(request.createdAt)} · Duration {request.durationMinutes} minutes
                                                </p>
                                                {request.expiresAt && (
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Expires: {displayDate(request.expiresAt)}
                                                    </p>
                                                )}
                                                {request.decisionNote && (
                                                    <p className="mt-2 text-sm text-slate-600">
                                                        Decision note: {request.decisionNote}
                                                    </p>
                                                )}
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {request.requestedFields.map((field) => (
                                                        <span key={field} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                                                            {FIELD_LABELS[field] ?? field}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {canReview && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={busy !== ""}
                                                            onClick={() => void reviewRequest(request.id, "approve")}
                                                            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                                        >
                                                            {busy === `approve-${request.id}` ? "Approving..." : "Approve"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy !== ""}
                                                            onClick={() => void reviewRequest(request.id, "reject")}
                                                            className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                                        >
                                                            {busy === `reject-${request.id}` ? "Rejecting..." : "Reject"}
                                                        </button>
                                                    </>
                                                )}

                                                {canView && (
                                                    <button
                                                        type="button"
                                                        disabled={busy !== ""}
                                                        onClick={() => void viewGrantedData(request)}
                                                        className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                                    >
                                                        {busy === `data-${request.id}` ? "Checking..." : "View approved data"}
                                                    </button>
                                                )}

                                                {canRevoke && (
                                                    <button
                                                        type="button"
                                                        disabled={busy !== ""}
                                                        onClick={() => void revokeRequest(request.id)}
                                                        className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                                    >
                                                        {busy === `revoke-${request.id}` ? "Revoking..." : "Revoke access"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                {revealedData && (
                    <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-emerald-700" size={22} />
                            <h2 className="text-lg font-bold">Approved emergency data</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                            This response contains only the fields approved by the server. Access expires at{" "}
                            {displayDate(revealedData.expiresAt)}.
                        </p>
                        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                            {Object.entries(revealedData.fields).map(([field, value]) => (
                                <div key={field} className="rounded-xl border border-slate-200 p-3">
                                    <dt className="text-xs font-semibold uppercase text-slate-500">
                                        {FIELD_LABELS[field as BreakGlassField] ?? field}
                                    </dt>
                                    <dd className="mt-1 break-words text-sm font-medium">
                                        {displayValue(value)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <button
                            type="button"
                            onClick={() => setRevealedData(null)}
                            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                        >
                            <XCircle size={16} />
                            Hide sensitive data
                        </button>
                    </section>
                )}
            </div>
        </main>
    );
}
