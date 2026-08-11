import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000",
  headers: {
    "Content-Type": "application/json",
  },
});

export const getTelemetry = () => api.get("/telemetry");
export const getSensorTelemetry = (sensorId) =>
  api.get(`/telemetry/${sensorId}`);

export default api;

// Later, replace the mock provider with:
// const { data } = await getTelemetry();