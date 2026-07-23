export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-medium tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-ink-faint">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
