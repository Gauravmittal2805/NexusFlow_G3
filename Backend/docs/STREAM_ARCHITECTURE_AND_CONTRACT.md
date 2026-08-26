# NexusFlow RxJS Telemetry Stream Architecture & Contract

## 1. Overview & Encapsulation (Step 1)

The backend provides a clean, reactive RxJS bridge connecting incoming telemetry sources (Telemetry Simulator, Socket.IO, REST ingestion) to downstream consumers (Rule Engine, Analytics, Alerting):

```
Incoming Telemetry (Simulator / REST)
       │
 pushTelemetry(data)
       │
       ▼
telemetrySubject  (RxJS Subject - Encapsulated / Private)
       │
       ▼
  telemetry$     (Read-Only Observable)
       │
 ┌─────┴────────────────────────┐
 │                              │
 ▼                              ▼
Member 2 Rule Engine     Analytics & Test Observers
```

- **Location:** [`Backend/streams/telemetryStream.js`](file:///e:/Infotact/NexusFlow_G3/Backend/streams/telemetryStream.js)
- **Module Interface:** Exports `telemetry$` as a read-only `Observable` (`Subject.asObservable()`).
- **Encapsulation:** Downstream modules can only `.subscribe()` and `.pipe()`. Direct mutation via `.next()`, `.error()`, or `.complete()` is strictly prevented.

---

## 2. Sensor-Based Filtering (Step 2)

Allows any rule or consumer to filter incoming data by sensor without mutating the global stream:

```javascript
const { telemetry$, filterBySensor, createSensorStream } = require('../streams/telemetryStream');

// Option A: Using custom operator
const turbine1$ = telemetry$.pipe(filterBySensor('TURBINE-001'));

// Option B: Using factory helper
const turbine2$ = createSensorStream('TURBINE-002');
```

---

## 3. Telemetry Field Selection (Step 3)

Allows rules to isolate individual metric fields (`temperature`, `pressure`, `humidity`, `rpm`) or retain the complete telemetry payload alongside the extracted value:

```javascript
const { telemetry$, selectField } = require('../streams/telemetryStream');

// Extract scalar value only (e.g. 82.4)
telemetry$.pipe(selectField('temperature')).subscribe(temp => console.log('Temp:', temp));

// Extract value with full telemetry object retained
telemetry$.pipe(selectField('temperature', true)).subscribe(({ value, field, telemetry }) => {
  console.log(`${field} is ${value}`, telemetry);
});
```

---

## 4. Reusable RxJS Operators (Step 4)

Prepared standard operators and custom pipes for stream composition:

```javascript
const { telemetry$, rxOperators } = require('../streams/telemetryStream');
const { filter, map, tap, catchError } = rxOperators;

telemetry$
  .pipe(
    filter(t => t.temperature > 80),
    tap(t => console.log('High temperature detected:', t.sensorId)),
    map(t => ({ sensorId: t.sensorId, alert: 'OVERHEAT', temp: t.temperature }))
  )
  .subscribe(result => {
    // Process rule trigger
  });
```

---

## 5. Input Validation & Error Drops (Step 5)

Every packet passing through `pushTelemetry(data)` is validated before emission into `telemetry$`:
- Must be a non-null, non-array object.
- Must contain a valid, non-empty `sensorId` string (e.g. `TURBINE-001`).
- Must contain a valid date / timestamp.

Invalid or malformed packets are dropped with a clear console warning. The underlying stream never dies and continues processing valid packets immediately.

---

## 6. Resilient Error Isolation Across Rules (Step 6)

An unhandled error thrown inside one rule's subscriber or operator pipeline **does not terminate** the main stream or affect other rules:

```javascript
const { telemetry$, isolateErrors } = require('../streams/telemetryStream');

// Rule 1 pipeline with error isolation
telemetry$
  .pipe(
    map(t => dangerousTransform(t)),
    isolateErrors('Rule 1')
  )
  .subscribe({ next: t => executeAction(t) });
```

---

## 7. Stream Payload Contract for Member 2 (Step 10)

Member 2's Rule Compiler / Executor can subscribe to `telemetry$` and expect the following exact JSON shape:

```json
{
  "sensorId": "TURBINE-001",
  "timestamp": "2026-08-25T10:30:00.000Z",
  "temperature": 82.4,
  "pressure": 121,
  "humidity": 43,
  "rpm": 1840,
  "status": "WARNING"
}
```

### Message for Member 2:
> *"The telemetry stream is ready. Your compiler/rule executor can subscribe to `telemetry$` from `streams/telemetryStream.js` and apply its RxJS operators."*

---

## 8. Dual Dispatch & Coordination with Member 4 (Step 11)

Member 4 consumes the real-time stream via Socket.IO for the live React dashboard. NexusFlow uses a non-blocking dual-dispatch architecture:

```
                      Telemetry Reading
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
    Socket.IO Broadcast                  RxJS Stream
   (telemetry:update)                   (telemetry$)
            │                                 │
            ▼                                 ▼
   Member 4 React Dashboard           Member 2 Rule Engine
```

---

## 9. Reconnection & Lifecycle Management (Step 12 & 13)

To avoid memory leaks and phantom rule execution in long-running processes:
- `subscriptionRegistry.register(id, subscription)` stores and automatically replaces stale subscriptions.
- `subscriptionRegistry.unsubscribe(id)` cleanly terminates subscriptions when a rule or client disconnects.
- `subscriptionRegistry.unsubscribeAll()` handles graceful server shutdown.