import AlertCard from "./AlertCard";
import { recentAlerts } from "../data/mockData";

export default function RecentAlerts() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Monitoring</span>
          <h2>Recent Alerts</h2>
        </div>
        <button className="text-button">View all →</button>
      </div>

      <div className="alert-list">
        {recentAlerts.length ? (
          recentAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
        ) : (
          <div className="empty-state">No recent alerts.</div>
        )}
      </div>
    </section>
  );
}