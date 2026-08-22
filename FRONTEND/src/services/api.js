import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5005",
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the latest JWT to every protected request.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export const getTelemetry = () => api.get("/telemetry");
export const getSensorTelemetry = (sensorId) =>
  api.get(`/telemetry/${sensorId}`);

export const registerRequest = (payload) =>
  api.post("/api/auth/register", payload);

export const loginRequest = (payload) =>
  api.post("/api/auth/login", payload);

export const profileRequest = () =>
  api.get("/api/auth/profile");

export const createRuleRequest = (payload) =>
  api.post("/api/rules", payload);

export const getRulesRequest = () =>
  api.get("/api/rules");

export const getRuleByIdRequest = (id) =>
  api.get(`/api/rules/${id}`);

export const toggleRuleStatusRequest = (id) =>
  api.patch(`/api/rules/${id}/toggle`);

export default api;
