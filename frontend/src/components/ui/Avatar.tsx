import { initials, cx } from "@/lib/format";

const PALETTE = [
  "bg-brand-100 text-brand-700", "bg-gold-100 text-gold-700", "bg-success-50 text-success-700",
  "bg-danger-50 text-danger-700", "bg-ink/10 text-ink-soft",
];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % PALETTE.length;
  return PALETTE[Math.abs(hash)];
}

interface AvatarProps {
  firstName: string;
  lastName: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  ring?: boolean;
}

const SIZES: Record<string, string> = {
  xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base", xl: "h-20 w-20 text-xl",
};

export function Avatar({ firstName, lastName, src, size = "md", ring = false }: AvatarProps) {
  const fullName = `${firstName} ${lastName}`;
  if (src) {
    return (
      <img
        src={src}
        alt={fullName}
        className={cx("rounded-full object-cover", SIZES[size], ring && "ring-2 ring-white")}
      />
    );
  }
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-full font-semibold",
        colorFor(fullName),
        SIZES[size],
        ring && "ring-2 ring-white"
      )}
      title={fullName}
    >
      {initials(firstName, lastName)}
    </div>
  );
}
