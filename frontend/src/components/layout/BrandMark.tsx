export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/logo.jpeg"
      alt="Aadhyaraj Technologies logo"
      width={size}
      height={size}
      className="shrink-0 rounded-xl object-cover"
    />
  );
}

export function BrandWordmark({
  size = 32,
  withText = true,
}: {
  size?: number;
  withText?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark size={size} />
      {withText && (
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold text-ink">
            Aadhyaraj
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            Technologies
          </p>
        </div>
      )}
    </div>
  );
}
