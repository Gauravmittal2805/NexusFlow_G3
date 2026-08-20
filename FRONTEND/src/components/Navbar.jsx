import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();

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
        <button className="icon-button" aria-label="Notifications">
          🔔
          <span className="notification-dot" />
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
