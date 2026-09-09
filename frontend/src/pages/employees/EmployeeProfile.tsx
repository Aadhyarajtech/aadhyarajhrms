import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Edit3,
  FileText,
  Laptop,
  Upload,
  Wallet,
  Target,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  EmployeesApi,
  AttendanceApi,
  LeaveApi,
  PerformanceApi,
  PayrollApi,
  DocumentsApi,
  OrganizationApi,
} from "@/lib/endpoints";
import { api, getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";
import {
  formatDate,
  formatCurrencyINR,
  formatTime,
  monthName,
  cx,
} from "@/lib/format";

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

const requiredSalaryAmount = (fieldLabel: string) =>
  z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : value,
    z
      .number({
        required_error: `${fieldLabel} is required.`,
        invalid_type_error: `${fieldLabel} is required.`,
      })
      .min(0, `${fieldLabel} must be 0 or greater.`),
  );

const salarySchema = z.object({
  basic: requiredSalaryAmount("Basic"),
  hra: requiredSalaryAmount("HRA"),
  conveyance: requiredSalaryAmount("Conveyance"),
  medical: requiredSalaryAmount("Medical"),
  specialAllowance: requiredSalaryAmount("Special allowance"),
  pf: requiredSalaryAmount("Provident Fund (PF)"),
  professionalTax: requiredSalaryAmount("Professional tax"),
  incomeTax: requiredSalaryAmount("Income tax (TDS)"),
});
type SalaryForm = z.infer<typeof salarySchema>;

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [docTypeOpen, setDocTypeOpen] = useState(false);

  const effectiveId = id ?? user?.employee?.id;
  const {
    data: employee,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["employee", effectiveId],
    queryFn: () => EmployeesApi.get(effectiveId!),
    enabled: !!effectiveId,
  });

  const isSelf = user?.employee?.id === effectiveId;
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      if (!employee) throw new Error("Employee not found.");
      return EmployeesApi.completeOnboarding(employee.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employee", effectiveId],
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      showToast("Employee onboarding completed successfully.");
    },
    
    onError: (error) => {
      showToast(getErrorMessage(error), "error");
    },
  });

  const confirmProbationMutation = useMutation({
  mutationFn: async () => {
    if (!employee) throw new Error("Employee not found.");
    return EmployeesApi.confirmProbation(employee.id);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["employee", effectiveId],
    });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    showToast("Employee probation confirmed successfully.");
  },
  onError: (error) => {
    showToast(getErrorMessage(error), "error");
  },
});

const startNoticePeriodMutation = useMutation({
  mutationFn: (data: {
    noticeDays: number;
    resignationDate: string;
    resignationReason: string;
    employeeRemarks: string;
    hrRemarks: string;
  }) =>
    api.post(`/employees/${employee?.id}/start-notice-period`, data),

  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["employee", effectiveId],
    });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    showToast("Employee notice period started successfully.");
  },
  onError: (error) => {
    showToast(getErrorMessage(error), "error");
  },
});

const extendProbationMutation = useMutation({
  mutationFn: async (data: {
    extensionDays: number;
    remarks?: string;
  }) => {
    if (!employee) {
      throw new Error("Employee not found.");
    }

    return EmployeesApi.extendProbation(employee.id, data);
  },

  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["employee", effectiveId],
    });

    queryClient.invalidateQueries({
      queryKey: ["employees"],
    });

    showToast("Employee probation extended successfully.");
  },

  onError: (error) => {
    showToast(getErrorMessage(error), "error");
  },
});

const terminateEmployeeMutation = useMutation({
  mutationFn: async (data: {
    terminationDate: string;
    terminationReason: string;
    employeeRemarks: string;
    hrRemarks: string;
  }) => {
    if (!employee) {
      throw new Error("Employee not found.");
    }

    return api.post(`/employees/${employee.id}/terminate`, data);
  },

  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["employee", effectiveId],
    });

    queryClient.invalidateQueries({
      queryKey: ["employees"],
    });

    showToast("Employee terminated successfully.");
  },

  onError: (error) => {
    showToast(getErrorMessage(error), "error");
  },
});

  const updateOffboardingChecklistMutation = useMutation({
    mutationFn: async (payload: {
      assetReturn?: boolean;
      accessRevoked?: boolean;
      exitInterview?: boolean;
      finalSettlement?: boolean;
    }) => {
      if (!employee) throw new Error("Employee not found.");

      return EmployeesApi.updateOffboardingChecklist(
        employee.id,
        payload,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employee", effectiveId],
      });
      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });

      showToast("Offboarding checklist updated successfully.");
    },
    onError: (error) => {
      showToast(getErrorMessage(error), "error");
    },
  });

  const completeOffboardingMutation = useMutation({
  mutationFn: async () => {
    if (!employee) {
      throw new Error("Employee not found.");
    }

    return EmployeesApi.completeOffboarding(employee.id);
  },

  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["employee", effectiveId],
    });

    queryClient.invalidateQueries({
      queryKey: ["employees"],
    });

    showToast(
      "Employee offboarding completed successfully. Status changed to RESIGNED.",
    );
  },

  onError: (error) => {
    showToast(getErrorMessage(error), "error");
  },
});
  

  useEffect(() => {
    if (!effectiveId || !user || isAdmin || isSelf) return;
    navigate(`/app/employees/${user.employee?.id ?? "dashboard"}`, {
      replace: true,
    });
  }, [effectiveId, isAdmin, isSelf, navigate, user]);
  const isFinance = user?.role === "FINANCE";
  const canViewPayroll = isSelf || isAdmin || isFinance;
  const canEdit = isSelf || isAdmin;

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Unable to load profile"
        description={getErrorMessage(error)}
      />
    );
  }

  if (isLoading || !employee) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "attendance", label: "Attendance" },
    { key: "leave", label: "Leave" },
    { key: "performance", label: "Performance" },
    ...(canViewPayroll ? [{ key: "payroll", label: "Payroll" }] : []),
    { key: "documents", label: "Documents & Assets" },
  ];

  return (
    <div>
      <Card className="mb-6 bg-gradient-to-br from-white to-canvas">
  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Avatar
              firstName={employee.firstName}
              lastName={employee.lastName}
              src={employee.avatarUrl}
              size="xl"
            />
            <div className="text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="font-display text-xl font-medium text-ink">
                  {employee.firstName} {employee.lastName}
                </h1>
                <StatusBadge status={employee.status} />
              </div>
              <p className="mt-0.5 text-[14px] text-ink-faint">
                {employee.designationTitle} · {employee.departmentName}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[12.5px] text-ink-faint sm:justify-start">
                <span className="flex items-center gap-1.5">
                  <Mail size={13} /> {employee.email}
                </span>
                {employee.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={13} /> {employee.phone}
                  </span>
                )}
                {employee.city && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} /> {employee.city}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} /> Joined{" "}
                  {formatDate(employee.dateOfJoining)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Badge
  tone="brand"
  className="shrink-0 whitespace-nowrap px-3 py-1.5 font-mono text-[12px]"
>
              {employee.employeeCode}
            </Badge>
            {isAdmin && employee.status === "ONBOARDING" && (
              <Button
  size="sm"
  className="whitespace-nowrap"
  onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to complete onboarding for this employee?",
                    )
                  ) {
                    completeOnboardingMutation.mutate();
                  }
                }}
                isLoading={completeOnboardingMutation.isPending}
              >
                Complete Onboarding
              </Button>
            )}
{isAdmin && employee.status === "ON_PROBATION" && (
  <Button
    size="sm"
    onClick={() => {
      if (
        window.confirm(
          "Are you sure you want to confirm this employee after probation?",
        )
      ) {
        confirmProbationMutation.mutate();
      }
    }}
    isLoading={confirmProbationMutation.isPending}
  >
    Confirm Employee
  </Button>
)}

{isAdmin && employee.status === "ON_PROBATION" && (
  <Button
  size="sm"
  variant="outline"
  className="whitespace-nowrap"
  onClick={() => {
      const value = window.prompt(
        "Enter probation extension in days:",
        "30",
      );

      if (value === null) return;

      const extensionDays = Number(value);

      if (!Number.isInteger(extensionDays) || extensionDays < 1) {
        showToast(
          "Please enter a valid extension of at least 1 day.",
          "error",
        );
        return;
      }

      const remarks =
        window.prompt("Enter probation extension remarks (optional):") || "";

      if (
        window.confirm(
          `Extend this employee's probation by ${extensionDays} day(s)?`,
        )
      ) {
        extendProbationMutation.mutate({
          extensionDays,
          remarks: remarks.trim() || undefined,
        });
      }
    }}
    isLoading={extendProbationMutation.isPending}
  >
    Extend Probation
  </Button>
)}

{isAdmin &&
  (employee.status === "ACTIVE" ||
    employee.status === "ON_PROBATION") && (
    <Button
  size="sm"
  variant="outline"
  className="whitespace-nowrap"
  onClick={() => {
        const value = window.prompt(
          "Enter notice period in days:",
          "30",
        );

        if (value === null) return;

        const noticeDays = Number(value);

        if (!Number.isInteger(noticeDays) || noticeDays < 1) {
          showToast(
            "Please enter a valid notice period of at least 1 day.",
            "error",
          );
          return;
        }

        const resignationDate = window.prompt(
          "Enter resignation date (YYYY-MM-DD):",
          new Date().toISOString().split("T")[0],
        );

        if (!resignationDate) {
          showToast("Please enter the resignation date.", "error");
          return;
        }

        const resignationReason = window.prompt(
          "Enter resignation reason:",
        );

        if (!resignationReason?.trim()) {
          showToast("Please enter the resignation reason.", "error");
          return;
        }

        const employeeRemarks =
          window.prompt("Enter employee remarks (optional):") ?? "";

        const hrRemarks =
          window.prompt("Enter HR remarks (optional):") ?? "";

        if (
          window.confirm(
            `Start ${noticeDays}-day notice period for this employee?`,
          )
        ) {
          startNoticePeriodMutation.mutate({
            noticeDays,
            resignationDate,
            resignationReason: resignationReason.trim(),
            employeeRemarks: employeeRemarks.trim(),
            hrRemarks: hrRemarks.trim(),
          });
        }
      }}
      isLoading={startNoticePeriodMutation.isPending}
    >
      Start Notice Period
    </Button>
  )}

  {isAdmin &&
  (employee.status === "ACTIVE" ||
    employee.status === "ON_PROBATION") && (
    <Button
  size="sm"
  variant="danger"
  className="whitespace-nowrap"
  onClick={() => {
        const terminationDate = window.prompt(
          "Enter termination date (YYYY-MM-DD):",
          new Date().toISOString().split("T")[0],
        );

        if (!terminationDate) return;

        const terminationReason = window.prompt(
          "Enter termination reason:",
        );

        if (!terminationReason?.trim()) {
          showToast("Please enter the termination reason.", "error");
          return;
        }

        const employeeRemarks =
          window.prompt("Enter employee remarks (optional):") ?? "";

        const hrRemarks =
          window.prompt("Enter HR remarks (optional):") ?? "";

        if (
          window.confirm(
            "Are you sure you want to terminate this employee?",
          )
        ) {
          terminateEmployeeMutation.mutate({
            terminationDate,
            terminationReason: terminationReason.trim(),
            employeeRemarks: employeeRemarks.trim(),
            hrRemarks: hrRemarks.trim(),
          });
        }
      }}
      isLoading={terminateEmployeeMutation.isPending}
    >
      Terminate Employee
    </Button>
  )}
            
           {canEdit && employee.status !== "RESIGNED" && (
  <Button
    size="sm"
    variant="outline"
    className="whitespace-nowrap"
    leftIcon={<Edit3 size={14} />}
    onClick={() => setEditOpen(true)}
  >
    Edit
  </Button>
)}

            
          </div>
        </div>
        {employee.managerFirstName && (
          <div className="mt-5 flex items-center gap-2 border-t border-line/70 pt-4 text-[13px] text-ink-faint">
            <Briefcase size={14} /> Reports to{" "}
            <span className="font-medium text-ink">
              {employee.managerFirstName} {employee.managerLastName}
            </span>
          </div>
        )}
      </Card>

      <div className="mb-6 w-full overflow-x-auto pb-1">
  <Tabs
    tabs={tabs}
    active={tab}
    onChange={setTab}
    className="w-max min-w-full"
  />
</div>

 {tab === "overview" && (
  <OverviewTab
    employee={employee}
    isAdmin={isAdmin}
    onUpdateOffboardingChecklist={(payload) =>
      updateOffboardingChecklistMutation.mutate(payload)
    }
    isUpdatingOffboardingChecklist={
      updateOffboardingChecklistMutation.isPending
    }
    onCompleteOffboarding={() =>
      completeOffboardingMutation.mutate()
    }
    isCompletingOffboarding={
      completeOffboardingMutation.isPending
    }
  />
)}
      {tab === "attendance" && <AttendanceTab employeeId={employee.id} />}
      {tab === "leave" && (
        <LeaveTab employeeId={employee.id} canManage={isAdmin} />
      )}
      {tab === "performance" && <PerformanceTab employeeId={employee.id} />}
      {tab === "payroll" && canViewPayroll && (
        <PayrollTab
          employeeId={employee.id}
          canEditStructure={isAdmin}
          onEditSalary={() => setSalaryOpen(true)}
        />
      )}
      {tab === "documents" && (
        <DocumentsTab
          employeeId={employee.id}
          canManage={isAdmin}
          onUpload={() => setDocTypeOpen(true)}
        />
      )}

      <EditEmployeeModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        employee={employee}
        isAdmin={isAdmin}
      />
      {isAdmin && (
        <SalaryModal
          open={salaryOpen}
          onClose={() => setSalaryOpen(false)}
          employeeId={employee.id}
        />
      )}
      {isAdmin && (
        <UploadDocModal
          open={docTypeOpen}
          onClose={() => setDocTypeOpen(false)}
          employeeId={employee.id}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
function getNoticePeriodEndDate(employee: any): string | null {
  if (employee?.lastWorkingDate) {
    return employee.lastWorkingDate;
  }

  if (!employee?.noticeStartDate || !employee?.noticeDays) {
    return null;
  }

  const startDate = new Date(employee.noticeStartDate);
  const noticeDays = Number(employee.noticeDays);

  if (Number.isNaN(startDate.getTime()) || !Number.isInteger(noticeDays) || noticeDays < 1) {
    return null;
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + noticeDays);
  return endDate.toISOString();
}

function OverviewTab({
  employee,
  isAdmin,
  onUpdateOffboardingChecklist,
  isUpdatingOffboardingChecklist,
  onCompleteOffboarding,
  isCompletingOffboarding,
}: {
  employee: any;
  isAdmin: boolean;
  onUpdateOffboardingChecklist: (payload: {
    assetReturn?: boolean;
    accessRevoked?: boolean;
    exitInterview?: boolean;
    finalSettlement?: boolean;
  }) => void;
  isUpdatingOffboardingChecklist: boolean;
  onCompleteOffboarding: () => void;
  isCompletingOffboarding: boolean;
}) {


  const education = Array.isArray(employee.education) ? employee.education : [];
  const certifications = Array.isArray(employee.certifications)
    ? employee.certifications
    : [];
  const workHistory = Array.isArray(employee.workHistory)
    ? employee.workHistory
    : [];
  const skills = Array.isArray(employee.skills) ? employee.skills : [];

  const offboardingCompleted =
  employee.offboardingChecklist?.assetReturn === true &&
  employee.offboardingChecklist?.accessRevoked === true &&
  employee.offboardingChecklist?.exitInterview === true &&
  employee.offboardingChecklist?.finalSettlement === true;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Personal information */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Personal information" />
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Gender" value={employee.gender ?? "—"} />

            <Info
              label="Marital status"
              value={
                employee.maritalStatus
                  ? employee.maritalStatus.replace(/_/g, " ")
                  : "—"
              }
            />

            <Info
              label="Date of birth"
              value={
                employee.dateOfBirth ? formatDate(employee.dateOfBirth) : "—"
              }
            />

            <Info
              label="Personal email"
              value={employee.personalEmail ?? "—"}
            />

            <Info
              label="Employment type"
              value={
                employee.employmentType
                  ? employee.employmentType.replace(/_/g, " ")
                  : "—"
              }
            />

            <Info label="City" value={employee.city ?? "—"} />
            <Info label="State" value={employee.state ?? "—"} />
            <Info label="Country" value={employee.country ?? "—"} />
            <Info label="Address" value={employee.address ?? "—"} />

            <Info
              label="Emergency contact"
              value={employee.emergencyContactName ?? "—"}
            />

            <Info
              label="Emergency phone"
              value={employee.emergencyContactPhone ?? "—"}
            />

            <Info
              label="Emergency relationship"
              value={employee.emergencyContactRelationship ?? "—"}
            />

            <Info
              label="Emergency email"
              value={employee.emergencyContactEmail ?? "—"}
            />

            <Info label="Aadhaar" value={employee.employeeAadhaar ?? "—"} />
            <Info label="PAN" value={employee.employeePan ?? "—"} />
          </dl>
        </Card>

        <Card className="h-fit self-start bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
  <div className="space-y-4">
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-white/70">
        System role
      </p>
      <p className="mt-1.5 font-display text-xl font-medium">
        {employee.role ? employee.role.replace(/_/g, " ") : "—"}
      </p>
    </div>

    <div className="h-px bg-white/15" />

    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-white/70">
        Designation level
      </p>
      <p className="mt-1.5 break-words text-[14px] leading-6">
        {employee.designationTitle ?? "—"} · Level{" "}
        {employee.designationLevel ?? "—"}
      </p>
    </div>
  </div>
</Card>
      </div>

            {(employee.status === "NOTICE_PERIOD" ||
  employee.status === "RESIGNED") && (
        <Card>
          <CardHeader title="Notice Period Details" />

          <dl className="grid grid-cols-1 gap-y-4 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3">
            <Info
              label="Notice period start"
              value={
                employee.noticeStartDate
                  ? formatDate(employee.noticeStartDate)
                  : "—"
              }
            />

            <Info
              label="Last working date"
              value={
                employee.lastWorkingDate
                  ? formatDate(employee.lastWorkingDate)
                  : "—"
              }
            />

            <Info
              label="Notice period"
              value={
                employee.noticeDays !== null &&
                employee.noticeDays !== undefined
                  ? `${employee.noticeDays} days`
                  : "—"
              }
            />

            <Info
              label="Resignation date"
              value={
                employee.resignationDetails?.resignationDate
                  ? formatDate(employee.resignationDetails.resignationDate)
                  : "—"
              }
            />

            <Info
              label="Resignation reason"
              value={
                employee.resignationDetails?.resignationReason || "—"
              }
            />

            <Info
              label="Employee remarks"
              value={
                employee.resignationDetails?.employeeRemarks || "—"
              }
            />

            <Info
              label="HR remarks"
              value={
                employee.resignationDetails?.hrRemarks || "—"
              }
            />
          </dl>
        </Card>
      )}

      <Info
  label="Offboarding completed"
  value={
    employee.offboardingChecklist?.completedAt
      ? formatDate(employee.offboardingChecklist.completedAt)
      : "—"
  }
/>

{employee.status === "TERMINATED" && (
  <div className="mt-6 border-t border-line pt-5">
    <h4 className="mb-4 text-sm font-semibold text-ink">
      Termination Details
    </h4>

    <dl className="grid grid-cols-1 gap-y-4 text-[13.5px] sm:grid-cols-2 lg:grid-cols-4">
      <Info
        label="Termination date"
        value={
          employee.terminationDetails?.terminationDate
            ? formatDate(employee.terminationDetails.terminationDate)
            : "—"
        }
      />

      <Info
        label="Termination reason"
        value={employee.terminationDetails?.terminationReason || "—"}
      />

      <Info
        label="Employee remarks"
        value={employee.terminationDetails?.employeeRemarks || "—"}
      />

      <Info
        label="HR remarks"
        value={employee.terminationDetails?.hrRemarks || "—"}
      />
    </dl>
  </div>
)}

            {/* Employee Lifecycle */}
      <Card className="overflow-hidden">
  <div className="mb-6 border-b border-line/70 pb-4">
    <CardHeader
      title="Employee Lifecycle"
      subtitle="Current employment journey and lifecycle details"
    />
  </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <Info
            label="Current status"
            value={(employee.status ?? "—").replace(/_/g, " ")}
          />

          <Info
            label="Joining date"
            value={
              employee.dateOfJoining
                ? formatDate(employee.dateOfJoining)
                : "—"
            }
          />

          <Info
            label="Probation start"
            value={
              employee.probationStartDate
                ? formatDate(employee.probationStartDate)
                : "—"
            }
          />

          <Info
            label="Probation end"
            value={
              employee.probationEndDate
                ? formatDate(employee.probationEndDate)
                : "—"
            }
          />
        </div>


        {employee.status === "NOTICE_PERIOD" && (
  <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
    <Info
      label="Notice period start"
      value={
        employee.noticeStartDate
          ? formatDate(employee.noticeStartDate)
          : "—"
      }
    />

    <Info
      label="Last working date"
      value={
        getNoticePeriodEndDate(employee)
          ? formatDate(getNoticePeriodEndDate(employee)!)
          : "—"
      }
    />

    <Info
      label="Notice period"
      value={
        employee.noticeDays !== null &&
        employee.noticeDays !== undefined
          ? `${employee.noticeDays} days`
          : "—"
      }
    />

    <Info
  label="Days remaining"
  value={
    employee.lastWorkingDate
      ? `${Math.max(
          0,
          Math.ceil(
            (new Date(employee.lastWorkingDate).getTime() -
              new Date().setHours(0, 0, 0, 0)) /
              (1000 * 60 * 60 * 24),
          ),
        )} days`
      : "—"
  }
/>

<div className="sm:col-span-2 lg:col-span-3">
  <p className="text-sm text-muted-foreground">
    Notice Period Progress
  </p>

  {employee.noticeStartDate && employee.lastWorkingDate ? (
    <>
      {(() => {
        const progress = Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((new Date().getTime() -
                new Date(employee.noticeStartDate).getTime()) /
                (new Date(employee.lastWorkingDate).getTime() -
                  new Date(employee.noticeStartDate).getTime())) *
                100,
            ),
          ),
        );

        return (
          <>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="mt-2 text-sm font-medium">
              {progress}% completed
            </p>
          </>
        );
      })()}
    </>
  ) : (
    <p className="font-medium">—</p>
  )}
</div>

    <Info
      label="Resignation date"
      value={
        employee.resignationDetails?.resignationDate
          ? formatDate(employee.resignationDetails.resignationDate)
          : "—"
      }
    />

    <Info
      label="Resignation reason"
      value={
        employee.resignationDetails?.resignationReason || "—"
      }
    />

    <Info
      label="Employee remarks"
      value={
        employee.resignationDetails?.employeeRemarks || "—"
      }
    />

    <Info
      label="HR remarks"
      value={
        employee.resignationDetails?.hrRemarks || "—"
      }
    />
  </div>
)}

        <div className="mt-8 border-t border-line/70 pt-6">
  <h3 className="mb-5 text-sm font-semibold text-ink">
    Lifecycle progress
  </h3>

  <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
    {[
      "ONBOARDING",
      "ACTIVE",
      "ON_PROBATION",
      "NOTICE_PERIOD",
      "RESIGNED",
      "TERMINATED",
    ].map((stage, index, stages) => (
      <div key={stage} className="flex items-center gap-x-2">
        <span
          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap ${
            employee.status === stage
              ? "bg-brand-600 text-white"
              : "bg-canvas text-ink-faint"
          }`}
        >
          {stage.replace(/_/g, " ")}
        </span>

        {index < stages.length - 1 && (
          <span className="text-sm text-ink-faint">→</span>
        )}
      </div>
    ))}
  </div>
</div>

        {employee.status === "ON_PROBATION" && (
  <div className="mt-5 rounded-2xl border border-line/60 p-4">
    <p className="text-sm font-medium text-ink">
      Probation Period
    </p>

    {employee.probationExtensionDetails ? (
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Info
          label="Extension days"
          value={`${employee.probationExtensionDetails.extensionDays} days`}
        />

        <Info
          label="Extended from"
          value={
            employee.probationExtensionDetails.extendedFrom
              ? formatDate(
                  employee.probationExtensionDetails.extendedFrom,
                )
              : "—"
          }
        />

        <Info
          label="Extended to"
          value={formatDate(employee.probationExtensionDetails.extendedTo)}
        />

        <Info
          label="Remarks"
          value={employee.probationExtensionDetails.remarks || "—"}
        />

        <Info
          label="Extended at"
          value={formatDate(employee.probationExtensionDetails.extendedAt)}
        />
      </div>
    ) : (
      <p className="mt-1 text-[13px] text-ink-soft">
        No probation extension has been applied.
      </p>
    )}
  </div>
)}

       {employee.status === "NOTICE_PERIOD" && (
  <div className="mt-5 rounded-2xl border border-line/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-ink">
          Offboarding Checklist
        </p>

        <p className="mt-1 text-[12px] text-ink-faint">
          Complete all required offboarding activities before closing the
          employee lifecycle.
        </p>
      </div>

      {employee.offboardingChecklist?.completedAt && (
        <Badge tone="success">
          All tasks completed
        </Badge>
      )}
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
  <div>
    <p className="text-sm font-medium text-ink">
      Ready to complete offboarding?
    </p>

    <p className="mt-1 text-[12px] text-ink-faint">
      {offboardingCompleted
        ? "All offboarding activities are completed."
        : "Complete all checklist items to enable offboarding completion."}
    </p>
  </div>

  {isAdmin && (
    <Button
      onClick={onCompleteOffboarding}
      disabled={
        !offboardingCompleted ||
        isCompletingOffboarding ||
        isUpdatingOffboardingChecklist
      }
    >
      {isCompletingOffboarding
        ? "Completing..."
        : "Complete Offboarding"}
    </Button>
  )}
</div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {[
        {
          key: "assetReturn",
          label: "Asset return",
          completed:
            employee.offboardingChecklist?.assetReturn ?? false,
        },
        {
          key: "accessRevoked",
          label: "Access revoked",
          completed:
            employee.offboardingChecklist?.accessRevoked ?? false,
        },
        {
          key: "exitInterview",
          label: "Exit interview",
          completed:
            employee.offboardingChecklist?.exitInterview ?? false,
        },
        {
          key: "finalSettlement",
          label: "Final settlement",
          completed:
            employee.offboardingChecklist?.finalSettlement ?? false,
        },
      ].map((item) => (
        <div
          key={item.key}
          className={cx(
            "flex items-center justify-between gap-3 rounded-xl border px-3 py-3 transition",
            item.completed
              ? "border-success-500/30 bg-success-50/40"
              : "border-line/60",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              checked={item.completed}
              disabled={
                !isAdmin || isUpdatingOffboardingChecklist
              }
              onChange={() => {
                if (!isAdmin) return;

                onUpdateOffboardingChecklist({
                  [item.key]: !item.completed,
                });
              }}
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-brand-600 disabled:cursor-not-allowed"
            />

            <span
              className={cx(
                "text-[13px] font-medium",
                item.completed
                  ? "text-success-700"
                  : "text-ink",
              )}
            >
              {item.label}
            </span>
          </div>

          <Badge tone={item.completed ? "success" : undefined}>
            {item.completed ? "Completed" : "Pending"}
          </Badge>
        </div>
      ))}
    </div>

    {!isAdmin && (
      <p className="mt-4 text-[12px] text-ink-faint">
        Only HR administrators can update the offboarding checklist.
      </p>
    )}

    {isUpdatingOffboardingChecklist && (
      <p className="mt-4 text-[12px] text-brand-600">
        Updating checklist...
      </p>
    )}
  </div>
)}
      </Card>


      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Education */}
        <Card>
          <CardHeader title="Education" />
          {!education.length ? (
            <p className="text-[13px] text-ink-faint">
              No education details added.
            </p>
          ) : (
            <div className="space-y-3">
              {education.map((item: any, index: number) => (
                <div
                  key={item.id ?? index}
                  className="rounded-2xl border border-line/60 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Info
                      label="Qualification"
                      value={item.qualification ?? "—"}
                    />
                    <Info label="Institution" value={item.institution ?? "—"} />
                    <Info
                      label="Specialization"
                      value={item.specialization ?? "—"}
                    />
                    <Info
                      label="Start year"
                      value={
                        item.startYear !== null && item.startYear !== undefined
                          ? String(item.startYear)
                          : "—"
                      }
                    />
                    <Info
                      label="End year"
                      value={
                        item.endYear !== null && item.endYear !== undefined
                          ? String(item.endYear)
                          : "—"
                      }
                    />
                    <Info label="Grade" value={item.grade ?? "—"} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Certifications */}
        <Card>
          <CardHeader title="Certifications" />
          {!certifications.length ? (
            <p className="text-[13px] text-ink-faint">
              No certifications added.
            </p>
          ) : (
            <div className="space-y-3">
              {certifications.map((item: any, index: number) => (
                <div
                  key={item.id ?? index}
                  className="rounded-2xl border border-line/60 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Info label="Certification" value={item.name ?? "—"} />
                    <Info
                      label="Issuing organization"
                      value={item.issuingOrganization ?? "—"}
                    />
                    <Info
                      label="Credential ID"
                      value={item.credentialId ?? "—"}
                    />
                    <Info
                      label="Issue date"
                      value={item.issueDate ? formatDate(item.issueDate) : "—"}
                    />
                    <Info
                      label="Expiry date"
                      value={
                        item.expiryDate ? formatDate(item.expiryDate) : "—"
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Work history */}
        <Card>
          <CardHeader title="Work History" />
          {!workHistory.length ? (
            <p className="text-[13px] text-ink-faint">
              No work experience added.
            </p>
          ) : (
            <div className="space-y-3">
              {workHistory.map((item: any, index: number) => (
                <div
                  key={item.id ?? index}
                  className="rounded-2xl border border-line/60 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Info label="Company" value={item.companyName ?? "—"} />
                    <Info label="Designation" value={item.designation ?? "—"} />
                    <Info
                      label="Start date"
                      value={item.startDate ? formatDate(item.startDate) : "—"}
                    />
                    <Info
                      label="End date"
                      value={
                        item.endDate ? formatDate(item.endDate) : "Present"
                      }
                    />
                  </div>

                  {item.responsibilities && (
                    <div className="mt-4 border-t border-line/60 pt-3">
                      <p className="text-[11.5px] text-ink-faint">
                        Responsibilities
                      </p>
                      <p className="mt-1 text-[13.5px] font-medium text-ink">
                        {item.responsibilities}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader title="Skills" />
          {!skills.length ? (
            <p className="text-[13px] text-ink-faint">No skills added.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {skills.map((item: any, index: number) => (
                <div
                  key={item.id ?? index}
                  className="rounded-xl border border-line/60 px-4 py-3"
                >
                  <p className="text-sm font-medium text-ink">
                    {item.name ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {item.competencyLevel
                      ? item.competencyLevel.replace(/_/g, " ")
                      : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-faint">{label}</dt>

      <dd className="mt-0.5 min-w-0 [overflow-wrap:anywhere] font-medium text-ink">
        {value}
      </dd>
    </div>
  );
}

// ----------------------------------------------------------------------------
function AttendanceTab({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "employee", employeeId, now.getMonth()],
    queryFn: () =>
      AttendanceApi.forEmployee(
        employeeId,
        now.getMonth() + 1,
        now.getFullYear(),
      ),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!data?.length)
    return (
      <EmptyState
        icon={Clock}
        title="No attendance records yet"
        description="Records will appear here once the employee starts checking in."
      />
    );

  return (
    <Card>
      <CardHeader
        title={`Attendance — ${monthName(now.getMonth() + 1)} ${now.getFullYear()}`}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-ink-faint">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Check-in</th>
              <th className="pb-2 font-medium">Check-out</th>
              <th className="pb-2 font-medium">Hours</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-t border-line/60">
                <td className="py-2.5">{formatDate(r.date)}</td>
                <td className="py-2.5 text-ink-faint">
                  {r.checkIn ? formatTime(r.checkIn) : "—"}
                </td>
                <td className="py-2.5 text-ink-faint">
                  {r.checkOut ? formatTime(r.checkOut) : "—"}
                </td>
                <td className="py-2.5 text-ink-faint">
                  {r.workHours ? `${r.workHours}h` : "—"}
                </td>
                <td className="py-2.5">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
function LeaveTab({ employeeId }: { employeeId: string; canManage: boolean }) {
  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ["leave", "balances", employeeId],
    queryFn: () => LeaveApi.balances(employeeId),
  });
  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ["leave", "requests", employeeId],
    queryFn: () => LeaveApi.requests({ employeeId }),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {balancesLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-3xl" />
            ))
          : balances?.map((b) => (
              <Card key={b.id} className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-ink">{b.name}</p>
                  <p className="mt-1 text-[12px] text-ink-faint">
                    {b.allotted - b.used} of {b.allotted} days left
                  </p>
                </div>
                <ProgressRing
                  value={((b.allotted - b.used) / b.allotted) * 100}
                  size={48}
                  strokeWidth={5}
                  color={b.colorHex}
                  trackColor="#F1F0EE"
                />
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader title="Leave history" />
        {requestsLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : !requests?.length ? (
          <p className="text-[13px] text-ink-faint">No leave requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-2xl border border-line/60 px-4 py-3"
              >
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {r.leaveTypeName} · {r.totalDays} day(s)
                  </p>
                  <p className="text-[12px] text-ink-faint">
                    {formatDate(r.startDate)} – {formatDate(r.endDate)} ·{" "}
                    {r.reason}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
function PerformanceTab({ employeeId }: { employeeId: string }) {
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["performance", "reviews", employeeId],
    queryFn: () => PerformanceApi.reviews({ revieweeId: employeeId }),
  });
  const { data: goals, isLoading: goalsLoading } = useQuery({
    queryKey: ["performance", "goals", employeeId],
    queryFn: () => PerformanceApi.goals(employeeId),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Review history" />
        {reviewsLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : !reviews?.length ? (
          <p className="text-[13px] text-ink-faint">No reviews recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-line/60 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-ink">
                    {r.cycleName}
                  </p>
                  <StatusBadge status={r.status} />
                </div>
                {r.finalRating && (
                  <p className="mt-1 text-[12px] text-ink-faint">
                    Final rating:{" "}
                    <span className="font-medium text-ink">
                      {r.finalRating}/5
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Active goals" />
        {goalsLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : !goals?.length ? (
          <EmptyState
            icon={Target}
            title="No goals set"
            description="Goals will appear here once added from the Performance module."
          />
        ) : (
          <div className="space-y-4">
            {goals.map((g) => (
              <div key={g.id}>
                <div className="flex items-center justify-between text-[13px]">
                  <p className="font-medium text-ink">{g.title}</p>
                  <span className="text-ink-faint">{g.progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/5">
                  <div
                    className={cx(
                      "h-full rounded-full",
                      g.status === "AT_RISK"
                        ? "bg-warning-500"
                        : "bg-brand-500",
                    )}
                    style={{ width: `${g.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
function PayrollTab({
  employeeId,
  canEditStructure,
  onEditSalary,
}: {
  employeeId: string;
  canEditStructure: boolean;
  onEditSalary: () => void;
}) {
  const { data: payslips, isLoading } = useQuery({
    queryKey: ["payslips", employeeId],
    queryFn: () => PayrollApi.payslipsForEmployee(employeeId),
  });
  const { data: structure } = useQuery({
    queryKey: ["salary-structure", employeeId],
    queryFn: () => PayrollApi.getSalaryStructure(employeeId),
    enabled: canEditStructure,
  });

  return (
    <div className="space-y-6">
      {canEditStructure && (
        <Card>
          <CardHeader
            title="Salary structure"
            subtitle={
              structure
                ? `Effective from ${formatDate(structure.effectiveFrom)}`
                : "Not configured yet"
            }
            action={
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Wallet size={14} />}
                onClick={onEditSalary}
              >
                {structure ? "Update" : "Set up"}
              </Button>
            }
          />
          {structure && (
            <div className="grid grid-cols-2 gap-y-3 text-[13px] sm:grid-cols-4">
              <Info label="Basic" value={formatCurrencyINR(structure.basic)} />
              <Info label="HRA" value={formatCurrencyINR(structure.hra)} />
              <Info
                label="Special allowance"
                value={formatCurrencyINR(structure.specialAllowance)}
              />
              <Info label="PF" value={formatCurrencyINR(structure.pf)} />
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Payslip history" />
        {isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : !payslips?.length ? (
          <EmptyState
            icon={Wallet}
            title="No payslips yet"
            description="Payslips appear here once payroll has been processed for this employee."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-ink-faint">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Gross</th>
                  <th className="pb-2 font-medium">Deductions</th>
                  <th className="pb-2 font-medium">Net pay</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id} className="border-t border-line/60">
                    <td className="py-2.5">
                      {monthName(p.month!)} {p.year}
                    </td>
                    <td className="py-2.5 text-ink-faint">
                      {formatCurrencyINR(p.grossEarnings)}
                    </td>
                    <td className="py-2.5 text-ink-faint">
                      {formatCurrencyINR(p.totalDeductions)}
                    </td>
                    <td className="py-2.5 font-medium text-ink">
                      {formatCurrencyINR(p.netPay)}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status={p.runStatus!} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
function DocumentsTab({
  employeeId,
  canManage,
  onUpload,
}: {
  employeeId: string;
  canManage: boolean;
  onUpload: () => void;
}) {
  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["documents", employeeId],
    queryFn: () => DocumentsApi.list(employeeId),
  });
  const { data: assets, isLoading: assetsLoading } = useQuery({
    queryKey: ["assets", employeeId],
    queryFn: () => DocumentsApi.assetsForEmployee(employeeId),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Documents"
          action={
            canManage && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Upload size={14} />}
                onClick={onUpload}
              >
                Upload
              </Button>
            )
          }
        />
        {docsLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : !documents?.length ? (
          <EmptyState
            icon={FileText}
            title="No documents on file"
            description="Offer letters, ID proofs, and contracts will show up here."
          />
        ) : (
          <div className="space-y-2">
            {documents.map((d) => (
              <a
                key={d.id}
                href={d.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5 transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="flex items-center gap-2.5 text-[13px] text-ink">
                  <FileText size={15} className="text-brand-500" /> {d.fileName}
                </span>
                <Badge tone="neutral">{d.type.replace(/_/g, " ")}</Badge>
              </a>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Assigned assets" />
        {assetsLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : !assets?.length ? (
          <EmptyState icon={Laptop} title="No assets assigned" />
        ) : (
          <div className="space-y-2">
            {assets.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-line/60 px-4 py-2.5"
              >
                <div>
                  <p className="text-[13px] font-medium text-ink">{a.name}</p>
                  <p className="font-mono text-[11px] text-ink-faint">
                    {a.assetTag}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
type EmployeeForm = {
  firstName: string;
  lastName: string;

  departmentId: string;
  designationId: string;
  managerId: string;

  gender: string;
  maritalStatus: string;
  dateOfBirth: string;
  phone: string;
  personalEmail: string;
  address: string;
  city: string;
  state: string;
  country: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  emergencyContactEmail: string;
  employeeAadhaar: string;
  employeePan: string;
  signature: string;
  avatarUrl: string;
  education: {
    qualification: string;
    institution: string;
    specialization: string;
    startYear: number | null;
    endYear: number | null;
    grade: string;
  }[];
  certifications: {
    name: string;
    issuingOrganization: string;
    issueDate: string;
    expiryDate: string;
    credentialId: string;
  }[];
  workHistory: {
    companyName: string;
    designation: string;
    startDate: string;
    endDate: string;
    responsibilities: string;
  }[];
  skills: {
    name: string;
    competencyLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  }[];
  status: string;
};

function EditEmployeeModal({
  open,
  onClose,
  employee,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  employee: any;
  isAdmin: boolean;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const { register, handleSubmit, control, watch, setValue, reset } =
    useForm<EmployeeForm>({
      defaultValues: {
        firstName: employee.firstName ?? "",
        lastName: employee.lastName ?? "",

        departmentId: employee.departmentId ?? "",
        designationId: employee.designationId ?? "",
        managerId: employee.managerId ?? "",
        gender: employee.gender ?? "",
        maritalStatus: employee.maritalStatus ?? "",
        dateOfBirth: employee.dateOfBirth ?? "",
        phone: employee.phone ?? "",
        personalEmail: employee.personalEmail ?? "",
        address: employee.address ?? "",
        city: employee.city ?? "",
        state: employee.state ?? "",
        country: employee.country ?? "India",

        emergencyContactName: employee.emergencyContactName ?? "",
        emergencyContactPhone: employee.emergencyContactPhone ?? "",
        emergencyContactRelationship:
          employee.emergencyContactRelationship ?? "",
        emergencyContactEmail: employee.emergencyContactEmail ?? "",

        employeeAadhaar: employee.employeeAadhaar ?? "",
        employeePan: employee.employeePan ?? "",
        signature: employee.signature ?? "",
        avatarUrl: employee.avatarUrl ?? "",

        education: employee.education ?? [],
        certifications: employee.certifications ?? [],
        workHistory: employee.workHistory ?? [],
        skills: Array.isArray(employee.skills)
          ? employee.skills.map((skill: any) => ({
              name: skill.name ?? "",
              competencyLevel: skill.competencyLevel ?? "BEGINNER",
            }))
          : [],

        status: employee.status,
      },
    });
  useEffect(() => {
    reset({
      firstName: employee.firstName ?? "",
      lastName: employee.lastName ?? "",

      departmentId: employee.departmentId ?? "",
      designationId: employee.designationId ?? "",
      managerId: employee.managerId ?? "",

      gender: employee.gender ?? "",
      maritalStatus: employee.maritalStatus ?? "",
      dateOfBirth: employee.dateOfBirth ?? "",
      phone: employee.phone ?? "",
      personalEmail: employee.personalEmail ?? "",
      address: employee.address ?? "",
      city: employee.city ?? "",
      state: employee.state ?? "",
      country: employee.country ?? "India",

      emergencyContactName: employee.emergencyContactName ?? "",
      emergencyContactPhone: employee.emergencyContactPhone ?? "",
      emergencyContactRelationship: employee.emergencyContactRelationship ?? "",
      emergencyContactEmail: employee.emergencyContactEmail ?? "",

      employeeAadhaar: employee.employeeAadhaar ?? "",
      employeePan: employee.employeePan ?? "",
      signature: employee.signature ?? "",
      avatarUrl: employee.avatarUrl ?? "",

      education: employee.education ?? [],
      certifications: employee.certifications ?? [],
      workHistory: employee.workHistory ?? [],

      skills: Array.isArray(employee.skills)
        ? employee.skills.map((skill: any) => ({
            name: skill.name ?? "",
            competencyLevel: skill.competencyLevel ?? "BEGINNER",
          }))
        : [],

      status: employee.status,
    });
  }, [employee, reset]);

  const selectedDepartmentId = watch("departmentId");

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: OrganizationApi.departments,
    enabled: isAdmin,
  });

  const { data: designations } = useQuery({
    queryKey: ["designations", selectedDepartmentId],
    queryFn: () => OrganizationApi.designations(selectedDepartmentId),
    enabled: isAdmin && !!selectedDepartmentId,
  });

  const { data: managers } = useQuery({
    queryKey: ["employees", "managers"],
    queryFn: EmployeesApi.managers,
    enabled: isAdmin,
  });

  const {
    fields: educationFields,
    append: appendEducation,
    remove: removeEducation,
  } = useFieldArray({
    control,
    name: "education",
  });

  const {
    fields: certificationFields,
    append: appendCertification,
    remove: removeCertification,
  } = useFieldArray({
    control,
    name: "certifications",
  });

  const {
    fields: workHistoryFields,
    append: appendWorkHistory,
    remove: removeWorkHistory,
  } = useFieldArray({
    control,
    name: "workHistory",
  });

  const {
    fields: skillFields,
    append: appendSkill,
    remove: removeSkill,
  } = useFieldArray({
    control,
    name: "skills",
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      let avatarUrl = payload.avatarUrl;

      if (avatarFile) {
        const result = await EmployeesApi.uploadAvatar(employee.id, avatarFile);

        avatarUrl = result.avatarUrl;
      }

      const updatedPayload = {
  ...payload,
  avatarUrl,
  dateOfBirth: payload.dateOfBirth || null,
  state: payload.state || null,
  emergencyContactRelationship:
    payload.emergencyContactRelationship || null,
  emergencyContactEmail: payload.emergencyContactEmail || null,
  employeeAadhaar: payload.employeeAadhaar || null,
  employeePan: payload.employeePan || null,
  signature: payload.signature || null,
};

      return isAdmin
        ? EmployeesApi.update(employee.id, updatedPayload)
        : EmployeesApi.updateMe(updatedPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", employee.id] });
      showToast("Profile updated.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit((v) => mutation.mutate(v))}
            isLoading={mutation.isPending}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2">
        {isAdmin && (
          <div className="sm:col-span-2 rounded-2xl border border-line/60 p-4">
            <div className="border-b border-line pb-2">
              <h3 className="text-sm font-medium text-ink">
                Organizational Assignment
              </h3>

              <p className="text-xs text-ink-faint">
                Assign department, designation and reporting manager.
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* Department */}
              <div>
                <label className="text-[13px] font-medium text-ink-soft">
                  Department
                </label>

                <select
                  {...register("departmentId", {
                    onChange: () => {
                      setValue("designationId", "");
                    },
                  })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
                >
                  <option value="">Select department</option>

                  {departments?.map((department: any) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Designation */}
              <div>
                <label className="text-[13px] font-medium text-ink-soft">
                  Designation
                </label>

                <select
                  {...register("designationId")}
                  disabled={!selectedDepartmentId}
                  className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm disabled:opacity-50"
                >
                  <option value="">
                    {selectedDepartmentId
                      ? "Select designation"
                      : "Select department first"}
                  </option>

                  {designations?.map((designation: any) => (
                    <option key={designation.id} value={designation.id}>
                      {designation.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reporting Manager */}
              <div className="sm:col-span-2">
                <label className="text-[13px] font-medium text-ink-soft">
                  Reporting Manager
                </label>

                <select
                  {...register("managerId")}
                  className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
                >
                  <option value="">Select reporting manager</option>

                  {managers
                    ?.filter((manager: any) => manager.id !== employee.id)
                    .map((manager: any) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.firstName} {manager.lastName}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        )}
        <TextField label="First name" {...register("firstName")} />
        <TextField label="Last name" {...register("lastName")} />
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Gender
          </label>

          <select
            {...register("gender")}
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
          >
            <option value="">Select gender</option>
            <option value="MALE">MALE</option>
            <option value="FEMALE">FEMALE</option>
            <option value="NOT_MENTIONED">NOT MENTIONED</option>
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">
            Marital Status
          </label>

          <select
            {...register("maritalStatus")}
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
          >
            <option value="">Select marital status</option>
            <option value="SINGLE">SINGLE</option>
            <option value="MARRIED">MARRIED</option>
            <option value="DIVORCED">DIVORCED</option>
            <option value="WIDOWED">WIDOWED</option>
          </select>
        </div>
        <TextField
          label="Date of birth"
          type="date"
          {...register("dateOfBirth")}
        />
        <TextField label="Phone" {...register("phone")} />
        <TextField
          label="Personal email"
          type="email"
          {...register("personalEmail")}
        />
        <TextField
          label="Address"
          className="sm:col-span-2"
          {...register("address")}
        />
        <TextField label="City" {...register("city")} />
        <TextField label="State" {...register("state")} />
        <TextField label="Country" {...register("country")} />
        <TextField
          label="Emergency contact name"
          {...register("emergencyContactName")}
        />
        <TextField
          label="Emergency contact phone"
          {...register("emergencyContactPhone")}
        />
        <TextField
          label="Emergency Contact Relationship"
          {...register("emergencyContactRelationship")}
        />
        <TextField
          label="Emergency Contact Email"
          type="email"
          {...register("emergencyContactEmail")}
        />

        <TextField label="Aadhaar" {...register("employeeAadhaar")} />
        <TextField label="PAN" {...register("employeePan")} />
        <TextField
          label="Signature URL"
          className="sm:col-span-2"
          {...register("signature")}
        />

        <div className="sm:col-span-2 rounded-2xl border border-line/60 p-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <h3 className="text-sm font-medium text-ink">Education</h3>
              <p className="text-xs text-ink-faint">
                Add educational qualifications.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                appendEducation({
                  qualification: "",
                  institution: "",
                  specialization: "",
                  startYear: null,
                  endYear: null,
                  grade: "",
                })
              }
            >
              + Add Education
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {educationFields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-2xl border border-line/60 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Qualification"
                    {...register(`education.${index}.qualification`)}
                  />
                  <TextField
                    label="Institution"
                    {...register(`education.${index}.institution`)}
                  />
                  <TextField
                    label="Specialization"
                    {...register(`education.${index}.specialization`)}
                  />
                  <TextField
                    label="Grade"
                    {...register(`education.${index}.grade`)}
                  />
                  <TextField
                    label="Start year"
                    type="number"
                    {...register(`education.${index}.startYear`, {
                      setValueAs: (value) =>
                        value === "" ? null : Number(value),
                    })}
                  />
                  <TextField
                    label="End year"
                    type="number"
                    {...register(`education.${index}.endYear`, {
                      setValueAs: (value) =>
                        value === "" ? null : Number(value),
                    })}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => removeEducation(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 rounded-2xl border border-line/60 p-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <h3 className="text-sm font-medium text-ink">Certifications</h3>
              <p className="text-xs text-ink-faint">
                Add professional certifications.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                appendCertification({
                  name: "",
                  issuingOrganization: "",
                  issueDate: "",
                  expiryDate: "",
                  credentialId: "",
                })
              }
            >
              + Add Certification
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {certificationFields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-2xl border border-line/60 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Certification name"
                    {...register(`certifications.${index}.name`)}
                  />
                  <TextField
                    label="Issuing organization"
                    {...register(`certifications.${index}.issuingOrganization`)}
                  />
                  <TextField
                    label="Issue date"
                    type="date"
                    {...register(`certifications.${index}.issueDate`)}
                  />
                  <TextField
                    label="Expiry date"
                    type="date"
                    {...register(`certifications.${index}.expiryDate`)}
                  />
                  <TextField
                    label="Credential ID"
                    {...register(`certifications.${index}.credentialId`)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => removeCertification(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 rounded-2xl border border-line/60 p-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <h3 className="text-sm font-medium text-ink">Work History</h3>
              <p className="text-xs text-ink-faint">
                Add previous employment details.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                appendWorkHistory({
                  companyName: "",
                  designation: "",
                  startDate: "",
                  endDate: "",
                  responsibilities: "",
                })
              }
            >
              + Add Work History
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {workHistoryFields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-2xl border border-line/60 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Company name"
                    {...register(`workHistory.${index}.companyName`)}
                  />
                  <TextField
                    label="Designation"
                    {...register(`workHistory.${index}.designation`)}
                  />
                  <TextField
                    label="Start date"
                    type="date"
                    {...register(`workHistory.${index}.startDate`)}
                  />
                  <TextField
                    label="End date"
                    type="date"
                    {...register(`workHistory.${index}.endDate`)}
                  />
                  <TextField
                    label="Responsibilities"
                    className="sm:col-span-2"
                    {...register(`workHistory.${index}.responsibilities`)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => removeWorkHistory(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 rounded-2xl border border-line/60 p-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <h3 className="text-sm font-medium text-ink">Skills</h3>
              <p className="text-xs text-ink-faint">
                Add technical and professional skills.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                appendSkill({
                  name: "",
                  competencyLevel: "BEGINNER",
                })
              }
            >
              + Add Skill
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {skillFields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-2xl border border-line/60 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField
                    label="Skill"
                    {...register(`skills.${index}.name`)}
                  />
                  <div>
                    <label className="text-[13px] font-medium text-ink-soft">
                      Competency level
                    </label>
                    <select
                      {...register(`skills.${index}.competencyLevel`)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
                    >
                      <option value="BEGINNER">Beginner</option>
                      <option value="INTERMEDIATE">Intermediate</option>
                      <option value="ADVANCED">Advanced</option>
                      <option value="EXPERT">Expert</option>
                    </select>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => removeSkill(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 space-y-3">
          <TextField label="Profile image URL" {...register("avatarUrl")} />

          <div>
            <label className="text-[13px] font-medium text-ink-soft">
              Or upload profile image
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-[13px]"
            />
            {avatarFile && (
              <p className="mt-1 text-[12px] text-ink-faint">
                Selected: {avatarFile.name}
              </p>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="sm:col-span-2">
            <label className="text-[13px] font-medium text-ink-soft">
              Employment status
            </label>
            <select
              {...register("status")}
              className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
            >
              <option value="ACTIVE">Active</option>
<option value="ON_PROBATION">On probation</option>
<option value="ON_LEAVE">On leave</option>
<option value="NOTICE_PERIOD">Notice period</option>
<option value="RESIGNED">Resigned</option>
<option value="TERMINATED">Terminated</option>
<option value="INACTIVE">Inactive</option>
<option value="ON_HOLD">On hold</option>
            </select>
          </div>
        )}
      </form>
    </Modal>
  );
}

function SalaryModal({
  open,
  onClose,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: existing } = useQuery({
    queryKey: ["salary-structure", employeeId],
    queryFn: () => PayrollApi.getSalaryStructure(employeeId),
    enabled: open,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SalaryForm>({
    resolver: zodResolver(salarySchema),
    mode: "onSubmit",
  });

  const mutation = useMutation({
    mutationFn: (payload: SalaryForm) =>
      PayrollApi.upsertSalaryStructure({ employeeId, ...payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["salary-structure", employeeId],
      });
      showToast("Salary structure saved.");
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Salary structure"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(
              (v) => mutation.mutate(v),
              (formErrors) => {
                const messages = Object.values(formErrors)
                  .map((error) => error?.message)
                  .filter(Boolean);

                showToast(
                  messages.length > 0
                    ? messages.join(" ")
                    : "Please fill in all required salary fields.",
                  "error",
                );
              },
            )}
            isLoading={mutation.isPending}
          >
            Save
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" key={existing?.id ?? "new"}>
        <div>
          <TextField
            label="Basic"
            type="number"
            required
            defaultValue={existing?.basic}
            {...register("basic", { valueAsNumber: true })}
          />
          {errors.basic && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.basic.message}
            </p>
          )}
        </div>
        <div>
          <TextField
            label="HRA"
            type="number"
            required
            defaultValue={existing?.hra}
            {...register("hra", { valueAsNumber: true })}
          />
          {errors.hra && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.hra.message}
            </p>
          )}
        </div>
        <div>
          <TextField
            label="Conveyance"
            type="number"
            required
            defaultValue={existing?.conveyance}
            {...register("conveyance", { valueAsNumber: true })}
          />
          {errors.conveyance && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.conveyance.message}
            </p>
          )}
        </div>
        <div>
          <TextField
            label="Medical"
            type="number"
            required
            defaultValue={existing?.medical}
            {...register("medical", { valueAsNumber: true })}
          />
          {errors.medical && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.medical.message}
            </p>
          )}
        </div>
        <div>
          <TextField
            label="Special allowance"
            type="number"
            required
            defaultValue={existing?.specialAllowance}
            {...register("specialAllowance", { valueAsNumber: true })}
          />
          {errors.specialAllowance && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.specialAllowance.message}
            </p>
          )}
        </div>
        <div>
          <TextField
            label="Provident Fund (PF)"
            type="number"
            required
            defaultValue={existing?.pf}
            {...register("pf", { valueAsNumber: true })}
          />
          {errors.pf && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.pf.message}
            </p>
          )}
        </div>
        <div>
          <TextField
            label="Professional tax"
            type="number"
            required
            defaultValue={existing?.professionalTax}
            {...register("professionalTax", { valueAsNumber: true })}
          />
          {errors.professionalTax && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.professionalTax.message}
            </p>
          )}
        </div>
        <div>
          <TextField
            label="Income tax (TDS)"
            type="number"
            required
            defaultValue={existing?.incomeTax}
            {...register("incomeTax", { valueAsNumber: true })}
          />
          {errors.incomeTax && (
            <p className="mt-1 text-xs font-medium text-red-500">
              {errors.incomeTax.message}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}

function UploadDocModal({
  open,
  onClose,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("OFFER_LETTER");

  const mutation = useMutation({
    mutationFn: () => DocumentsApi.upload(employeeId, file!, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", employeeId] });
      showToast("Document uploaded.");
      setFile(null);
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
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
            Document type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
          >
            <option value="OFFER_LETTER">Offer letter</option>
            <option value="ID_PROOF">ID proof</option>
            <option value="ADDRESS_PROOF">Address proof</option>
            <option value="EDUCATIONAL">Educational</option>
            <option value="CONTRACT">Contract</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="text-[13px] font-medium text-ink-soft">File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full text-[13px]"
          />
        </div>
      </div>
    </Modal>
  );
}
