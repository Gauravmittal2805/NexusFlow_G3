/**
 * telemetryStream.js
 *
 * The single shared RxJS Subject that acts as the live telemetry source
 * for all compiled rule pipelines.
 *
 * This IS "Member 1's telemetry$" (Step 1).
 *
 * Architecture
 * ────────────
 *
 *   telemetrySimulator / HTTP POST
 *           │
 *           ▼
 *   ruleEngineService.processTelemetry()
 *           │
 *           ▼  telemetryStream.push(data)          ← Step 2: feed point
 *   telemetry$  (Subject)
 *     │
 *     ├──► Rule 001 compiled pipeline  (filter → filter → tap)
 *     ├──► Rule 002 compiled pipeline
 *     └──► Rule 003 compiled pipeline
 *
 * Why a Subject and not a plain Observable?
 * ─────────────────────────────────────────
 *   An Observable is cold — it needs a producer function.
 *   A Subject is hot — it is both an Observable AND an Observer.
 *   We can call  telemetry$.next(data)  from anywhere in the backend
 *   and every subscribed rule pipeline receives the same emission
 *   simultaneously.  This is exactly how a shared telemetry bus works.
 *
 * Usage
 * ─────
 *   const { telemetry$, push } = require('./telemetryStream');
 *
 *   // Feed a reading (from ruleEngineService or simulator):
 *   push({ sensorId: 'TURBINE-001', temperature: 82.4, ... });
 *
 *   // Subscribe a pipeline (done by rxjsRuleEngine):
 *   telemetry$.pipe(filter(...), map(...)).subscribe(onMatch);
 *
 * Telemetry shape (Step 1 — confirmed with Member 1):
 *   {
 *     sensorId:    string,
 *     timestamp:   string | Date,
 *     temperature: number,
 *     pressure:    number,
 *     humidity:    number,
 *     rpm:         number
 *   }
 */

'use strict';

const { Subject } = require('rxjs');

/**
 * The live telemetry Observable/Observer.
 * All rule pipelines subscribe to this single instance.
 *
 * @type {import('rxjs').Subject<TelemetryReading>}
 */
const telemetry$ = new Subject();

/**
 * Push a single telemetry reading into the stream.
 * Called from ruleEngineService every time new telemetry arrives
 * (from the simulator or from an HTTP POST).
 *
 * @param {Object} data - Raw telemetry object
 *   { sensorId, timestamp, temperature, pressure, humidity, rpm }
 */
function push(data) {
  if (!data || typeof data !== 'object') return;
  telemetry$.next(data);
}

/**
 * Complete the Subject — call only during graceful server shutdown.
 * After this, no more emissions are possible and all subscriptions
 * will automatically close.
 */
function complete() {
  telemetry$.complete();
}

module.exports = {
  telemetry$,
  push,
  complete,
};
