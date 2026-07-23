import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Megaphone, Plus, Pin } from "lucide-react";
import { NotificationsApi } from "@/lib/endpoints";
import { getErrorMessage } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { TextField, TextareaField } from "@/components/ui/Field";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { formatDate, timeAgo } from "@/lib/format";

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];

export default function Announcements() {
  const { user } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["announcements"], queryFn: NotificationsApi.announcements });

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Company-wide news and updates."
        action={isAdmin && <Button leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New announcement</Button>}
      />

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={Megaphone} title="No announcements yet" />
      ) : (
        <div className="space-y-4">
          {data.map((a) => (
            <Card key={a.id} className={a.pinned ? "border-gold-300 bg-gold-50/40" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Megaphone size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-[15px] font-medium text-ink">{a.title}</h3>
                      {a.pinned && <Badge tone="gold"><Pin size={11} /> Pinned</Badge>}
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{a.body}</p>
                    <p className="mt-2 text-[12px] text-ink-faint">{formatDate(a.createdAt)} · {timeAgo(a.createdAt)}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { title: "", body: "", pinned: false } });

  const mutation = useMutation({
    mutationFn: NotificationsApi.createAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      showToast("Announcement published.");
      reset();
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="New announcement" footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit((v) => mutation.mutate(v))} isLoading={mutation.isPending}>Publish</Button>
      </>
    }>
      <div className="space-y-4">
        <TextField label="Title" required error={errors.title?.message} {...register("title", { required: true })} />
        <TextareaField label="Message" required error={errors.body?.message} {...register("body", { required: true })} />
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          <input type="checkbox" {...register("pinned")} className="rounded accent-brand-500" /> Pin to top
        </label>
      </div>
    </Modal>
  );
}
