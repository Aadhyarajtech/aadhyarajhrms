import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
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
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account settings" subtitle="Manage your login credentials and account details." />

      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <Avatar firstName={user?.employee?.firstName ?? user?.email ?? "U"} lastName={user?.employee?.lastName ?? ""} src={user?.employee?.avatarUrl} size="lg" />
          <div>
            <p className="font-display text-[16px] font-medium text-ink">{user?.employee?.fullName ?? user?.email}</p>
            <p className="text-[13px] text-ink-faint">{user?.email}</p>
            <Badge tone="brand" className="mt-1.5">{user?.role.replace("_", " ")}</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Change password" subtitle="Use a strong password you don't use elsewhere." />
        <form className="space-y-4">
          <TextField label="Current password" type="password" required error={errors.currentPassword?.message} {...register("currentPassword")} />
          <TextField label="New password" type="password" required error={errors.newPassword?.message} {...register("newPassword")} />
          <TextField label="Confirm new password" type="password" required error={errors.confirmPassword?.message} {...register("confirmPassword")} />
          <Button leftIcon={<KeyRound size={15} />} onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
