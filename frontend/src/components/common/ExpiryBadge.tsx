import type { HTMLAttributes } from "react";

type ExpiryBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  expiresAt?: string | null;
  expiredAt?: string | null;
  status?: string | null;
};

function formatExpiryDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ExpiryBadge({
  expiresAt,
  expiredAt,
  status,
  className = "",
  ...rest
}: ExpiryBadgeProps) {
  const isExpired =
    status === "EXPIRED" ||
    Boolean(expiredAt) ||
    Boolean(
      expiresAt &&
        !Number.isNaN(new Date(expiresAt).getTime()) &&
        new Date(expiresAt).getTime() <= Date.now(),
    );

  if (isExpired) {
    return (
      <span
        {...rest}
        className={`inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ${className}`.trim()}
        title={
          expiredAt
            ? `Expired on ${formatExpiryDate(expiredAt) ?? "unknown date"}`
            : "This record has expired"
        }
      >
        Expired
      </span>
    );
  }

  const formattedExpiry = formatExpiryDate(expiresAt);

  if (!formattedExpiry) return null;

  return (
    <span
      {...rest}
      className={`inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ${className}`.trim()}
      title={`Expires on ${formattedExpiry}`}
    >
      Expires {formattedExpiry}
    </span>
  );
}

export default ExpiryBadge;
