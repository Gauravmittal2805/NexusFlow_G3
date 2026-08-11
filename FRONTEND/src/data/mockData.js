export const sensors = [
  {
    id: "TURBINE-001",
    name: "Temperature",
    value: 78.5,
    unit: "°C",
    status: "Normal",
    icon: "🌡️",
  },
  {
    id: "TURBINE-001",
    name: "Pressure",
    value: 120,
    unit: "PSI",
    status: "Normal",
    icon: "◉",
  },
  {
    id: "TURBINE-001",
    name: "RPM",
    value: 1800,
    unit: "RPM",
    status: "Normal",
    icon: "⚙️",
  },
  {
    id: "TURBINE-001",
    name: "Humidity",
    value: 43,
    unit: "%",
    status: "Normal",
    icon: "💧",
  },
];

export const telemetryHistory = [
  { time: "10s", temperature: 72, pressure: 116, rpm: 1750 },
  { time: "20s", temperature: 74, pressure: 118, rpm: 1780 },
  { time: "30s", temperature: 76, pressure: 119, rpm: 1795 },
  { time: "40s", temperature: 75, pressure: 121, rpm: 1805 },
  { time: "50s", temperature: 78, pressure: 120, rpm: 1800 },
  { time: "60s", temperature: 78.5, pressure: 120, rpm: 1800 },
];

export const recentAlerts = [
  {
    id: 1,
    title: "High Temperature",
    sensor: "TURBINE-001",
    value: "82.4°C",
    time: "2 minutes ago",
    severity: "warning",
  },
  {
    id: 2,
    title: "High RPM",
    sensor: "TURBINE-003",
    value: "2510 RPM",
    time: "5 minutes ago",
    severity: "critical",
  },
  {
    id: 3,
    title: "Pressure Normalized",
    sensor: "TURBINE-001",
    value: "120 PSI",
    time: "8 minutes ago",
    severity: "info",
  },
];