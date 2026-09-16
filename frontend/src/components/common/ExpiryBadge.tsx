import { useEffect, useState } from "react";
import { getExpiryState, formatExpiryDate } from "@/lib/expiry";

export default function ExpiryBadge({
  expiresAt,
  expiredAt,
  status,
}: {
  expiresAt?: string | null;
  expiredAt?: string | null;
  status?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTick(v => v + 1), 60000); return () => window.clearInterval(id); }, []);
  const effectiveExpiry = expiresAt ?? expiredAt ?? null;
  const state = getExpiryState(effectiveExpiry, status);
  if (!state.label) return null;
  return <div className={`mt-1 text-[11px] ${state.expired ? "font-semibold text-red-600" : "text-amber-700"}`} title={effectiveExpiry ? formatExpiryDate(effectiveExpiry) : undefined}>{state.label}{effectiveExpiry && !state.expired ? ` · ${formatExpiryDate(effectiveExpiry)}` : ""}</div>;
}
