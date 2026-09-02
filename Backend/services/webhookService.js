'use strict';

/**
 * webhookService.js — Day 2 Webhook Integration & Dispatch
 *
 * Responsibilities:
 * ─────────────────
 * 1. Finalize Alert Payload Contract (Step 2):
 *    {
 *      "event": "RULE_TRIGGERED",
 *      "ruleName": "High Temperature Alert",
 *      "ruleId": "RULE_ID",
 *      "sensorId": "TURBINE-001",
 *      "severity": "HIGH",
 *      "message": "Temperature exceeded 80°C",
 *      "value": 92,
 *      "timestamp": "2026-08-31T10:30:00Z"
 *    }
 * 2. Send asynchronous, non-blocking webhook POST requests to WEBHOOK_URL (Step 5).
 * 3. Graceful failure handling without crashing the backend or alert pipeline (Step 4).
 * 4. Structured response logging for success and failure (Step 6).
 */

const https = require('https');
const http  = require('http');

/**
 * Sends a webhook POST request to the configured WEBHOOK_URL.
 *
 * @param {Object} alert - Alert document or object
 *   Expected shape: { ruleId, ruleName, sensorId, severity, message, value, timestamp, _id }
 * @returns {Promise<{ success: boolean, statusCode?: number, error?: string }>} Resolves gracefully without rejecting.
 */
async function sendWebhook(alert = {}) {
  const webhookUrl = process.env.WEBHOOK_URL;
  const alertId = alert._id ? String(alert._id) : (alert.ruleId ? String(alert.ruleId) : 'unknown');
  const ruleName = alert.ruleName || 'Unknown Rule';
  const sensorId = alert.sensorId || 'unknown';

  if (!webhookUrl) {
    console.warn('[WebhookService] WEBHOOK_URL is not set in environment — skipping webhook.');
    return { success: false, error: 'WEBHOOK_URL not configured' };
  }

  // Step 2: Finalized Standard Alert Payload
  const payloadData = {
    event:     'RULE_TRIGGERED',
    ruleName:  ruleName,
    ruleId:    alert.ruleId ? String(alert.ruleId) : alertId,
    sensorId:  sensorId,
    severity:  alert.severity  || 'HIGH',
    message:   alert.message   || '',
    value:     alert.value     != null ? alert.value : null,
    timestamp: alert.timestamp
      ? (alert.timestamp instanceof Date
          ? alert.timestamp.toISOString()
          : String(alert.timestamp))
      : new Date().toISOString(),
  };

  const payload = JSON.stringify(payloadData);

  // Parse URL and choose transport
  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch (err) {
    console.error(
      `[WebhookService] Webhook failed\n` +
      `  Status: Invalid URL (${err.message})\n` +
      `  Alert: ${ruleName}\n` +
      `  Sensor: ${sensorId}\n` +
      `  Webhook delivery failed for alert ${alertId}`
    );
    return { success: false, error: `Invalid URL: ${err.message}` };
  }

  const transport = parsedUrl.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsedUrl.hostname,
    port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path:     parsedUrl.pathname + (parsedUrl.search || ''),
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 5000, // 5-second timeout — never blocks the alert pipeline
  };

  return new Promise((resolve) => {
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
        if (isSuccess) {
          // Step 6: Success Logging
          console.log(
            `[WebhookService] Webhook sent successfully\n` +
            `  Status: ${res.statusCode}\n` +
            `  Alert: ${ruleName}\n` +
            `  Sensor: ${sensorId}`
          );
        } else {
          // Step 6: Non-2xx Failure Logging
          console.error(
            `[WebhookService] Webhook failed\n` +
            `  Status: ${res.statusCode}\n` +
            `  Alert: ${ruleName}\n` +
            `  Sensor: ${sensorId}\n` +
            `  Webhook delivery failed for alert ${alertId}`
          );
        }
        resolve({ success: isSuccess, statusCode: res.statusCode });
      });
    });

    // Step 4 & 6: Connection Error Handling & Logging
    req.on('error', (err) => {
      console.error(
        `[WebhookService] Webhook failed\n` +
        `  Status: Connection Error (${err.message})\n` +
        `  Alert: ${ruleName}\n` +
        `  Sensor: ${sensorId}\n` +
        `  Webhook delivery failed for alert ${alertId}`
      );
      resolve({ success: false, error: err.message }); // Always resolve, never reject
    });

    // Timeout Handling
    req.on('timeout', () => {
      console.error(
        `[WebhookService] Webhook failed\n` +
        `  Status: Connection Error (Timeout after 5s)\n` +
        `  Alert: ${ruleName}\n` +
        `  Sensor: ${sensorId}\n` +
        `  Webhook delivery failed for alert ${alertId}`
      );
      req.destroy();
      resolve({ success: false, error: 'Timeout after 5s' });
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendWebhook };
