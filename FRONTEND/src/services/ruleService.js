import api from "./api";

/**
 * Service for interacting with the backend Rules API (/api/rules).
 */

// Step 2: Create a new rule (POST /api/rules)
export const createRule = (data) => {
  return api.post("/api/rules", data);
};

// Step 2: Fetch all rules for the authenticated user (GET /api/rules)
export const getRules = () => {
  return api.get("/api/rules");
};

// Step 2: Fetch a single rule by ID with complete graph (GET /api/rules/:id)
export const getRuleById = (id) => {
  return api.get(`/api/rules/${id}`);
};

// Step 2: Update an existing rule (PUT /api/rules/:id)
export const updateRule = (id, data) => {
  return api.put(`/api/rules/${id}`, data);
};

// Step 2: Update rule active status (PATCH /api/rules/:id/status)
export const updateRuleStatus = (id, status) => {
  return api.patch(`/api/rules/${id}/status`, { isActive: status });
};

// Step 2: Delete a rule (DELETE /api/rules/:id)
export const deleteRule = (id) => {
  return api.delete(`/api/rules/${id}`);
};

// Also export toggle status as helper
export const toggleRuleStatus = (id) => {
  return api.patch(`/api/rules/${id}/toggle`);
};

// Step 1: Fetch runtime status of a rule (GET /api/rules/:id/status)
export const getRuleStatus = (id) => {
  return api.get(`/api/rules/${id}/status`);
};

// Step 9: Refresh a rule's current state from backend
export const refreshRule = (id) => {
  return api.get(`/api/rules/${id}`);
};

// GET /api/rules/runtime/status — running pipeline count for Dashboard metric
export const getRuntimePipelineStatus = () => {
  return api.get("/api/rules/runtime/status");
};

export default {
  createRule,
  getRules,
  getRuleById,
  getRuleStatus,
  refreshRule,
  updateRule,
  updateRuleStatus,
  deleteRule,
  toggleRuleStatus,
};
