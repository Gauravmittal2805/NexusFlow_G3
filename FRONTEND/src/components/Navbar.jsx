import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAlerts } from "../context/AlertContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { unreadCount } = useAlerts();
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "NF";

  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "User";

  return (
    <header className="navbar">
      <div>
        <span className="breadcrumb">Workspace /</span>
        <strong> Dashboard</strong>
      </div>

      <div className="navbar-actions">
        <button
          className="icon-button"
          aria-label="Notifications"
          onClick={() => navigate("/alerts")}
          title="View Alerts"
        >
          🔔
          {unreadCount > 0 && (
            <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
          )}
        </button>

        <div className="user-chip">
          <div className="avatar">{initials}</div>
          <div>
            <strong>{user?.name || "User"}</strong>
            <span>{user?.role ? roleLabel : user?.email || ""}</span>
          </div>
        </div>

        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}
