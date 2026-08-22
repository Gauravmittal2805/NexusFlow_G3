import { Outlet, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { useTelemetry } from "../context/TelemetryContext";

export default function DashboardLayout() {
  const { notifications, dismissNotification } = useTelemetry();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Navbar />
        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Global toast container — Steps 6, 7, 10 */}
      {notifications.length > 0 && (
        <div className="global-toast-container" aria-live="polite">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`global-toast toast-${notif.type}`}
              role="alert"
            >
              <div className="toast-body">
                <span className="toast-title">{notif.title}</span>
                {notif.message && (
                  <span className="toast-message">{notif.message}</span>
                )}
              </div>

              <div className="toast-actions">
                {/* Step 7: View Alert link for rule_trigger notifications */}
                {notif.type === "rule_trigger" && notif.ruleId && (
                  <button
                    type="button"
                    className="toast-action-btn"
                    onClick={() => {
                      navigate(`/alerts?ruleId=${notif.ruleId}`);
                      dismissNotification(notif.id);
                    }}
                  >
                    View Alert
                  </button>
                )}

                {/* Step 4: View Alert link for alert_new notifications */}
                {notif.type === "alert_new" && (notif.ruleId || notif.alertId) && (
                  <button
                    type="button"
                    className="toast-action-btn toast-action-btn--red"
                    onClick={() => {
                      const dest = notif.ruleId
                        ? `/alerts?ruleId=${notif.ruleId}`
                        : `/alerts`;
                      navigate(dest);
                      dismissNotification(notif.id);
                    }}
                  >
                    View Alert
                  </button>
                )}

                <button
                  type="button"
                  className="toast-dismiss-btn"
                  onClick={() => dismissNotification(notif.id)}
                  aria-label="Dismiss notification"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}