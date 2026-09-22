import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  LockKeyhole,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  GovernanceApi,
  type GovernancePolicy,
  type GovernancePermission,
} from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/EmptyState";

const ROLE_ORDER = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "MANAGER",
  "RECRUITER",
  "FINANCE",
  "IT_SUPPORT",
  "EMPLOYEE",
];

export default function GovernanceSettings() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState("HR_ADMIN");
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [draftPolicies, setDraftPolicies] = useState<GovernancePolicy[]>([]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["governance"],
    queryFn: GovernanceApi.get,
  });

  const roles = useMemo(
    () =>
      [...(data?.roles ?? [])].sort(
        (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
      ),
    [data?.roles],
  );

  const role = roles.find((item) => item.role === selectedRole) ?? roles[0];

  useEffect(() => {
    if (!role) return;
    setSelectedRole(role.role);
    setDraftPermissions(role.permissions);
  }, [role?.role, role?.permissions.join("|")]);

  useEffect(() => {
    setDraftPolicies(data?.policies ?? []);
  }, [data?.policies]);

  const roleMutation = useMutation({
    mutationFn: () => GovernanceApi.updateRole(selectedRole, draftPermissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance"] });
      showToast("Role permissions updated.");
    },
    onError: (error) => showToast(getErrorMessage(error), "error"),
  });

  const policyMutation = useMutation({
    mutationFn: () =>
      GovernanceApi.updatePolicies(
        draftPolicies.map(({ key, value }) => ({ key, value })),
      ),
    onSuccess: (policies) => {
      queryClient.setQueryData(["governance"], (current: typeof data) =>
        current ? { ...current, policies } : current,
      );
      showToast("Governance policies updated.");
    },
    onError: (error) => showToast(getErrorMessage(error), "error"),
  });

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, GovernancePermission[]>();
    for (const permission of data?.permissions ?? []) {
      const list = groups.get(permission.module) ?? [];
      list.push(permission);
      groups.set(permission.module, list);
    }
    return [...groups.entries()];
  }, [data?.permissions]);

  const togglePermission = (permission: string) => {
    if (selectedRole === "SUPER_ADMIN") return;
    setDraftPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  };

  const updatePolicy = (
    policy: GovernancePolicy,
    value: GovernancePolicy["value"],
  ) => {
    setDraftPolicies((current) =>
      current.map((item) =>
        item.key === policy.key ? { ...item, value } : item,
      ),
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 rounded-[24px]" />
        <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
          <Skeleton className="h-[430px] rounded-[24px]" />
          <Skeleton className="h-[430px] rounded-[24px]" />
        </div>
        <Skeleton className="h-[260px] rounded-[24px]" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="overflow-hidden border-red-100 bg-gradient-to-br from-white to-red-50/40">
        <div className="flex min-h-[340px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
            <ShieldCheck size={25} />
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-red-600">
            Governance unavailable
          </p>
          <h3 className="mt-2 text-lg font-semibold text-ink">
            Governance configuration could not be loaded
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink-faint">
            {getErrorMessage(error)}
          </p>
          <Button
            className="mt-6"
            variant="outline"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  const permissionCount = data?.permissions?.length ?? 0;
  const policyCount = data?.policies?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Governance overview */}
      <div className="relative overflow-hidden rounded-[24px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50/60 p-5 shadow-[0_16px_40px_-28px_rgba(79,70,229,0.32)]">
        <div className="absolute -right-12 -top-16 h-36 w-36 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="absolute -bottom-16 left-1/3 h-32 w-32 rounded-full bg-indigo-200/25 blur-3xl" />

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">
              <ShieldCheck size={13} />
              Access control center
            </div>
            <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
              Roles, permissions & policies
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-faint">
              Manage built-in HRMS roles, module permissions and organization
              governance defaults without changing the existing authorization workflow.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="min-w-[86px] rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                Roles
              </p>
              <p className="mt-1 text-xl font-semibold text-ink">{roles.length}</p>
            </div>
            <div className="min-w-[86px] rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                Permissions
              </p>
              <p className="mt-1 text-xl font-semibold text-ink">{permissionCount}</p>
            </div>
            <div className="min-w-[86px] rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                Policies
              </p>
              <p className="mt-1 text-xl font-semibold text-ink">{policyCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Roles & permissions */}
      <Card className="overflow-hidden border-indigo-100/80 shadow-[0_12px_32px_-25px_rgba(79,70,229,0.28)]">
        <CardHeader
          title="Roles & permissions"
          subtitle="Control which HRMS modules and actions each built-in role can access."
          action={
            <Badge tone="brand">
              <ShieldCheck size={13} /> Governance
            </Badge>
          }
        />

        {!roles.length ? (
          <div className="mx-5 mb-5 rounded-2xl border border-dashed border-line bg-surface-muted px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">
              No governance roles returned
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              The Governance API responded successfully, but no role records were returned.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[250px_1fr]">
            <div className="rounded-2xl border border-line/60 bg-surface-muted/60 p-2">
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Built-in roles
                </span>
                <span className="text-[10px] text-ink-faint">{roles.length}</span>
              </div>

              <div className="space-y-1">
                {roles.map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => setSelectedRole(item.role)}
                    className={`group w-full rounded-xl border px-3 py-3 text-left transition ${
                      selectedRole === item.role
                        ? "border-brand-200 bg-white text-brand-700 shadow-sm"
                        : "border-transparent text-ink-soft hover:border-line hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium">{item.label}</span>
                      {item.role === "SUPER_ADMIN" && (
                        <LockKeyhole size={13} className="text-amber-600" />
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] opacity-70">
                        {item.permissions.length} permissions
                      </span>
                      {item.role === "SUPER_ADMIN" && (
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] opacity-60">
                          System
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {role && (
              <div className="min-w-0">
                <div className="mb-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-ink">
                          {role.label}
                        </h4>
                        <Badge tone={role.role === "SUPER_ADMIN" ? "gold" : "neutral"}>
                          {role.role}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-ink-faint">
                        {role.description}
                      </p>
                    </div>
                    {role.role === "SUPER_ADMIN" ? (
                      <Badge tone="gold">
                        <LockKeyhole size={12} /> Full access
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Configurable</Badge>
                    )}
                  </div>
                </div>

                {!groupedPermissions.length ? (
                  <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
                    <p className="text-sm font-semibold text-ink">
                      No permissions returned
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      The role exists, but the permission catalog is empty.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {groupedPermissions.map(([module, permissions]) => (
                      <div
                        key={module}
                        className="rounded-2xl border border-line/60 bg-white p-4 transition hover:border-indigo-100 hover:shadow-sm"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold text-ink">
                            {module}
                          </p>
                          <span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-medium text-ink-faint">
                            {permissions.length}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {permissions.map((permission) => {
                            const checked = draftPermissions.includes(permission.key);

                            return (
                              <label
                                key={permission.key}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
                                  checked
                                    ? "border-brand-200 bg-brand-50/50"
                                    : "border-line/60 hover:border-line hover:bg-surface-muted/50"
                                } ${
                                  selectedRole === "SUPER_ADMIN"
                                    ? "cursor-not-allowed opacity-80"
                                    : ""
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-medium text-ink">
                                    {permission.action}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                                    {permission.key}
                                  </span>
                                </span>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={selectedRole === "SUPER_ADMIN"}
                                  onChange={() => togglePermission(permission.key)}
                                  className="h-4 w-4 shrink-0 rounded accent-brand-500"
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-ink-faint">
                    {role.role === "SUPER_ADMIN"
                      ? "Super Administrator permissions are system-controlled."
                      : `${draftPermissions.length} permission${draftPermissions.length === 1 ? "" : "s"} selected for this role.`}
                  </p>

                  <Button
                    leftIcon={<Save size={14} />}
                    disabled={selectedRole === "SUPER_ADMIN"}
                    isLoading={roleMutation.isPending}
                    onClick={() => roleMutation.mutate()}
                  >
                    Save permissions
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Governance policies */}
      <Card className="overflow-hidden border-emerald-100/80 shadow-[0_12px_32px_-25px_rgba(16,185,129,0.22)]">
        <CardHeader
          title="Governance policies"
          subtitle="Configure security, approval workflow and HR governance defaults."
          action={
            <Badge tone="neutral">
              <SlidersHorizontal size={13} /> Policies
            </Badge>
          }
        />

        {!draftPolicies.length ? (
          <div className="mx-5 mb-5 rounded-2xl border border-dashed border-line bg-surface-muted px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">
              No governance policies returned
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              The policy catalog is empty, so there is nothing to configure yet.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 px-5">
              {draftPolicies.map((policy) => (
                <div
                  key={policy.key}
                  className="flex flex-col gap-4 rounded-2xl border border-line/60 bg-white p-4 transition hover:border-emerald-100 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink">
                        {policy.label}
                      </p>
                      <span className="rounded-full bg-surface-muted px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                        {policy.type === "BOOLEAN" ? "Security / Workflow" : "HR Policy"}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-ink-faint">
                      {policy.description}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-ink-faint">
                      {policy.key}
                    </p>
                  </div>

                  {policy.type === "BOOLEAN" ? (
                    <button
                      type="button"
                      onClick={() => updatePolicy(policy, !policy.value)}
                      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition ${
                        policy.value
                          ? "border-success-200 bg-success-50 text-success-700 hover:bg-success-100"
                          : "border-line bg-white text-ink-faint hover:bg-surface-muted"
                      }`}
                    >
                      <Check size={14} />
                      {policy.value ? "Enabled" : "Disabled"}
                    </button>
                  ) : (
                    <input
                      type={policy.type === "NUMBER" ? "number" : "text"}
                      value={String(policy.value)}
                      onChange={(event) =>
                        updatePolicy(
                          policy,
                          policy.type === "NUMBER"
                            ? Number(event.target.value)
                            : event.target.value,
                        )
                      }
                      className="h-10 w-full shrink-0 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100 sm:w-40"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-line/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-ink-faint">
                Changes remain in draft until you save the governance policies.
              </p>
              <Button
                leftIcon={<Save size={14} />}
                isLoading={policyMutation.isPending}
                onClick={() => policyMutation.mutate()}
              >
                Save policies
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
