export default function SensorStatus({ value, status }) {
  const calculatedStatus =
    status || (value != null && Number(value) >= 80 ? "Warning" : "Normal");

  return (
    <span
      className={`status-pill ${
        calculatedStatus.toLowerCase() === "warning" ? "warning" : "normal"
      }`}
    >
      <span className="status-dot" />
      {calculatedStatus}
    </span>
  );
}