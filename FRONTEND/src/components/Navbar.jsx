export default function Navbar() {
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
          <div className="avatar">AD</div>
          <div>
            <strong>Admin</strong>
            <span>Factory Manager</span>
          </div>
        </div>
      </div>
    </header>
  );
}