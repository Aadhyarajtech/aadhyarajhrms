export function getExpiryState(expiresAt?: string | null, status?: string) {
  if (!expiresAt || status === "EXPIRED") {
    return {
      expired: status === "EXPIRED",
      label: status === "EXPIRED" ? "Expired" : "",
    };
  }

  const ms = new Date(expiresAt).getTime() - Date.now();

  if (ms <= 0) {
    return { expired: true, label: "Expired" };
  }

  const minutes = Math.ceil(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];

  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (!days && mins) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);

  return {
    expired: false,
    label: `Expires in ${parts.join(" ") || "less than a minute"}`,
  };
}

export function formatExpiryDate(value?: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
