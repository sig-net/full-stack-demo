import { format, isThisYear } from "date-fns";

/**
 * Displays recent activity relatively and older dates in the browser's local calendar.
 *
 * @param timestamp - Unix time in seconds from the indexed transaction.
 * @returns A relative label or a calendar date, including the year when it differs from this year.
 * @throws {RangeError} If an invalid timestamp reaches calendar formatting.
 */
export function formatActivityDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return "Just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes.toString()}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours.toString()}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays.toString()}d ago`;
  }

  if (isThisYear(date)) {
    return format(date, "MMM d");
  } else {
    return format(date, "MMM d, yyyy");
  }
}

/**
 * Renders a short elapsed duration for a wait a user is watching in real time.
 *
 * @param elapsedMs - Non-negative milliseconds spent so far.
 * @returns Seconds under a minute, minutes and seconds under an hour, hours and minutes above it.
 */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds.toString()}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60)
    return `${minutes.toString()}m ${(totalSeconds % 60).toString().padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60).toString()}h ${(minutes % 60).toString().padStart(2, "0")}m`;
}
