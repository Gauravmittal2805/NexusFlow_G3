import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTelemetry } from "../context/TelemetryContext";
import { hasPermission } from "./RoleBasedAccess";

const items = [
  { label: "Dashboard", path: "/dashboard", icon: "▦", permission: "dashboard" },
  { label: "Rule Builder", path: "/flow", icon: "⌘", permission: "flow" },
  { label: "Sensors", path: "/sensors", icon: "◉", permission: "sensors" },
  { label: "Alerts", path: "/alerts", icon: "!", permission: "alerts" },
  { label: "Analytics", path: "/analytics", icon: "▥", permission: "analytics" },
  { label: "Settings", path: "/settings", icon: "⚙", permission: "settings" },
];

export default function Sidebar() {
  const { user } = useAuth();
  const { connected } = useTelemetry();

  const visibleItems = items.filter((item) =>
    hasPermission(user?.role, item.permission)
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">N</div>
        <div>
          <strong>NexusFlow</strong>
          <span>IoT Rule Engine</span>
        </div>
      </div>

      <div className="side-label">Workspace</div>

      <nav className="nav-list">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `nav-item ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="connection-box">
          <span className={connected ? "live-dot" : "offline-dot"} />
          <div>
            <strong>{connected ? "Telemetry Live" : "Disconnected"}</strong>
            <small>
              {connected ? "WebSocket Connected" : "Backend Offline"}
            </small>
          </div>
        </div>
      </div>
    </aside>
  );
}
