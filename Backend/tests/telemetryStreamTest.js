/**
 * Test Suite: RxJS Telemetry Stream Verification (Steps 1–11)
 *
 * Verifies:
 * - Step 5 & 7: RxJS Subject / Read-only Observable structure
 * - Step 8: Stream validation & error isolation (malformed data doesn't break stream)
 * - Step 9: Single temporary subscriber reception
 * - Step 10: Continuous telemetry stream sequence
 * - Step 11: Multi-sensor stream concurrency (TURBINE-001, 002, 003)
 */

const { telemetry$, pushTelemetry, validateStreamTelemetry } = require('../streams/telemetryStream');

async function runTelemetryStreamTests() {
  console.log('====================================================');
  console.log('   NEXUSFLOW TELEMETRY STREAM TEST SUITE (RxJS)     ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Verify telemetry$ is a read-only Observable (Step 7)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Test 1: Observable Interface Verification ---');
  assert(typeof telemetry$.subscribe === 'function', 'telemetry$ exposes .subscribe()');
  assert(typeof telemetry$.pipe === 'function', 'telemetry$ exposes .pipe()');
  assert(telemetry$.next === undefined, 'telemetry$ does NOT expose .next() directly (read-only)');
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Validation of malformed packets (Step 8)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Test 2: Stream Validation & Error Isolation ---');
  const invalidCases = [
    { data: null, label: 'null data' },
    { data: undefined, label: 'undefined data' },
    { data: 'string instead of object', label: 'string data' },
    { data: { timestamp: new Date() }, label: 'missing sensorId' },
    { data: { sensorId: '', timestamp: new Date() }, label: 'empty string sensorId' },
    { data: { sensorId: '   ', timestamp: new Date() }, label: 'whitespace sensorId' },
    { data: { sensorId: 'TURBINE-001' }, label: 'missing timestamp' },
  ];

  for (const { data, label } of invalidCases) {
    const pushed = pushTelemetry(data);
    assert(pushed === false, `Malformed packet rejected (${label})`);
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Temporary Subscriber Reception (Step 9)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Test 3: Temporary Subscriber Reception (Step 9) ---');
  await new Promise((resolve) => {
    const sampleTelemetry = {
      sensorId: 'TURBINE-001',
      timestamp: '2026-08-25T10:30:00.000Z',
      temperature: 82.4,
      pressure: 121,
      humidity: 43,
      rpm: 1840,
    };

    let received = null;
    const subscription = telemetry$.subscribe({
      next: (data) => {
        received = data;
        console.log('  [Subscriber Log] Received Telemetry:');
        console.log(JSON.stringify(data, null, 2));
      },
    });

    const success = pushTelemetry(sampleTelemetry);
    assert(success === true, 'pushTelemetry returns true for valid payload');
    assert(received !== null, 'Subscriber received the telemetry packet');
    assert(received?.sensorId === 'TURBINE-001', 'sensorId matches TURBINE-001');
    assert(received?.temperature === 82.4, 'temperature matches 82.4');
    assert(received?.pressure === 121, 'pressure matches 121');
    assert(received?.humidity === 43, 'humidity matches 43');
    assert(received?.rpm === 1840, 'rpm matches 1840');

    subscription.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Continuous Stream Sequence (Step 10)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Test 4: Continuous Stream Sequence (Step 10) ---');
  await new Promise((resolve) => {
    const tempSequence = [82.1, 82.4, 81.9, 83.2, 84.0, 84.8, 85.1];
    const receivedTemps = [];

    const subscription = telemetry$.subscribe({
      next: (telemetry) => {
        receivedTemps.push(telemetry.temperature);
      },
    });

    for (let i = 0; i < tempSequence.length; i++) {
      pushTelemetry({
        sensorId: 'TURBINE-001',
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        temperature: tempSequence[i],
        pressure: 120 + i,
        humidity: 45,
        rpm: 1800 + i * 10,
      });
    }

    assert(receivedTemps.length === tempSequence.length, `All ${tempSequence.length} events received`);
    assert(
      JSON.stringify(receivedTemps) === JSON.stringify(tempSequence),
      'All temperature readings received in exact continuous order: ' + receivedTemps.join(', ')
    );

    subscription.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Multi-Sensor Stream Concurrency (Step 11)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Test 5: Multi-Sensor Concurrency (Step 11) ---');
  await new Promise((resolve) => {
    const multiSensorPackets = [
      { sensorId: 'TURBINE-001', temperature: 72.5, pressure: 120, humidity: 43, rpm: 1800, timestamp: new Date() },
      { sensorId: 'TURBINE-002', temperature: 68.9, pressure: 115, humidity: 51, rpm: 1740, timestamp: new Date() },
      { sensorId: 'TURBINE-003', temperature: 75.8, pressure: 125, humidity: 38, rpm: 1860, timestamp: new Date() },
      { sensorId: 'TURBINE-001', temperature: 73.1, pressure: 121, humidity: 42, rpm: 1810, timestamp: new Date() },
      { sensorId: 'TURBINE-002', temperature: 69.4, pressure: 116, humidity: 50, rpm: 1750, timestamp: new Date() },
      { sensorId: 'TURBINE-003', temperature: 76.2, pressure: 126, humidity: 37, rpm: 1870, timestamp: new Date() },
    ];

    const sensorCounts = { 'TURBINE-001': 0, 'TURBINE-002': 0, 'TURBINE-003': 0 };

    const subscription = telemetry$.subscribe({
      next: (telemetry) => {
        if (sensorCounts[telemetry.sensorId] !== undefined) {
          sensorCounts[telemetry.sensorId]++;
        }
      },
    });

    for (const packet of multiSensorPackets) {
      pushTelemetry(packet);
    }

    assert(sensorCounts['TURBINE-001'] === 2, 'Stream transported TURBINE-001 packets (2)');
    assert(sensorCounts['TURBINE-002'] === 2, 'Stream transported TURBINE-002 packets (2)');
    assert(sensorCounts['TURBINE-003'] === 2, 'Stream transported TURBINE-003 packets (2)');

    subscription.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────
  console.log('====================================================');
  console.log(` TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTelemetryStreamTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
