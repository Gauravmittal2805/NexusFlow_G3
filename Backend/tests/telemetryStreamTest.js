/**
 * Test Suite: Complete 13-Step RxJS Telemetry Stream Verification
 *
 * Verifies all 13 steps required:
 *  - Step 1: Verify telemetry$ read-only Observable encapsulation
 *  - Step 2: Sensor-based filtering (TURBINE-001, TURBINE-002, TURBINE-003)
 *  - Step 3: Telemetry field selection (scalar metric vs retained full object)
 *  - Step 4: Basic RxJS operators (filter, map, tap)
 *  - Step 5: Handling invalid telemetry & malformed packet rejection
 *  - Step 6: Error handling & isolation across independent rules
 *  - Step 7: Multiple concurrent subscribers (Subscriber A, B, C)
 *  - Step 8: Multi-sensor concurrency & sensor-filtered stream verification
 *  - Step 9: Continuous telemetry stream sequence
 *  - Step 10: Contract coordination with Member 2 (Rule Compiler)
 *  - Step 11: Coexistence with Member 4 (Socket.IO React Dashboard)
 *  - Step 12: Reconnection testing without duplicate subscriptions
 *  - Step 13: Subscription cleanup and memory leak prevention
 */

const {
  telemetry$,
  pushTelemetry,
  validateStreamTelemetry,
  filterBySensor,
  createSensorStream,
  selectField,
  isolateErrors,
  subscriptionRegistry,
  rxOperators,
} = require('../streams/telemetryStream');

const { filter, map, tap, catchError } = rxOperators;

async function runTelemetryStreamTests() {
  console.log('================================================================');
  console.log('   NEXUSFLOW TELEMETRY STREAM — COMPLETE 13-STEP VERIFICATION   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, stepNum, details = '') {
    if (condition) {
      console.log(`  ✅ PASS [Step ${stepNum}]: ${details}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [Step ${stepNum}]: ${details}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // STEP 1: Verify telemetry$ Observable Encapsulation
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 1: Verify telemetry$ Encapsulation & Read-Only Access ---');
  assert(typeof telemetry$.subscribe === 'function', '1', 'telemetry$ exposes .subscribe()');
  assert(typeof telemetry$.pipe === 'function', '1', 'telemetry$ exposes .pipe() for operator composition');
  assert(telemetry$.next === undefined, '1', 'telemetry$ does NOT expose .next() (underlying Subject is private)');
  assert(telemetry$.error === undefined, '1', 'telemetry$ does NOT expose .error() directly');
  assert(telemetry$.complete === undefined, '1', 'telemetry$ does NOT expose .complete() directly');
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 2: Sensor-Based Filtering (TURBINE-001, 002, 003)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 2: Sensor-Based Filtering ---');
  await new Promise((resolve) => {
    const turbine1Events = [];
    const turbine2Events = [];

    // Filtered sub-streams
    const sub1 = createSensorStream('TURBINE-001').subscribe((t) => turbine1Events.push(t));
    const sub2 = telemetry$.pipe(filterBySensor('TURBINE-002')).subscribe((t) => turbine2Events.push(t));

    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 81.2 });
    pushTelemetry({ sensorId: 'TURBINE-002', timestamp: new Date(), temperature: 69.5 });
    pushTelemetry({ sensorId: 'TURBINE-003', timestamp: new Date(), temperature: 74.0 });
    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 83.1 });

    assert(turbine1Events.length === 2, '2', 'TURBINE-001 sub-stream received exactly 2 matching events');
    assert(turbine1Events.every((e) => e.sensorId === 'TURBINE-001'), '2', 'All TURBINE-001 events have sensorId === "TURBINE-001"');
    assert(turbine2Events.length === 1, '2', 'TURBINE-002 sub-stream received exactly 1 matching event');
    assert(turbine2Events[0].sensorId === 'TURBINE-002', '2', 'TURBINE-002 event has sensorId === "TURBINE-002"');

    sub1.unsubscribe();
    sub2.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 3: Telemetry Field Selection
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 3: Telemetry Field Selection ---');
  await new Promise((resolve) => {
    const rawTemps = [];
    const detailedTemps = [];

    const subRaw = telemetry$.pipe(selectField('temperature')).subscribe((temp) => rawTemps.push(temp));
    const subFull = telemetry$.pipe(selectField('temperature', true)).subscribe((res) => detailedTemps.push(res));

    pushTelemetry({
      sensorId: 'TURBINE-001',
      timestamp: new Date(),
      temperature: 84.5,
      pressure: 122,
      humidity: 44,
      rpm: 1820,
    });

    assert(rawTemps.length === 1 && rawTemps[0] === 84.5, '3', 'selectField() extracted raw scalar temperature: 84.5');
    assert(detailedTemps.length === 1, '3', 'selectField(..., true) emitted enriched telemetry object');
    assert(detailedTemps[0].value === 84.5, '3', 'Enriched object contains correct field value: 84.5');
    assert(detailedTemps[0].telemetry.sensorId === 'TURBINE-001', '3', 'Full telemetry object retained in enriched emission');

    subRaw.unsubscribe();
    subFull.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 4: Basic RxJS Operators (filter, map, tap)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 4: Basic RxJS Operators (filter, map, tap) ---');
  await new Promise((resolve) => {
    const tappedReadings = [];
    const transformedOutputs = [];

    // Pipeline: filter(temp > 80) -> tap(log/side-effect) -> map(convert to status object)
    const pipelineSub = telemetry$
      .pipe(
        filter((t) => t.temperature > 80),
        tap((t) => tappedReadings.push(t)),
        map((t) => ({ sensorId: t.sensorId, alertLevel: 'HIGH', temp: t.temperature }))
      )
      .subscribe((output) => transformedOutputs.push(output));

    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 75.0, pressure: 110 });
    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 86.5, pressure: 128 });
    pushTelemetry({ sensorId: 'TURBINE-002', timestamp: new Date(), temperature: 82.0, pressure: 120 });

    assert(tappedReadings.length === 2, '4', 'tap() received 2 filtered items (> 80°F)');
    assert(transformedOutputs.length === 2, '4', 'map() transformed 2 items into alertLevel objects');
    assert(transformedOutputs[0].alertLevel === 'HIGH' && transformedOutputs[0].temp === 86.5, '4', 'First transformed item matches expected format');

    pipelineSub.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 5: Handling Invalid Telemetry
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 5: Handling Invalid Telemetry ---');
  const invalidTests = [
    { data: null, desc: 'null payload' },
    { data: undefined, desc: 'undefined payload' },
    { data: 'not an object', desc: 'primitive string payload' },
    { data: [], desc: 'array payload' },
    { data: { temperature: 80 }, desc: 'missing sensorId' },
    { data: { sensorId: '', timestamp: new Date() }, desc: 'empty string sensorId' },
    { data: { sensorId: '   ', timestamp: new Date() }, desc: 'whitespace sensorId' },
    { data: { sensorId: 'TURBINE-001' }, desc: 'missing timestamp' },
    { data: { sensorId: 'TURBINE-001', timestamp: 'invalid-date-xyz' }, desc: 'unparseable timestamp' },
  ];

  for (const { data, desc } of invalidTests) {
    const pushed = pushTelemetry(data);
    assert(pushed === false, '5', `Rejected invalid packet: ${desc}`);
  }

  // Verify stream still operates normally after invalid packets
  let validPacketReceived = false;
  const healthSub = telemetry$.subscribe(() => {
    validPacketReceived = true;
  });
  pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 80.0 });
  assert(validPacketReceived === true, '5', 'Stream resumes seamlessly on next valid packet');
  healthSub.unsubscribe();
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 6: Error Isolation Across Rules
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 6: Error Isolation Across Rules ---');
  await new Promise((resolve) => {
    let rule1Received = 0;
    let rule2Received = 0;
    let rule3Received = 0;
    let errorCaught = false;

    // Rule 1: Throws an error on temp >= 85
    const rule1Sub = telemetry$
      .pipe(
        map((t) => {
          if (t.temperature >= 85) {
            throw new Error('Simulated runtime error in Rule 1 pipeline!');
          }
          return t;
        }),
        isolateErrors('Rule 1', () => {
          errorCaught = true;
        })
      )
      .subscribe({
        next: () => {
          rule1Received++;
        },
      });

    // Rule 2: Normal subscriber
    const rule2Sub = telemetry$.subscribe(() => {
      rule2Received++;
    });

    // Rule 3: Normal subscriber
    const rule3Sub = telemetry$.subscribe(() => {
      rule3Received++;
    });

    // Emit packet that triggers error in Rule 1
    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 88.0 });
    // Emit another normal packet
    pushTelemetry({ sensorId: 'TURBINE-002', timestamp: new Date(), temperature: 72.0 });

    assert(errorCaught === true, '6', 'Error in Rule 1 was caught by isolateErrors operator');
    assert(rule2Received === 2, '6', 'Rule 2 received both packets uninterrupted');
    assert(rule3Received === 2, '6', 'Rule 3 received both packets uninterrupted');

    rule1Sub.unsubscribe();
    rule2Sub.unsubscribe();
    rule3Sub.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 7: Multiple Concurrent Subscribers
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 7: Multiple Concurrent Subscribers ---');
  await new Promise((resolve) => {
    let subAReceived = null;
    let subBReceived = null;
    let subCReceived = null;

    const subA = telemetry$.subscribe((t) => (subAReceived = t));
    const subB = telemetry$.subscribe((t) => (subBReceived = t));
    const subC = telemetry$.subscribe((t) => (subCReceived = t));

    pushTelemetry({
      sensorId: 'TURBINE-001',
      timestamp: new Date(),
      temperature: 82.4,
      pressure: 121,
      humidity: 43,
      rpm: 1840,
    });

    assert(subAReceived?.temperature === 82.4, '7', 'Subscriber A received TURBINE-001 -> 82.4°F');
    assert(subBReceived?.temperature === 82.4, '7', 'Subscriber B received TURBINE-001 -> 82.4°F');
    assert(subCReceived?.temperature === 82.4, '7', 'Subscriber C received TURBINE-001 -> 82.4°F');
    assert(
      subAReceived?.rpm === subBReceived?.rpm && subBReceived?.rpm === subCReceived?.rpm,
      '7',
      'All 3 subscribers received identical packet payload concurrently'
    );

    subA.unsubscribe();
    subB.unsubscribe();
    subC.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 8: Multiple Sensors & Sensor-Specific Filtering
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 8: Multi-Sensor Routing & Specific Filtering ---');
  await new Promise((resolve) => {
    const allEvents = [];
    const turbine1Events = [];

    const globalSub = telemetry$.subscribe((t) => allEvents.push(t));
    const turbine1Sub = createSensorStream('TURBINE-001').subscribe((t) => turbine1Events.push(t));

    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 82.0 });
    pushTelemetry({ sensorId: 'TURBINE-002', timestamp: new Date(), temperature: 71.0 });
    pushTelemetry({ sensorId: 'TURBINE-003', timestamp: new Date(), temperature: 90.0 });

    assert(allEvents.length === 3, '8', 'Main stream received readings from all 3 sensors');
    assert(turbine1Events.length === 1, '8', 'Filtered stream received only TURBINE-001 reading');
    assert(turbine1Events[0].temperature === 82.0, '8', 'Filtered TURBINE-001 reading has temperature 82.0°F');

    globalSub.unsubscribe();
    turbine1Sub.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 9: Continuous Telemetry Sequence
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 9: Continuous Telemetry Stream Sequence ---');
  await new Promise((resolve) => {
    const sequence = [82.1, 82.4, 81.9, 83.2, 84.0];
    const receivedTemps = [];

    const seqSub = telemetry$.subscribe((t) => receivedTemps.push(t.temperature));

    for (const temp of sequence) {
      pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: temp });
    }

    assert(
      JSON.stringify(receivedTemps) === JSON.stringify(sequence),
      '9',
      `Sequential readings received in exact order: ${receivedTemps.join(', ')}`
    );

    seqSub.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 10: Contract Coordination for Member 2 (Rule Compiler)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 10: Member 2 Contract Verification ---');
  await new Promise((resolve) => {
    let capturedPacket = null;
    const testContractSub = telemetry$.subscribe((packet) => {
      capturedPacket = packet;
    });

    const standardPayload = {
      sensorId: 'TURBINE-001',
      timestamp: '2026-08-25T10:30:00.000Z',
      temperature: 82.4,
      pressure: 121,
      humidity: 43,
      rpm: 1840,
    };

    pushTelemetry(standardPayload);

    assert(typeof capturedPacket.sensorId === 'string', '10', 'Contract: sensorId is a string');
    assert(typeof capturedPacket.timestamp === 'string', '10', 'Contract: timestamp is an ISO string');
    assert(typeof capturedPacket.temperature === 'number', '10', 'Contract: temperature is a number');
    assert(typeof capturedPacket.pressure === 'number', '10', 'Contract: pressure is a number');
    assert(typeof capturedPacket.humidity === 'number', '10', 'Contract: humidity is a number');
    assert(typeof capturedPacket.rpm === 'number', '10', 'Contract: rpm is a number');

    testContractSub.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 11: Member 4 Coexistence (Socket.IO + RxJS Dual Dispatch)
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 11: Member 4 Coexistence (Dual Dispatch) ---');
  await new Promise((resolve) => {
    let rxjsReceived = false;
    let socketSimulatedReceived = false;

    // Simulated Socket.IO listener (Member 4 Dashboard)
    const simulatedSocketEmit = (event, data) => {
      if (event === 'telemetry:update') {
        socketSimulatedReceived = true;
      }
    };

    // RxJS subscriber (Member 2 Rule Engine)
    const ruleEngineSub = telemetry$.subscribe(() => {
      rxjsReceived = true;
    });

    // Dual dispatch simulation as in telemetryService.js & telemetrySimulator.js
    const samplePayload = {
      sensorId: 'TURBINE-001',
      timestamp: new Date().toISOString(),
      temperature: 82.4,
      pressure: 121,
      humidity: 43,
      rpm: 1840,
    };

    // 1. Emit to Socket.IO
    simulatedSocketEmit('telemetry:update', samplePayload);
    // 2. Push to RxJS
    pushTelemetry(samplePayload);

    assert(socketSimulatedReceived === true, '11', 'Socket.IO event emitted for Member 4 Dashboard');
    assert(rxjsReceived === true, '11', 'RxJS stream received event for Member 2 Rule Engine');

    ruleEngineSub.unsubscribe();
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 12: Reconnection Simulation & Duplicate Prevention
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 12: Reconnection Testing & No Duplicate Subscriptions ---');
  await new Promise((resolve) => {
    let clientMessagesReceived = 0;

    // Client connects -> Subscribes
    const clientSubscriberId = 'CLIENT-DASHBOARD-SESSION-1';
    let clientSub = telemetry$.subscribe(() => {
      clientMessagesReceived++;
    });
    subscriptionRegistry.register(clientSubscriberId, clientSub);

    assert(subscriptionRegistry.activeCount === 1, '12', 'Initial client subscription registered (count=1)');

    // Emit 1 event while connected
    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 80.0 });
    assert(clientMessagesReceived === 1, '12', 'Client received 1 event while connected');

    // Client disconnects -> Unsubscribes
    subscriptionRegistry.unsubscribe(clientSubscriberId);
    assert(subscriptionRegistry.activeCount === 0, '12', 'Client unsubscribed on disconnect (count=0)');

    // Emit 1 event while disconnected -> Should NOT increment clientMessagesReceived
    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 81.0 });
    assert(clientMessagesReceived === 1, '12', 'No events received while disconnected');

    // Client reconnects -> Registers new subscription with same ID (replacing previous)
    clientSub = telemetry$.subscribe(() => {
      clientMessagesReceived++;
    });
    subscriptionRegistry.register(clientSubscriberId, clientSub);
    assert(subscriptionRegistry.activeCount === 1, '12', 'Reconnected without creating duplicate subscriptions (count=1)');

    // Emit 1 event while reconnected
    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 82.0 });
    assert(clientMessagesReceived === 2, '12', 'Telemetry resumes cleanly on reconnection');

    subscriptionRegistry.unsubscribe(clientSubscriberId);
    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // STEP 13: Subscription Cleanup & Memory Leak Prevention
  // ─────────────────────────────────────────────────────────────────
  console.log('--- Step 13: Subscription Cleanup & Leak Prevention ---');
  await new Promise((resolve) => {
    let ruleAExecutions = 0;
    let ruleBExecutions = 0;

    const subRuleA = telemetry$.subscribe(() => ruleAExecutions++);
    const subRuleB = telemetry$.subscribe(() => ruleBExecutions++);

    subscriptionRegistry.register('RULE-A', subRuleA);
    subscriptionRegistry.register('RULE-B', subRuleB);

    assert(subscriptionRegistry.activeCount === 2, '13', '2 active rule subscriptions registered');

    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 82.0 });
    assert(ruleAExecutions === 1 && ruleBExecutions === 1, '13', 'Both rules executed on packet');

    // Remove Rule A
    const removed = subscriptionRegistry.unsubscribe('RULE-A');
    assert(removed === true, '13', 'RULE-A subscription successfully unsubscribed and removed');
    assert(subscriptionRegistry.activeCount === 1, '13', 'Active subscription count reduced to 1');

    pushTelemetry({ sensorId: 'TURBINE-001', timestamp: new Date(), temperature: 83.0 });
    assert(ruleAExecutions === 1, '13', 'RULE-A did NOT execute after removal (no duplicate or phantom execution)');
    assert(ruleBExecutions === 2, '13', 'RULE-B continued executing normally');

    // Teardown all
    subscriptionRegistry.unsubscribeAll();
    assert(subscriptionRegistry.activeCount === 0, '13', 'All remaining subscriptions cleanly teardown on shutdown');

    resolve();
  });
  console.log();

  // ─────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────
  console.log('================================================================');
  console.log(` TEST RESULTS: ${passed} PASSED, ${failed} FAILED across all 13 Steps`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTelemetryStreamTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

