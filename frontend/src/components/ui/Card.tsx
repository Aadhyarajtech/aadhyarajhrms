import type { HTMLAttributes } from "react";
import { cx } from "@/lib/format";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hoverable?: boolean;
}

export function Card({
  padded = true,
  hoverable = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cx(
        "group/card relative overflow-hidden rounded-[22px] border border-slate-200/70 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.055)]",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-brand-200/60 before:to-transparent",
        padded && "p-5 sm:p-6",
        hoverable &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-[0_16px_38px_rgba(15,23,42,0.09)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h3>

        {subtitle && (
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}