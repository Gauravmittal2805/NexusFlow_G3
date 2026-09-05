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

<<<<<<<<< Temporary merge branch 1
// Telemetry API endpoints
export const getTelemetry = () => api.get("/api/telemetry");
export const getSensorTelemetry = (sensorId) =>
  api.get(`/api/telemetry/${sensorId}`);
=========
export const getTelemetry = (params) => api.get("/api/telemetry", { params });
export const getSensorTelemetry = (sensorId, params) =>
  api.get(`/api/telemetry/${sensorId}`, { params });
export const getTelemetrySummary = (params) =>
  api.get("/api/telemetry/summary", { params });
>>>>>>>>> Temporary merge branch 2

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

export const updateRuleRequest = (id, payload) =>
  api.put(`/api/rules/${id}`, payload);

export const updateRuleStatusRequest = (id, status) =>
  api.patch(`/api/rules/${id}/status`, { isActive: status });

export const toggleRuleStatusRequest = (id) =>
  api.patch(`/api/rules/${id}/toggle`);

export const deleteRuleRequest = (id) =>
  api.delete(`/api/rules/${id}`);

// GET /api/rules/runtime/status — all active pipelines in memory
export const getRuntimePipelineStatusRequest = () =>
  api.get("/api/rules/runtime/status");

export const getAlertsRequest = () =>
  api.get("/api/alerts");

export const getAlertByIdRequest = (id) =>
  api.get(`/api/alerts/${id}`);

export const markAlertAsReadRequest = (id) =>
  api.patch(`/api/alerts/${id}/read`);

export default api;
