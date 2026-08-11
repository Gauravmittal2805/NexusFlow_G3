export default function AlertCard({ alert }) {
  return (
    <div className="alert-card">
      <div className={`alert-severity ${alert.severity}`}>
        {alert.severity === "critical" ? "!" : "●"}
      </div>

      <div className="alert-content">
        <strong>{alert.title}</strong>
        <span>
          {alert.sensor} · {alert.value}
        </span>
      </div>

      <time>{alert.time}</time>
    </div>
  );
}