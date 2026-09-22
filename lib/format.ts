/**
 * Formats a monetary amount in Indian Rupees (₹).
 * Supports whole rupees (e.g. ₹190) and fractional amounts (e.g. ₹190.50).
 *
 * @param rupees - Price in INR (e.g. 190 or 650)
 */
export function formatINR(rupees: number): string {
  const amount = Number.isFinite(rupees) ? rupees : 0;
  const hasDecimals = amount % 1 !== 0;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function elapsed(isoString: string, nowTimestamp: number): string {
  const diffMs = nowTimestamp - new Date(isoString).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 min";
  return `${minutes} mins`;
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
