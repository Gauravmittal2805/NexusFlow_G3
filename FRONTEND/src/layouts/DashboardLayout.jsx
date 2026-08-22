import { Outlet, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { useAlerts } from "../context/AlertContext";

export default function DashboardLayout() {
  const { toast, dismissToast, setSelectedAlertId } = useAlerts();
  const navigate = useNavigate();

  const handleToastClick = () => {
    if (toast) {
      if (setSelectedAlertId) {
        setSelectedAlertId(toast._id || toast.id);
      }
      dismissToast();
      navigate("/alerts");
    }
  };

  const sev = (toast?.severity || "HIGH").toUpperCase();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Navbar />
        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Step 5: Global Real-Time Alert Toast Notification */}
      {toast && (
        <div
          className={`alert-toast global-toast sev-${sev.toLowerCase()}`}
          role="alert"
          onClick={handleToastClick}
          title="Click to view Alert Details"
        >
          <span className="alert-toast-icon">
            {sev === "HIGH" ? "🔴" : sev === "MEDIUM" ? "🟡" : "🟢"}
          </span>
          <div className="alert-toast-body">
            <div className="alert-toast-header">
              <span className="toast-sev-badge">{sev}</span>
              <strong>{toast.ruleName || "Real-Time Alert"}</strong>
            </div>
            <span className="toast-message">{toast.message}</span>
            <small className="toast-cta">Click to view details →</small>
          </div>
          <button
            type="button"
            className="alert-toast-close"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast();
            }}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}