/**
 * Mock Sensors dataset for NexusFlow Sensors Module
 */
export const mockSensors = [
  {
    id: "TURBINE-001",
    name: "Turbine 1",
    location: "Plant A",
    status: "Online",
    lastSeen: "Live",
    type: "Turbine Sensor Unit",
    telemetry: {
      temperature: 78.5,
      pressure: 120.0,
      rpm: 1800,
      humidity: 43.0
    }
  },
  {
    id: "TURBINE-002",
    name: "Turbine 2",
    location: "Plant B",
    status: "Offline",
    lastSeen: "2 hours ago",
    type: "Turbine Sensor Unit",
    telemetry: {
      temperature: 24.2,
      pressure: 0.0,
      rpm: 0,
      humidity: 50.1
    }
  },
  {
    id: "TURBINE-003",
    name: "Turbine 3",
    location: "Plant A",
    status: "Warning",
    lastSeen: "1 min ago",
    type: "Turbine Sensor Unit",
    telemetry: {
      temperature: 84.8,
      pressure: 126.4,
      rpm: 2150,
      humidity: 39.5
    }
  },
  {
    id: "BOILER-101",
    name: "Boiler Pressure",
    location: "Plant C",
    status: "Online",
    lastSeen: "Live",
    type: "Pressure Monitor",
    telemetry: {
      temperature: 92.1,
      pressure: 145.2,
      rpm: 0,
      humidity: 62.0
    }
  },
  {
    id: "CHILLER-201",
    name: "Chiller Temperature",
    location: "Plant B",
    status: "Online",
    lastSeen: "Live",
    type: "Temperature Sensor",
    telemetry: {
      temperature: 6.8,
      pressure: 98.0,
      rpm: 1200,
      humidity: 55.4
    }
  }
];
