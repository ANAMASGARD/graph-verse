/** Compact relative time for analysis timestamps (e.g. "20m ago"). */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) {
    return "just now";
  }

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) {
    return `${diffHr}h ago`;
  }

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) {
    return `${diffDay}d ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
