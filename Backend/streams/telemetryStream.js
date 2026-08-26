const { Subject } = require('rxjs');

/**
 * RxJS Subject acting as the central bridge between incoming telemetry sources
 * (Socket.IO / Telemetry Simulator / REST API) and RxJS stream consumers (Rule Engine).
 */
const telemetrySubject = new Subject();

/**
 * Read-only Observable exposed to downstream consumers (e.g., Rule Engine).
 * Downstream modules should subscribe to this and must not be able to call next()/error()/complete().
 */
const telemetry$ = telemetrySubject.asObservable();

/**
 * Validates basic structure of incoming telemetry before pushing into the RxJS stream.
 * Prevents malformed or invalid packets from breaking the RxJS pipeline.
 *
 * Required fields:
 *  - sensorId: non-empty string
 *  - timestamp: valid date or ISO string
 *  - telemetry object itself must be a valid non-null object
 *
 * @param {*} data - Raw incoming telemetry packet
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

  // Format timestamp to standard ISO string if it's a Date object
  let formattedTimestamp;
  try {
    formattedTimestamp = timestamp instanceof Date
      ? timestamp.toISOString()
      : typeof timestamp === 'string'
        ? timestamp
        : new Date(timestamp).toISOString();
  } catch (err) {
    return { isValid: false, error: 'Invalid timestamp format' };
  }

  // Consistent normalized telemetry payload
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
 * Pushes incoming telemetry event into the RxJS stream.
 * Performs validation first. If invalid, logs a validation warning and skips emitting.
 *
 * @param {object} data - Incoming telemetry payload
 * @returns {boolean} - true if pushed successfully, false if validation failed
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

module.exports = {
  telemetry$,
  pushTelemetry,
  validateStreamTelemetry,
  _telemetrySubject: telemetrySubject, // exposed for testing harness / reset if needed
};
