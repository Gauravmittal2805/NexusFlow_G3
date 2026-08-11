import SensorStatus from "./SensorStatus";

export default function SensorCard({
  name,
  value,
  unit,
  status,
  icon = "◉",
  timestamp = "Just now",
}) {
  return (
    <article className="sensor-card">
      <div className="sensor-card-top">
        <div className="sensor-title">
          <span className="sensor-icon">{icon}</span>
          <span>{name}</span>
        </div>
        <span className="sensor-menu">•••</span>
      </div>

      <div className="sensor-value">
        {value == null ? "--" : value}
        <small>{unit}</small>
      </div>

      <div className="sensor-card-footer">
        <SensorStatus value={value} status={status} />
        <span>{timestamp}</span>
      </div>
    </article>
  );
}