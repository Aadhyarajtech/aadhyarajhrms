import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";
import { ProgressRing } from "./ProgressRing";
import { cx } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconTone?: "brand" | "gold" | "success" | "warning" | "danger";
  delta?: {
    value: string;
    positive: boolean;
  };
  ringValue?: number;
  caption?: string;
}

const TONE_BG: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600",
  gold: "bg-gold-50 text-gold-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
};

const TONE_RING: Record<string, string> = {
  brand: "#5B4FE5",
  gold: "#C9A14A",
  success: "#1A9E72",
  warning: "#C8780A",
  danger: "#D14343",
};

const TONE_GLOW: Record<string, string> = {
  brand: "bg-brand-100/40",
  gold: "bg-amber-100/50",
  success: "bg-emerald-100/50",
  warning: "bg-orange-100/50",
  danger: "bg-rose-100/50",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  iconTone = "brand",
  delta,
  ringValue,
  caption,
}: StatCardProps) {
  return (
    <Card
      hoverable
      className="relative overflow-hidden bg-gradient-to-br from-white via-white to-[#FAF9FF]"
    >
      <div
        className={cx(
          "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl",
          TONE_GLOW[iconTone],
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.045em] text-slate-500">
            {label}
          </p>

          <p className="mt-2 font-display text-[30px] font-semibold leading-none tracking-tight text-slate-900">
            {value}
          </p>

          {delta && (
            <div
              className={cx(
                "mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                delta.positive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-600",
              )}
            >
              {delta.positive ? (
                <ArrowUpRight size={13} />
              ) : (
                <ArrowDownRight size={13} />
              )}

              {delta.value}
            </div>
          )}

          {caption && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
              {caption}
            </p>
          )}
        </div>

        {ringValue !== undefined ? (
          <div className="shrink-0 rounded-full bg-white shadow-sm ring-1 ring-slate-100">
            <ProgressRing
              value={ringValue}
              size={56}
              strokeWidth={5}
              color={TONE_RING[iconTone]}
              trackColor="#F1F0EE"
              label={
                <Icon
                  size={18}
                  className={TONE_BG[iconTone].split(" ")[1]}
                />
              }
            />
          </div>
        ) : (
          <div
            className={cx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/[0.025]",
              TONE_BG[iconTone],
            )}
          >
            <Icon size={20} />
          </div>
        )}
      </div>
    </Card>
  );
}