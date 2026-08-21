/**
 * alertService.js — NexusFlow Frontend
 *
 * All communication with the backend Alert API.
 * Backend endpoints (confirmed from Member 2's alertRoutes.js & alertController.js):
 *
 *   GET    /api/alerts          → { success, count, alerts[] }
 *   GET    /api/alerts/:id      → { success, alert }
 *   PATCH  /api/alerts/:id/read → { success, message, alert }
 *
 * Alert document shape (from Member 2's Alert.js model):
 *   {
 *     _id:       string,
 *     ruleId:    string,
 *     ruleName:  string,
 *     sensorId:  string,
 *     message:   string,
 *     severity:  "HIGH" | "MEDIUM" | "LOW"   (default "HIGH"),
 *     status:    "unread" | "read",
 *     action:    string,
 *     timestamp: ISO Date string,
 *     createdAt: ISO Date string,
 *   }
 */

import api from "./api";

/**
 * Fetch all alerts (newest first).
 * @returns {Promise<{ count: number, alerts: Array }>}
 */
export async function getAlerts() {
  const response = await api.get("/api/alerts");
  return response.data; // { success, count, alerts }
}

/**
 * Fetch a single alert by its MongoDB _id.
 * @param {string} id
 * @returns {Promise<{ alert: Object }>}
 */
export async function getAlertById(id) {
  const response = await api.get(`/api/alerts/${id}`);
  return response.data; // { success, alert }
}

/**
 * Mark an alert as read.
 * @param {string} id
 * @returns {Promise<{ alert: Object }>}
 */
export async function markAlertAsRead(id) {
  const response = await api.patch(`/api/alerts/${id}/read`);
  return response.data; // { success, message, alert }
}
