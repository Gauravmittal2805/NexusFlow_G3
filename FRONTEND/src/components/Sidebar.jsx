import { NavLink } from "react-router-dom";

const items = [
  { label: "Dashboard", path: "/dashboard", icon: "▦" },
  { label: "Rule Builder", path: "/flow", icon: "⌘" },
  { label: "Sensors", path: "/sensors", icon: "◉" },
  { label: "Alerts", path: "/alerts", icon: "!" },
  { label: "Analytics", path: "/analytics", icon: "▥" },
  { label: "Settings", path: "/settings", icon: "⚙" },
];

export default function Sidebar() {
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
        {items.map((item) => (
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
          <span className="live-dot" />
          <div>
            <strong>Telemetry Live</strong>
            <small>Mock stream active</small>
          </div>
        </div>
      </div>
    </aside>
  );
}