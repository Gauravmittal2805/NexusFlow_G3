/**
 * SensorCard.jsx — Live Sensor Reading Display Card
 *
 * Implements:
 * - Step 5: Displays latest current sensor value clearly (value + unit + status)
 * - Step 8: Shows "—" when no telemetry has arrived yet (graceful empty state)
 */

import SensorStatus from "./SensorStatus";

/**
 * Formats an ISO timestamp string into a human-readable local time.
 *
 * Examples:
 *   "2026-08-28T10:32:15.000Z" → "10:32:15" (today)
 *   "2026-08-27T10:32:15.000Z" → "27 Aug, 10:32 AM" (another day)
 *   null / undefined / invalid  → "Waiting..."
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return "Waiting...";

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
    hour12: false,
  });

  if (isToday) return `Updated: ${timeStr}`;

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
  const isLoading = value == null;

  return (
    <article className="sensor-card">
      <div className="sensor-card-top">
        <div className="sensor-title">
          <span className="sensor-icon">{icon}</span>
          <span>{name}</span>
        </div>
        {/* Step 8: Visual indicator when waiting for live data */}
        {isLoading && (
          <span
            style={{
              fontSize: "10px",
              color: "#94a3b8",
              backgroundColor: "#f1f5f9",
              padding: "2px 7px",
              borderRadius: "20px",
              fontWeight: "600",
            }}
          >
            Waiting...
          </span>
        )}
      </div>

      <div className="sensor-value" style={{ color: isLoading ? "#94a3b8" : undefined }}>
        {isLoading ? "—" : value}
        <small>{unit}</small>
      </div>

      <div className="sensor-card-footer">
        <SensorStatus value={value} status={status} />
        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
          {formatTimestamp(timestamp)}
        </span>
      </div>
    </article>
  );
}