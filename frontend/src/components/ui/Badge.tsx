import { cx } from "@/lib/format";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral" | "gold";

const TONE_STYLES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  success: "bg-success-50 text-success-700 ring-success-500/20",
  warning: "bg-warning-50 text-warning-700 ring-warning-500/20",
  danger: "bg-danger-50 text-danger-700 ring-danger-500/20",
  neutral: "bg-ink/5 text-ink-soft ring-ink/10",
  gold: "bg-gold-50 text-gold-700 ring-gold-300",
};

export function Badge({ tone = "neutral", className, children, style }: { tone?: Tone; className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={style}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset",
        TONE_STYLES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success", PRESENT: "success", APPROVED: "success", COMPLETED: "success", HIRED: "success", PAID: "success", WORK_FROM_HOME: "brand",
  PENDING: "warning", ON_LEAVE: "warning", NOTICE_PERIOD: "warning", HALF_DAY: "warning", DRAFT: "warning", IN_PROGRESS: "brand", AT_RISK: "warning",
  REJECTED: "danger", TERMINATED: "danger", ABSENT: "danger", CANCELLED: "neutral", RESIGNED: "neutral", CLOSED: "neutral", NOT_STARTED: "neutral",
  OPEN: "brand", PROCESSED: "brand", SCREENING: "brand", INTERVIEW: "brand", OFFER: "gold", ON_HOLD: "neutral", SELF_REVIEW: "brand", MANAGER_REVIEW: "brand",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>;
}
