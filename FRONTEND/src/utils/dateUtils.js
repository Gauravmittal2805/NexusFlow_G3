/**
 * dateUtils.js — Lightweight date helpers (no extra library needed).
 */

/**
 * Returns a human-readable relative time string.
 * e.g. "just now", "3 minutes ago", "2 hours ago"
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDistanceToNow(dateInput) {
  if (!dateInput) return "";

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Formats a timestamp as a readable local time string.
 * e.g. "10:30:45 AM"
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatTime(dateInput) {
  if (!dateInput) return "—";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Formats a timestamp as a full readable date + time string.
 * e.g. "Aug 20, 2026, 10:30 AM"
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return "—";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
