'use strict';

/**
 * webhookController.js
 *
 * Handles the mock webhook test endpoint (Step 6).
 * POST /api/webhook/test
 *
 * This endpoint lets the team verify the full alert -> webhook flow
 * without depending on any real external SMS / notification provider.
 */

/**
 * @desc   Receive and log a webhook payload (mock / test endpoint)
 * @route  POST /api/webhook/test
 * @access Public (internal testing only)
 */
exports.receiveWebhook = (req, res) => {
  const payload = req.body;

  // Pretty-print to the server console so the team can see it immediately
  console.log('\n[WebhookController] ✅ Webhook received:');
  console.log('  Event   :', payload.event     || '-');
  console.log('  Rule    :', payload.ruleName  || '-');
  console.log('  Sensor  :', payload.sensorId  || '-');
  console.log('  Value   :', payload.value      ?? '-');
  console.log('  Severity:', payload.severity  || '-');
  console.log('  Message :', payload.message   || '-');
  console.log('  Time    :', payload.timestamp || '-');
  console.log('  Full payload:', JSON.stringify(payload, null, 2));

  return res.status(200).json({
    success: true,
    message: 'Webhook received and logged successfully',
    received: payload,
  });
};
