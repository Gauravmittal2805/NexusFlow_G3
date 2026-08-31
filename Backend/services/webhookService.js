'use strict';

/**
 * webhookService.js — Day 1 Webhook Integration
 *
 * Responsibility:
 *   sendWebhook(alert) — fires a POST request to WEBHOOK_URL whenever
 *   an alert is created by the Rule Engine, so external systems
 *   (SMS providers, notification hubs, etc.) can react in real-time.
 *
 * Standard payload sent to the external endpoint:
 * {
 *   "event":     "RULE_TRIGGERED",
 *   "ruleName":  "High Temperature Alert",
 *   "sensorId":  "TURBINE-001",
 *   "severity":  "HIGH",
 *   "message":   "Temperature exceeded 80 degrees C",
 *   "value":     92.8,
 *   "timestamp": "2026-08-31T10:30:00Z"
 * }
 *
 * Design decisions:
 *  - WEBHOOK_URL is read from process.env — never hard-coded.
 *  - Failures are caught and logged; they NEVER crash the core alert pipeline.
 *  - Uses built-in Node.js https/http module (no extra npm dependencies).
 */

const https = require('https');
const http  = require('http');

/**
 * Sends a webhook POST request to the configured WEBHOOK_URL.
 *
 * @param {Object} alert - Alert document from Alert.create()
 *   Expected shape: { ruleName, sensorId, severity, message, value, timestamp, ... }
 * @returns {Promise<void>} Resolves when request completes (or fails gracefully).
 */
async function sendWebhook(alert) {
  const webhookUrl = process.env.WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[WebhookService] WEBHOOK_URL is not set in .env — skipping webhook.');
    return;
  }

  // Standard payload contract (Step 3)
  const payload = JSON.stringify({
    event:     'RULE_TRIGGERED',
    ruleName:  alert.ruleName  || 'Unknown Rule',
    sensorId:  alert.sensorId  || 'unknown',
    severity:  alert.severity  || 'HIGH',
    message:   alert.message   || '',
    value:     alert.value     != null ? alert.value : null,
    timestamp: alert.timestamp
      ? (alert.timestamp instanceof Date
          ? alert.timestamp.toISOString()
          : String(alert.timestamp))
      : new Date().toISOString(),
  });

  // Parse URL and choose http vs https transport
  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch (err) {
    console.error('[WebhookService] Invalid WEBHOOK_URL "' + webhookUrl + '": ' + err.message);
    return;
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
    timeout: 5000, // 5-second timeout — never block the alert pipeline
  };

  return new Promise((resolve) => {
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.log(
          '[WebhookService] Webhook delivered to ' + webhookUrl +
          ' | HTTP ' + res.statusCode +
          ' | Rule: "' + alert.ruleName + '"' +
          ' | Sensor: ' + alert.sensorId
        );
        resolve();
      });
    });

    // Step 8: Graceful failure — log and resolve, NEVER reject
    // An external webhook failure must NEVER crash the core alert pipeline.
    req.on('error', (err) => {
      console.error(
        '[WebhookService] Webhook failed (URL: ' + webhookUrl + ')\n' +
        '  Error: ' + err.message + '\n' +
        '  Alert was still created successfully. Core pipeline unaffected.'
      );
      resolve(); // intentionally resolve (not reject)
    });

    req.on('timeout', () => {
      console.error(
        '[WebhookService] Webhook timed out after 5s (URL: ' + webhookUrl + ')\n' +
        '  Alert was still created successfully. Core pipeline unaffected.'
      );
      req.destroy();
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendWebhook };
