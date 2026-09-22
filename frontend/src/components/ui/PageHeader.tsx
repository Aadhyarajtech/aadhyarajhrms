export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative mb-7 flex flex-wrap items-start justify-between gap-4 rounded-[24px] border border-slate-200/60 bg-gradient-to-r from-white via-white to-[#FAF8FF] px-5 py-5 shadow-[0_8px_26px_rgba(15,23,42,0.035)] sm:px-6">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.025em] text-ink">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}