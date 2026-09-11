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

  const { data, isLoading } = useQuery({
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

  if (isLoading) return <Skeleton className="h-[520px] rounded-3xl" />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Roles & permissions"
          subtitle="Control which HRMS modules and actions each built-in role can access."
          action={
            <Badge tone="brand">
              <ShieldCheck size={13} /> Governance
            </Badge>
          }
        />
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <div className="space-y-1">
            {roles.map((item) => (
              <button
                key={item.role}
                onClick={() => setSelectedRole(item.role)}
                className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedRole === item.role ? "bg-brand-50 text-brand-700" : "hover:bg-ink/5 text-ink-soft"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">{item.label}</span>
                  {item.role === "SUPER_ADMIN" && <LockKeyhole size={13} />}
                </div>
                <span className="mt-0.5 block text-[11px] opacity-70">
                  {item.permissions.length} permissions
                </span>
              </button>
            ))}
          </div>

          {role && (
            <div>
              <div className="mb-4 rounded-2xl border border-line/60 bg-surface-muted p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">
                      {role.label}
                    </h4>
                    <p className="mt-1 text-xs text-ink-faint">
                      {role.description}
                    </p>
                  </div>
                  {role.role === "SUPER_ADMIN" ? (
                    <Badge tone="gold">Full access</Badge>
                  ) : (
                    <Badge tone="neutral">Configurable</Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {groupedPermissions.map(([module, permissions]) => (
                  <div
                    key={module}
                    className="rounded-2xl border border-line/60 p-4"
                  >
                    <p className="mb-3 text-[13px] font-medium text-ink">
                      {module}
                    </p>
                    <div className="space-y-2">
                      {permissions.map((permission) => {
                        const checked = draftPermissions.includes(
                          permission.key,
                        );
                        return (
                          <label
                            key={permission.key}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${checked ? "border-brand-200 bg-brand-50/50" : "border-line/60"}`}
                          >
                            <span>
                              <span className="block text-xs font-medium text-ink">
                                {permission.action}
                              </span>
                              <span className="text-[11px] text-ink-faint">
                                {permission.key}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={selectedRole === "SUPER_ADMIN"}
                              onChange={() => togglePermission(permission.key)}
                              className="h-4 w-4 rounded accent-brand-500"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
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
      </Card>

      <Card>
        <CardHeader
          title="Governance policies"
          subtitle="Configure security, approval workflow and HR governance defaults."
          action={
            <Badge tone="neutral">
              <SlidersHorizontal size={13} /> Policies
            </Badge>
          }
        />
        <div className="space-y-3">
          {draftPolicies.map((policy) => (
            <div
              key={policy.key}
              className="flex flex-col gap-3 rounded-2xl border border-line/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="max-w-2xl">
                <p className="text-[13px] font-medium text-ink">
                  {policy.label}
                </p>
                <p className="mt-1 text-[12px] text-ink-faint">
                  {policy.description}
                </p>
              </div>
              {policy.type === "BOOLEAN" ? (
                <button
                  type="button"
                  onClick={() => updatePolicy(policy, !policy.value)}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium ${policy.value ? "border-success-200 bg-success-50 text-success-700" : "border-line bg-white text-ink-faint"}`}
                >
                  <Check size={14} /> {policy.value ? "Enabled" : "Disabled"}
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
                  className="h-10 w-32 rounded-xl border border-line bg-white px-3 text-sm text-ink"
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            leftIcon={<Save size={14} />}
            isLoading={policyMutation.isPending}
            onClick={() => policyMutation.mutate()}
          >
            Save policies
          </Button>
        </div>
      </Card>
    </div>
  );
}
