import type { HTMLAttributes } from "react";
import { cx } from "@/lib/format";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hoverable?: boolean;
}

export function Card({ padded = true, hoverable = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-3xl border border-line/70 bg-white shadow-card",
        padded && "p-5 sm:p-6",
        hoverable && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-lg font-medium text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
