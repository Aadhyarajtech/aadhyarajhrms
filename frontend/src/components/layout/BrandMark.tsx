export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <defs>
        <linearGradient id="brandGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6C5FF0" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#brandGradient)" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeDasharray="76 100" transform="rotate(-90 32 32)" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="#C9A14A" strokeWidth="5" strokeLinecap="round" strokeDasharray="18 100" strokeDashoffset="-76" transform="rotate(-90 32 32)" />
    </svg>
  );
}

export function BrandWordmark({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={size} />
      {withText && (
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold text-ink">Aadhyaraj</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Technologies</p>
        </div>
      )}
    </div>
  );
}
