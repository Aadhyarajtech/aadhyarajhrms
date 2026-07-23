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
  delta?: { value: string; positive: boolean };
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
  brand: "#5B4FE5", gold: "#C9A14A", success: "#1A9E72", warning: "#C8780A", danger: "#D14343",
};

export function StatCard({ label, value, icon: Icon, iconTone = "brand", delta, ringValue, caption }: StatCardProps) {
  return (
    <Card hoverable className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-ink-faint">{label}</p>
          <p className="mt-2 font-display text-[28px] font-medium leading-none text-ink">{value}</p>
          {delta && (
            <div className={cx("mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium", delta.positive ? "text-success-700" : "text-danger-500")}>
              {delta.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {delta.value}
            </div>
          )}
          {caption && <p className="mt-2.5 text-[12px] text-ink-faint">{caption}</p>}
        </div>
        {ringValue !== undefined ? (
          <ProgressRing
            value={ringValue}
            size={56}
            strokeWidth={5}
            color={TONE_RING[iconTone]}
            trackColor="#F1F0EE"
            label={<Icon size={18} className={TONE_BG[iconTone].split(" ")[1]} />}
          />
        ) : (
          <div className={cx("flex h-11 w-11 items-center justify-center rounded-2xl", TONE_BG[iconTone])}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </Card>
  );
}
