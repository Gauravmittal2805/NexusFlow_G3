const { Subject } = require('rxjs');
const { filter, map, tap, catchError, share, takeUntil } = require('rxjs/operators');

/**
 * ============================================================================
 * NEXUSFLOW TELEMETRY STREAM (RxJS Pipeline)
 * ============================================================================
 * Central reactive bridge connecting incoming telemetry sources (Simulator /
 * Socket.IO / REST API) to downstream consumers (Rule Engine / Analytics).
 *
 * Architecture:
 * ┌─────────────────────────┐
 * │   Incoming Telemetry    │ (Simulator / REST API)
 * └────────────┬────────────┘
 *              │
 *       pushTelemetry()
 *              │
 *              ▼
 *      telemetrySubject (RxJS Subject - Private)
 *              │
 *              ▼
 *          telemetry$ (Read-Only Observable)
 *              │
 *       ┌──────┴──────┐
 *       ▼             ▼
 *  [Filter/Map]  [Subscribers] (Member 2 Rule Engine / Test Observers)
 * ============================================================================
 */

// ─── Step 1: Central RxJS Subject & Read-Only Observable ─────────────────────

/**
 * Underlying Subject holding the reactive telemetry pipeline.
 * Private to this module — downstream consumers interact exclusively via `telemetry$`.
 */
const telemetrySubject = new Subject();

/**
 * Read-only Observable exposed to backend consumers (e.g. Member 2 Rule Engine).
 * Downstream modules can safely .pipe() and .subscribe() without accessing .next() / .error().
 */
const telemetry$ = telemetrySubject.asObservable();

// ─── Step 5: Input Validation & Sanitization ─────────────────────────────────

/**
 * Validates the structure of incoming telemetry packets before injection.
 * Enforces mandatory fields:
 *  1. Non-null, non-array object
 *  2. sensorId (non-empty string, e.g., 'TURBINE-001')
 *  3. timestamp (valid Date object or parseable date string)
 *
 * @param {*} data - Incoming raw packet
 * @returns {{ isValid: boolean, error?: string, sanitizedData?: object }}
 */
function validateStreamTelemetry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { isValid: false, error: 'Telemetry data must be a valid non-null object' };
  }

  const { sensorId, timestamp } = data;

  if (!sensorId || typeof sensorId !== 'string' || sensorId.trim() === '') {
    return { isValid: false, error: 'Telemetry data missing valid sensorId string' };
  }

  if (!timestamp) {
    return { isValid: false, error: 'Telemetry data missing timestamp' };
  }

  // Format timestamp to standard ISO string
  let formattedTimestamp;
  try {
    formattedTimestamp = timestamp instanceof Date
      ? timestamp.toISOString()
      : typeof timestamp === 'string'
        ? timestamp
        : new Date(timestamp).toISOString();
    
    // Check for invalid date
    if (isNaN(new Date(formattedTimestamp).getTime())) {
      return { isValid: false, error: 'Timestamp is not a valid date' };
    }
  } catch (err) {
    return { isValid: false, error: 'Invalid timestamp format' };
  }

  // Build sanitized, strongly-typed telemetry reading
  const sanitizedData = {
    sensorId: sensorId.trim(),
    timestamp: formattedTimestamp,
    temperature: typeof data.temperature === 'number' && !isNaN(data.temperature) ? Number(data.temperature) : data.temperature,
    pressure: typeof data.pressure === 'number' && !isNaN(data.pressure) ? Number(data.pressure) : data.pressure,
    humidity: typeof data.humidity === 'number' && !isNaN(data.humidity) ? Number(data.humidity) : data.humidity,
    rpm: typeof data.rpm === 'number' && !isNaN(data.rpm) ? Number(data.rpm) : data.rpm,
    ...(data.status ? { status: data.status } : {}),
  };

  return { isValid: true, sanitizedData };
}

/**
 * Pushes incoming telemetry event into the RxJS Subject after passing validation.
 * Malformed packets are safely dropped without throwing or killing the stream.
 *
 * @param {object} data - Incoming telemetry payload
 * @returns {boolean} - true if accepted and emitted, false if dropped
 */
function pushTelemetry(data) {
  const validation = validateStreamTelemetry(data);

  if (!validation.isValid) {
    console.warn(`[TelemetryStream] Validation error: ${validation.error}. Dropping malformed packet:`, data);
    return false;
  }

  telemetrySubject.next(validation.sanitizedData);
  return true;
}

// ─── Step 2: Sensor-Based Filtering Operators & Helpers ──────────────────────

/**
 * Custom RxJS operator function to filter telemetry by specific sensorId.
 * Does not mutate or lock the global telemetry$ stream.
 *
 * Usage:
 *   telemetry$.pipe(filterBySensor('TURBINE-001'))
 *
 * @param {string} sensorId - Target sensor identifier (e.g. 'TURBINE-001')
 * @returns {import('rxjs').MonoTypeOperatorFunction<object>}
 */
function filterBySensor(sensorId) {
  return filter((telemetry) => Boolean(telemetry && telemetry.sensorId === sensorId));
}

/**
 * Helper to obtain a pre-filtered Observable stream for a specific sensor.
 *
 * @param {string} sensorId - Target sensor identifier
 * @returns {import('rxjs').Observable<object>}
 */
function createSensorStream(sensorId) {
  return telemetry$.pipe(filterBySensor(sensorId));
}

// ─── Step 3: Telemetry Field Selection Operators ─────────────────────────────

/**
 * Custom RxJS operator function to select a specific telemetry metric.
 * Supports:
 *  - Extracting the raw field value (e.g. temperature -> 82.4)
 *  - Or extracting the value while retaining the entire telemetry context object
 *
 * Usage:
 *   telemetry$.pipe(selectField('temperature'))               // emits 82.4
 *   telemetry$.pipe(selectField('temperature', true))         // emits { value: 82.4, field: 'temperature', telemetry: {...} }
 *
 * @param {string} fieldName - Telemetry property key ('temperature' | 'pressure' | 'humidity' | 'rpm')
 * @param {boolean} [retainFullObject=false] - Whether to include the full telemetry object in the emission
 * @returns {import('rxjs').OperatorFunction<object, any>}
 */
function selectField(fieldName, retainFullObject = false) {
  return map((telemetry) => {
    if (!telemetry) return undefined;
    const value = telemetry[fieldName];
    if (retainFullObject) {
      return {
        field: fieldName,
        value,
        sensorId: telemetry.sensorId,
        timestamp: telemetry.timestamp,
        telemetry,
      };
    }
    return value;
  });
}

// ─── Step 4 & 6: Resilient Error Isolation Operator ─────────────────────────

/**
 * Custom RxJS operator to isolate errors within a specific rule or subscriber pipeline.
 * Catches any synchronous or operator-thrown errors so the parent stream is never terminated.
 *
 * @param {string} [consumerName='Consumer'] - Identifier for logging
 * @param {Function} [fallbackHandler] - Optional fallback error callback
 * @returns {import('rxjs').MonoTypeOperatorFunction<any>}
 */
function isolateErrors(consumerName = 'Consumer', fallbackHandler = null) {
  return catchError((err, source$) => {
    console.error(`[TelemetryStream] Error caught in subscriber '${consumerName}':`, err.message || err);
    if (typeof fallbackHandler === 'function') {
      try {
        fallbackHandler(err);
      } catch (cbErr) {
        console.error(`[TelemetryStream] Error in fallback handler:`, cbErr.message);
      }
    }
    // Return source$ to keep the stream alive for subsequent emissions
    return source$;
  });
}

// ─── Step 13: Subscription Lifecycle Registry (Cleanup & Leak Prevention) ───

/**
 * In-memory registry to track active rule subscriptions and ensure clean teardown.
 */
class SubscriptionRegistry {
  constructor() {
    this.subscriptions = new Map();
  }

  /**
   * Register a subscription under a given ID (e.g. ruleId or client subscriber ID).
   * Automatically unsubscribes any existing subscription with the same ID first.
   *
   * @param {string} id - Unique identifier
   * @param {import('rxjs').Subscription} subscription - RxJS subscription instance
   */
  register(id, subscription) {
    if (this.subscriptions.has(id)) {
      this.unsubscribe(id);
    }
    this.subscriptions.set(id, subscription);
  }

  /**
   * Unsubscribe and remove a registered subscription.
   *
   * @param {string} id - Identifier of the subscription to clean up
   * @returns {boolean} - true if found and cleaned up
   */
  unsubscribe(id) {
    const sub = this.subscriptions.get(id);
    if (sub) {
      if (typeof sub.unsubscribe === 'function') {
        sub.unsubscribe();
      }
      this.subscriptions.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get the active count of registered subscriptions.
   * @returns {number}
   */
  get activeCount() {
    return this.subscriptions.size;
  }

  /**
   * Clear and unsubscribe all registered subscriptions.
   */
  unsubscribeAll() {
    for (const [id, sub] of this.subscriptions.entries()) {
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe();
      }
    }
    this.subscriptions.clear();
  }
}

const subscriptionRegistry = new SubscriptionRegistry();

// ─── Module Exports ──────────────────────────────────────────────────────────

module.exports = {
  // Step 1: Main Stream Interfaces
  telemetry$,
  pushTelemetry,
  validateStreamTelemetry,

  // Step 2 & 3: Stream Modifiers & Helpers
  filterBySensor,
  createSensorStream,
  selectField,

  // Step 4 & 6: Error Isolation
  isolateErrors,

  // Step 13: Subscription Lifecycle Management
  SubscriptionRegistry,
  subscriptionRegistry,

  // Standard RxJS operators for Member 2 convenience
  rxOperators: {
    filter,
    map,
    tap,
    catchError,
    share,
    takeUntil,
  },

  // Internal Subject reference for test harness reset if needed
  _telemetrySubject: telemetrySubject,
};
