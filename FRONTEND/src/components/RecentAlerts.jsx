import React from "react";
import { useNavigate } from "react-router-dom";
import AlertCard from "./AlertCard";
import { useAlerts } from "../context/AlertContext";

export default function RecentAlerts() {
  const { alerts, setSelectedAlertId } = useAlerts();
  const navigate = useNavigate();

  const displayAlerts = alerts.slice(0, 4);

  const handleAlertClick = (alert) => {
    if (setSelectedAlertId) {
      setSelectedAlertId(alert._id || alert.id);
    }
    navigate("/alerts");
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Monitoring</span>
          <h2>Recent Alerts</h2>
        </div>
        <button
          className="text-button"
          onClick={() => navigate("/alerts")}
          title="View all alerts in Alert History"
        >
          View all →
        </button>
      </div>

      <div className="alert-list">
        {displayAlerts.length ? (
          displayAlerts.map((alert) => (
            <AlertCard
              key={alert._id || alert.id}
              alert={alert}
              onClick={() => handleAlertClick(alert)}
            />
          ))
        ) : (
          <div className="empty-state">No alerts triggered yet.</div>
        )}
      </div>
    </section>
  );
}