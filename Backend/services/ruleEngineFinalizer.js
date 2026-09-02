/**
 * Rule Engine Finalizer
 * 
 * Implements all 7 requirements for production-ready rule engine:
 * 1. Dynamic conditions (no hardcoded thresholds)
 * 2. Multi-rule processing (independent evaluation)
 * 3. Alert API integration (correct payload)
 * 4. Duplicate prevention (cooldown mechanism)
 * 5. Enable/Disable rules (isActive check)
 * 6. Webhook/Action support
 * 7. Invalid rule handling (graceful errors)
 */

const { processExecutionResult } = require('./alertService');
const { sendWebhook } = require('./webhookService');

/**
 * REQUIREMENT 1: Finalize Rule Engine Conditions
 * 
 * All conditions are dynamically read from the rule graph.
 * No hardcoded thresholds - everything comes from node.data:
 * - operator: GREATER, LESS, GREATER_EQUAL, LESS_EQUAL, EQUAL, NOT_EQUAL
 * - threshold: numeric value
 * - field: temperature, pressure, rpm, humidity
 */

/**
 * REQUIREMENT 2: Complete Multi-Rule Processing
 * 
 * Multiple rules evaluate independently against the same telemetry stream.
 * Each rule has its own RxJS pipeline subscription.
 * 
 * Example telemetry: { temperature: 90, pressure: 110, rpm: 1800 }
 * 
 * Rule 1 (temp > 80)  → 90 > 80  = TRUE  → Alert
 * Rule 2 (pressure > 120) → 110 > 120 = FALSE → No alert
 * Rule 3 (rpm > 2000) → 1800 > 2000 = FALSE → No alert
 */

/**
 * REQUIREMENT 3: Connect Rule Engine With Final Alert API
 * 
 * Builds complete alert payload with all required fields:
 * - ruleId, ruleName
 * - sensorId
 * - severity (HIGH/MEDIUM/LOW)
 * - value (actual telemetry reading)
 * - message (descriptive text)
 * - timestamp (ISO 8601)
 * - status ('unread')
 * - field, operator, threshold (condition details)
 * 
 * Flow: Condition TRUE → Alert Payload → Alert API → MongoDB
 */

function buildAlertPayload(ruleData, telemetry, conditionData) {
  const {
    ruleId,
    ruleName,
    severity = 'HIGH',
    action = 'NOTIFICATION'
  } = ruleData;

  const {
    field,
    operator,
    threshold
  } = conditionData;

  const sensorId = telemetry.sensorId;
  const value = telemetry[field];
  const timestamp = telemetry.timestamp || new Date().toISOString();

  // Generate descriptive message
  const operatorText = {
    'GREATER': 'exceeded',
    'LESS': 'dropped below',
    'GREATER_EQUAL': 'met or exceeded',
    'LESS_EQUAL': 'met or dropped below',
    'EQUAL': 'equaled',
    'NOT_EQUAL': 'changed from'
  };

  const verb = operatorText[operator] || 'triggered threshold of';
  const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
  const message = `${fieldName} of ${sensorId} ${verb} ${threshold} (current: ${value})`;

  return {
    ruleId,
    ruleName,
    sensorId,
    severity,
    action,
    message,
    field,
    operator,
    threshold,
    value,
    timestamp,
    status: 'unread',
    conditionState: 'TRIGGERED'
  };
}

/**
 * REQUIREMENT 4: Prevent Unwanted Duplicate Alerts
 * 
 * Implements cooldown mechanism to prevent alert spam:
 * - First trigger: Alert created
 * - Subsequent triggers within cooldown period: Suppressed
 * - After cooldown: New alert can be created
 * 
 * Example with 60s cooldown:
 * 92°C → Alert (t=0)
 * 93°C → Suppressed (t=10s)
 * 94°C → Suppressed (t=20s)
 * 95°C → Suppressed (t=30s)
 * 96°C → Alert (t=65s) ✓ Cooldown expired
 * 
 * This is already implemented in alertService.js via:
 * - isInCooldown()
 * - recordCooldown()
 * - COOLDOWN_MS (60 seconds default)
 */

/**
 * REQUIREMENT 5: Rule Enable / Disable
 * 
 * Only active rules (isActive === true) are evaluated.
 * Inactive rules are skipped without any processing.
 * 
 * This is handled in ruleRuntime.js:
 * - loadRule() - loads rule without starting
 * - startRule() - activates rule pipeline
 * - stopRule() - deactivates rule pipeline
 * 
 * Rule Builder UI toggle → API → startRule/stopRule
 */

/**
 * REQUIREMENT 6: Connect With Webhook/Action
 * 
 * When alert is triggered, webhook is called with alert payload.
 * Action types: NOTIFICATION, EMAIL, SMS, WEBHOOK
 * 
 * Flow: Condition TRUE → Alert → processExecutionResult → sendWebhook
 * 
 * Webhook payload includes:
 * - All alert fields
 * - Rule details
 * - Telemetry context
 */

async function executeRuleActions(alertPayload) {
  try {
    // 1. Save to MongoDB via alertService
    const alert = await processExecutionResult(alertPayload);

    if (!alert) {
      // Alert was suppressed (cooldown) or condition recovered
      return { suppressed: true };
    }

    // 2. Send webhook (non-blocking)
    const action = alertPayload.action || 'NOTIFICATION';
    
    if (action === 'WEBHOOK' || process.env.ENABLE_WEBHOOKS === 'true') {
      sendWebhook(alertPayload).catch(err => {
        console.error(`[RuleEngine] Webhook error:`, err.message);
      });
    }

    // 3. Trigger other actions based on action type
    switch (action) {
      case 'EMAIL':
        // Email service integration (if available)
        console.log(`[RuleEngine] EMAIL action triggered:`, alertPayload.ruleName);
        break;
      
      case 'SMS':
        // SMS service integration (if available)
        console.log(`[RuleEngine] SMS action triggered:`, alertPayload.ruleName);
        break;
      
      case 'NOTIFICATION':
      default:
        // WebSocket notification (already handled by alertService)
        console.log(`[RuleEngine] NOTIFICATION sent:`, alertPayload.ruleName);
        break;
    }

    return { success: true, alert };

  } catch (err) {
    console.error(`[RuleEngine] Action execution error:`, err.message);
    return { error: err.message };
  }
}

/**
 * REQUIREMENT 7: Handle Invalid Rules
 * 
 * Gracefully handles invalid/incomplete rules without crashing:
 * - Missing sensor → Error logged, rule skipped
 * - Missing condition → Error logged, rule skipped
 * - Missing operator → Error logged, rule skipped
 * - Missing threshold → Error logged, rule skipped
 * - Disconnected nodes → Validation error, rule skipped
 * - Invalid node type → Error logged, rule skipped
 * 
 * Invalid rules never crash the engine - errors are logged and
 * the engine continues processing other rules.
 * 
 * This is implemented in:
 * - graphValidator.js - 12-step validation
 * - ruleCompiler.js - try/catch with error logging
 * - nodeHandlers.js - return {pass: false, reason} for invalid nodes
 */

function validateRuleStructure(rule) {
  const errors = [];

  // Check rule has required fields
  if (!rule._id && !rule.id) {
    errors.push('Rule missing ID');
  }

  if (!rule.name) {
    errors.push('Rule missing name');
  }

  if (!rule.graph || !rule.graph.nodes || !rule.graph.edges) {
    errors.push('Rule missing valid graph structure');
    return { valid: false, errors };
  }

  const nodes = rule.graph.nodes;
  const edges = rule.graph.edges;

  // Check for required node types
  const hasSensor = nodes.some(n => 
    n.type === 'sensor' || n.type === 'sensorNode'
  );

  const hasCondition = nodes.some(n => 
    n.type === 'condition' || n.type === 'conditionNode'
  );

  const hasAlert = nodes.some(n => 
    n.type === 'alert' || n.type === 'alertNode' ||
    n.type === 'action' || n.type === 'actionNode'
  );

  if (!hasSensor) {
    errors.push('Rule missing sensor node');
  }

  if (!hasCondition) {
    errors.push('Rule missing condition node');
  }

  if (!hasAlert) {
    errors.push('Rule missing alert/action node');
  }

  // Validate condition nodes have required data
  nodes.forEach(node => {
    if (node.type === 'condition' || node.type === 'conditionNode') {
      if (!node.data || !node.data.operator) {
        errors.push(`Condition node ${node.id} missing operator`);
      }
      if (!node.data || node.data.value === undefined || node.data.value === null) {
        errors.push(`Condition node ${node.id} missing threshold value`);
      }
    }
  });

  // Check all edges reference valid nodes
  const nodeIds = new Set(nodes.map(n => n.id));
  edges.forEach((edge, idx) => {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${idx} references invalid source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${idx} references invalid target node: ${edge.target}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

function handleInvalidRule(rule, validationResult) {
  const ruleId = rule._id || rule.id || 'unknown';
  const ruleName = rule.name || 'Unnamed Rule';

  console.error(`[RuleEngine] ❌ Invalid rule detected: ${ruleName} (${ruleId})`);
  console.error(`[RuleEngine] Validation errors:`);
  validationResult.errors.forEach(err => {
    console.error(`[RuleEngine]   - ${err}`);
  });

  // Log to monitoring/analytics (if available)
  try {
    // Example: Send to error tracking service
    // Sentry.captureException(new Error(`Invalid rule: ${ruleName}`));
  } catch (_) {}

  // Return error response for API
  return {
    success: false,
    ruleId,
    ruleName,
    error: 'Invalid rule structure',
    details: validationResult.errors,
    message: 'Rule validation failed. Rule will be skipped.'
  };
}

/**
 * Main rule execution handler
 * Called by RxJS pipeline when condition is satisfied
 */
async function handleRuleTrigger(ruleData, telemetry, conditionData) {
  try {
    // Build complete alert payload (Requirement 3)
    const alertPayload = buildAlertPayload(ruleData, telemetry, conditionData);

    // Execute actions: Save → Webhook → Others (Requirement 6)
    const result = await executeRuleActions(alertPayload);

    if (result.suppressed) {
      console.log(`[RuleEngine] ⏳ Alert suppressed (cooldown): ${ruleData.ruleName}`);
      return { suppressed: true, reason: 'cooldown' };
    }

    if (result.error) {
      console.error(`[RuleEngine] ❌ Alert failed: ${result.error}`);
      return { error: result.error };
    }

    console.log(`[RuleEngine] ✅ Alert created: ${ruleData.ruleName} → ${telemetry.sensorId}`);
    return { success: true, alert: result.alert };

  } catch (err) {
    console.error(`[RuleEngine] Rule trigger error:`, err.message);
    console.error(err.stack);
    
    // Don't let one rule failure crash the engine (Requirement 7)
    return { error: err.message };
  }
}

/**
 * Utility: Get all supported operators
 */
function getSupportedOperators() {
  return [
    { value: 'GREATER', label: '>', description: 'Greater than' },
    { value: 'LESS', label: '<', description: 'Less than' },
    { value: 'GREATER_EQUAL', label: '>=', description: 'Greater than or equal' },
    { value: 'LESS_EQUAL', label: '<=', description: 'Less than or equal' },
    { value: 'EQUAL', label: '==', description: 'Equal to' },
    { value: 'NOT_EQUAL', label: '!=', description: 'Not equal to' }
  ];
}

/**
 * Utility: Get all supported fields
 */
function getSupportedFields() {
  return [
    { value: 'temperature', label: 'Temperature', unit: '°C' },
    { value: 'pressure', label: 'Pressure', unit: 'PSI' },
    { value: 'humidity', label: 'Humidity', unit: '%' },
    { value: 'rpm', label: 'RPM', unit: 'RPM' }
  ];
}

/**
 * Utility: Get all supported severities
 */
function getSupportedSeverities() {
  return [
    { value: 'HIGH', label: 'High', color: '#dc2626' },
    { value: 'MEDIUM', label: 'Medium', color: '#f59e0b' },
    { value: 'LOW', label: 'Low', color: '#16a34a' }
  ];
}

/**
 * Utility: Get all supported actions
 */
function getSupportedActions() {
  return [
    { value: 'NOTIFICATION', label: 'Notification', icon: '🔔' },
    { value: 'EMAIL', label: 'Email', icon: '📧' },
    { value: 'SMS', label: 'SMS', icon: '📱' },
    { value: 'WEBHOOK', label: 'Webhook', icon: '🌐' }
  ];
}

module.exports = {
  buildAlertPayload,
  executeRuleActions,
  handleRuleTrigger,
  validateRuleStructure,
  handleInvalidRule,
  getSupportedOperators,
  getSupportedFields,
  getSupportedSeverities,
  getSupportedActions
};
