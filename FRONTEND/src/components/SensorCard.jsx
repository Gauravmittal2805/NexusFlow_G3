import SensorStatus from "./SensorStatus";

/**
 * Formats an ISO timestamp string into a human-readable local time (Step 9).
 *
 * Examples:
 *   "2026-08-25T10:30:00.000Z"  →  "10:30:00 AM"      (today)
 *   "2026-08-24T10:30:00.000Z"  →  "24 Aug, 10:30 AM" (another day)
 *   null / undefined / invalid  →  "Just now"
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return "Just now";

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "Just now";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  if (isToday) return timeStr;

  const dateStr = date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });

  return `${dateStr}, ${timeStr}`;
}

export default function SensorCard({
  name,
  value,
  unit,
  status,
  icon = "◉",
  timestamp = null,
}) {
  return (
    <article className="sensor-card">
      <div className="sensor-card-top">
        <div className="sensor-title">
          <span className="sensor-icon">{icon}</span>
          <span>{name}</span>
        </div>
        <span className="sensor-menu">•••</span>
      </div>

      <div className="sensor-value">
        {value == null ? "--" : value}
        <small>{unit}</small>
      </div>

      <div className="sensor-card-footer">
        <SensorStatus value={value} status={status} />
        <span>{formatTimestamp(timestamp)}</span>
      </div>
    </article>
  );
}