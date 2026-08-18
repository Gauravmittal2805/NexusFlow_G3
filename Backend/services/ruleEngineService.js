const EventEmitter = require('events');
const { getActiveRules } = require('./ruleService');

// Internal Event Emitter for Rule Engine events (Step 9)
class RuleEventEmitter extends EventEmitter {}
const ruleEventEmitter = new RuleEventEmitter();

/**
 * Process incoming telemetry stream and match against active rules (Steps 6-10).
 *
 * @param {Object} telemetryData - incoming telemetry reading
 * @param {string} telemetryData.sensorId - e.g. "TURBINE-001"
 * @param {number} [telemetryData.temperature]
 * @param {number} [telemetryData.pressure]
 * @param {number} [telemetryData.humidity]
 * @param {number} [telemetryData.rpm]
 * @param {Date|string} [telemetryData.timestamp]
 */
const processTelemetry = async (telemetryData) => {
  const { sensorId, timestamp, temperature, pressure, humidity, rpm } = telemetryData;

  if (!sensorId) return;

  // Step 10 Log: Telemetry received
  console.log(`[RuleEngine] Telemetry received: ${sensorId}`);

  // Step 4 & 5: Fetch active rules only
  const activeRules = await getActiveRules();
  if (!activeRules || activeRules.length === 0) {
    return;
  }

  // Iterate over active rules to match sensor nodes (Step 6 & 7)
  for (const rule of activeRules) {
    const nodes = rule.nodes || [];

    // Find sensor node matching the incoming telemetry sensorId
    const matchingSensorNode = nodes.find((node) => {
      const isSensorType = node.type === 'sensor' || node.type === 'sensorNode';
      if (!isSensorType) return false;

      const nodeSensorId = node.data?.sensorId || node.data?.sensor;
      // Match by exact sensorId (e.g. TURBINE-001) or standard prefix
      return (
        nodeSensorId === sensorId ||
        sensorId.startsWith(String(nodeSensorId)) ||
        String(nodeSensorId).startsWith(sensorId)
      );
    });

    if (matchingSensorNode) {
      // Step 10 Log: Active rule found & Sensor matched
      console.log(`[RuleEngine] Active rule found: ${rule.name}`);
      console.log(`[RuleEngine] Sensor matched: ${sensorId}`);

      // Extract condition node from graph (if present) for Step 8 evaluation input
      const conditionNode = nodes.find(
        (node) => node.type === 'condition' || node.type === 'conditionNode'
      );

      const conditionData = conditionNode
        ? {
            field: conditionNode.data?.field || conditionNode.data?.sensor || 'temperature',
            operator: conditionNode.data?.operator || '>',
            value: conditionNode.data?.value !== undefined ? conditionNode.data.value : 80,
          }
        : {
            field: 'temperature',
            operator: '>',
            value: 80,
          };

      // Step 8: Prepare common structure for future engine execution
      const evaluationInput = {
        ruleId: rule._id.toString(),
        sensorId,
        telemetry: {
          temperature,
          pressure,
          humidity,
          rpm,
        },
        condition: conditionData,
      };

      // Step 10 Log: Rule ready for evaluation
      console.log(`[RuleEngine] Rule ready for evaluation`);

      // Step 9: Emit internal `rule:matched` event
      const eventPayload = {
        ruleId: rule._id.toString(),
        sensorId,
        timestamp: timestamp
          ? typeof timestamp === 'string'
            ? timestamp
            : timestamp.toISOString()
          : new Date().toISOString(),
        evaluationInput,
      };

      ruleEventEmitter.emit('rule:matched', eventPayload);
    }
  }
};

module.exports = {
  processTelemetry,
  ruleEventEmitter,
};
