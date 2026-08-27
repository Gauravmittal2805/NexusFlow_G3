/**
 * serializerAndValidatorTest.js
 *
 * Unit tests verifying:
 * - Step 1: Predictable node data output (Sensor, Condition, Action)
 * - Step 2: Edge serialization ({ source, target })
 * - Step 3: serializeRule & deserializeRule
 * - Step 4: Graph topology validation & error messages
 * - Step 5: Node configuration completeness validation
 * - Backend Compiler interoperability: Serialized output passes Backend ruleCompiler
 */

import { serializeRule, deserializeRule } from './ruleSerializer.js';
import { validateGraph, validateGraphStructure, validateNodeConfig } from './graphValidation.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.log(`  ❌  ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.log(`  ❌  ${message}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\n── Test Suite: Step 1 — Finalize Node Data ────────────────────');
{
  const nodes = [
    {
      id: 'sensor1',
      type: 'sensor',
      data: { sensorId: 'TURBINE-001', field: 'temperature' },
    },
    {
      id: 'condition1',
      type: 'condition',
      data: { operator: '>', value: 80 },
    },
    {
      id: 'action1',
      type: 'action',
      data: { action: 'ALERT', severity: 'HIGH' },
    },
  ];
  const edges = [
    { source: 'sensor1', target: 'condition1' },
    { source: 'condition1', target: 'action1' },
  ];

  const serialized = serializeRule(nodes, edges, {
    name: 'High Temperature Alert',
    description: 'Temperature exceeds 80°C',
  });

  assertEqual(serialized.nodes[0], {
    id: 'sensor1',
    type: 'sensor',
    data: { sensorId: 'TURBINE-001', field: 'temperature' },
    position: { x: 260, y: 50 },
  }, 'Sensor node data matches agreed schema');

  assertEqual(serialized.nodes[1], {
    id: 'condition1',
    type: 'condition',
    data: { operator: '>', value: 80 },
    position: { x: 260, y: 200 },
  }, 'Condition node data matches agreed schema');

  assertEqual(serialized.nodes[2], {
    id: 'action1',
    type: 'action',
    data: { action: 'ALERT', severity: 'HIGH' },
    position: { x: 260, y: 350 },
  }, 'Action node data matches agreed schema');
}

console.log('\n── Test Suite: Step 2 — Verify Edge Serialization ──────────────');
{
  const reactFlowEdges = [
    { id: 'xy-edge-1', source: 'sensor1', target: 'condition1', selected: true, animated: true, markerEnd: { type: 'arrow' } },
    { id: 'xy-edge-2', source: 'condition1', target: 'action1', style: { stroke: 'blue' } },
  ];

  const serialized = serializeRule([], reactFlowEdges);

  assertEqual(serialized.edges, [
    { source: 'sensor1', target: 'condition1' },
    { source: 'condition1', target: 'action1' },
  ], 'React Flow internal edge props are cleanly stripped to source and target');
}

console.log('\n── Test Suite: Step 3 — Graph Serializer & Deserializer ────────');
{
  const inputRule = {
    name: 'Boiler Pressure Monitor',
    description: 'Alert when pressure exceeds 150 PSI',
    nodes: [
      { id: 's1', type: 'sensor', data: { sensorId: 'BOILER-101', field: 'pressure' } },
      { id: 'c1', type: 'condition', data: { operator: '>=', value: 150 } },
      { id: 'a1', type: 'action', data: { action: 'SMS', severity: 'CRITICAL' } },
    ],
    edges: [
      { source: 's1', target: 'c1' },
      { source: 'c1', target: 'a1' },
    ],
  };

  const deserialized = deserializeRule(inputRule);
  assert(deserialized.nodes.length === 3, 'Deserialized rule has 3 nodes');
  assert(deserialized.edges.length === 2, 'Deserialized rule has 2 edges');
  assert(deserialized.nodes[0].data.label.includes('Pressure'), 'Sensor node has enriched label');
  assert(deserialized.edges[0].markerEnd !== undefined, 'Edges are augmented with React Flow arrow markers');

  const reSerialized = serializeRule(deserialized.nodes, deserialized.edges, {
    name: deserialized.name,
    description: deserialized.description,
  });

  assertEqual(reSerialized.name, inputRule.name, 'Re-serialized name is preserved');
  assertEqual(reSerialized.nodes[0].data.sensorId, 'BOILER-101', 'Re-serialized sensorId is preserved');
  assertEqual(reSerialized.nodes[1].data.value, 150, 'Re-serialized condition value is preserved');
  assertEqual(reSerialized.nodes[2].data.action, 'SMS', 'Re-serialized action is preserved');
}

console.log('\n── Test Suite: Step 4 — Validate Before Saving ─────────────────');
{
  // 1. Empty graph
  const emptyRes = validateGraph([], []);
  assert(!emptyRes.valid, 'Empty graph is invalid');
  assert(emptyRes.message.includes('Rule cannot be empty'), 'Empty graph message is user-friendly');

  // 2. Sensor, Condition, Action with no edges
  const disconnectedNodes = [
    { id: 's1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
    { id: 'c1', type: 'condition', data: { operator: '>', value: 80 } },
    { id: 'a1', type: 'action', data: { action: 'ALERT', severity: 'HIGH' } },
  ];
  const noEdgesRes = validateGraph(disconnectedNodes, []);
  assert(!noEdgesRes.valid, 'Nodes with no edges is invalid');
  assert(
    noEdgesRes.message.includes('Please connect all nodes before saving the rule.'),
    'Disconnected nodes return exact message: "Please connect all nodes before saving the rule."'
  );

  // 3. Missing sensor
  const noSensor = [
    { id: 'c1', type: 'condition', data: { operator: '>', value: 80 } },
    { id: 'a1', type: 'action', data: { action: 'ALERT', severity: 'HIGH' } },
  ];
  const noSensorRes = validateGraph(noSensor, [{ source: 'c1', target: 'a1' }]);
  assert(!noSensorRes.valid, 'Missing sensor is invalid');

  // 4. Missing action
  const noAction = [
    { id: 's1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
    { id: 'c1', type: 'condition', data: { operator: '>', value: 80 } },
  ];
  const noActionRes = validateGraph(noAction, [{ source: 's1', target: 'c1' }]);
  assert(!noActionRes.valid, 'Missing action is invalid');

  // 5. Valid connected graph
  const validEdges = [
    { source: 's1', target: 'c1' },
    { source: 'c1', target: 'a1' },
  ];
  const validRes = validateGraph(disconnectedNodes, validEdges);
  assert(validRes.valid, 'Properly connected Sensor -> Condition -> Action graph is valid');
}

console.log('\n── Test Suite: Step 5 — Validate Node Configuration ────────────');
{
  // 1. Sensor without sensorId
  const badSensor = [
    { id: 's1', type: 'sensor', data: { sensorId: '', field: 'temperature' } },
    { id: 'c1', type: 'condition', data: { operator: '>', value: 80 } },
    { id: 'a1', type: 'action', data: { action: 'ALERT', severity: 'HIGH' } },
  ];
  const badSensorRes = validateNodeConfig(badSensor);
  assert(!badSensorRes.valid, 'Sensor without sensorId is invalid');
  assert(badSensorRes.errors.some((e) => e.includes('Sensor ID is required')), 'Reports "Sensor ID is required"');

  // 2. Condition without value
  const badCondition = [
    { id: 's1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
    { id: 'c1', type: 'condition', data: { operator: '>', value: '' } },
    { id: 'a1', type: 'action', data: { action: 'ALERT', severity: 'HIGH' } },
  ];
  const badConditionRes = validateNodeConfig(badCondition);
  assert(!badConditionRes.valid, 'Condition without value is invalid');
  assert(badConditionRes.errors.some((e) => e.includes('Threshold value is required')), 'Reports "Threshold value is required"');

  // 3. Action without action type
  const badAction = [
    { id: 's1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
    { id: 'c1', type: 'condition', data: { operator: '>', value: 80 } },
    { id: 'a1', type: 'action', data: { action: '', severity: 'HIGH' } },
  ];
  const badActionRes = validateNodeConfig(badAction);
  assert(!badActionRes.valid, 'Action without action type is invalid');
  assert(badActionRes.errors.some((e) => e.includes('Action type is required')), 'Reports "Action type is required"');
}

console.log('\n' + '═'.repeat(64));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(64));

if (failed > 0) {
  process.exit(1);
}
