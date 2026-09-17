import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, UserRound, LockKeyhole, CheckCircle2 } from "lucide-react";
import { AuthApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

const schema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "At least 8 characters"),
  confirmPassword: z.string().min(1, "Required"),
}).refine((v) => v.newPassword === v.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });
type FormValues = z.infer<typeof schema>;

export default function AccountSettings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (v: FormValues) => AuthApi.changePassword(v.currentPassword, v.newPassword),
    onSuccess: () => {
      showToast("Password updated successfully.");
      reset();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Account settings" subtitle="Manage your login credentials and account details." />

      <section className="relative overflow-hidden rounded-[28px] border border-brand-200/70 bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-600 p-6 text-white shadow-[0_22px_55px_rgba(91,79,229,0.22)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-white/15 p-2 ring-1 ring-white/20">
              <Avatar firstName={user?.employee?.firstName ?? user?.email ?? "U"} lastName={user?.employee?.lastName ?? ""} src={user?.employee?.avatarUrl} size="lg" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ring-white/20">
                <ShieldCheck size={13} /> Secure account
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your account</h2>
              <p className="mt-1 text-sm text-white/75">Keep your sign-in credentials protected and up to date.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:w-auto">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Access</p>
              <p className="mt-1 text-sm font-semibold">Active</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Role</p>
              <p className="mt-1 text-sm font-semibold">{user?.role.replace("_", " ")}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
        <Card className="overflow-hidden border-brand-100/80 bg-gradient-to-b from-brand-50/50 to-white">
          <CardHeader title="Profile overview" subtitle="Your current account identity." />
          <div className="rounded-2xl border border-line/60 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar firstName={user?.employee?.firstName ?? user?.email ?? "U"} lastName={user?.employee?.lastName ?? ""} src={user?.employee?.avatarUrl} size="md" />
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-medium text-ink">{user?.employee?.fullName ?? user?.email}</p>
                <p className="truncate text-[12px] text-ink-faint">{user?.email}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2.5">
              <span className="flex items-center gap-2 text-[12px] text-ink-faint"><UserRound size={14} /> Account role</span>
              <Badge tone="brand">{user?.role.replace("_", " ")}</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <div className="flex items-center gap-3 rounded-xl border border-success-100 bg-success-50/60 px-3 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-success-600 shadow-sm"><CheckCircle2 size={16} /></span>
              <div><p className="text-[12px] font-medium text-ink">Account active</p><p className="text-[11px] text-ink-faint">Your access is currently enabled.</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm"><LockKeyhole size={16} /></span>
              <div><p className="text-[12px] font-medium text-ink">Credential security</p><p className="text-[11px] text-ink-faint">Use a unique password for HRMS.</p></div>
            </div>
          </div>
        </Card>

        <Card className="border-line/70 bg-white shadow-card">
          <CardHeader title="Change password" subtitle="Use a strong password you don't use elsewhere." />
          <form className="space-y-5" onSubmit={handleSubmit((v) => mutation.mutate(v))}>
            <div className="rounded-2xl border border-brand-100 bg-brand-50/50 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm"><KeyRound size={15} /></span>
                <div><p className="text-[12px] font-semibold text-ink">Password protection</p><p className="mt-0.5 text-[11px] leading-5 text-ink-faint">Choose at least 8 characters and avoid reusing a password from another service.</p></div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-1">
              <TextField label="Current password" type="password" required error={errors.currentPassword?.message} {...register("currentPassword")} />
              <TextField label="New password" type="password" required error={errors.newPassword?.message} {...register("newPassword")} />
              <TextField label="Confirm new password" type="password" required error={errors.confirmPassword?.message} {...register("confirmPassword")} />
            </div>
            <div className="flex flex-col gap-3 border-t border-line/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-ink-faint">Your existing validation and password-change workflow remains unchanged.</p>
              <Button leftIcon={<KeyRound size={15} />} type="submit" isLoading={mutation.isPending}>
                Update password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
