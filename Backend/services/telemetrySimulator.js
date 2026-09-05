const Telemetry = require('../models/Telemetry');
const { getIo } = require('../websocket/telemetrySocket');
const { processTelemetry } = require('./ruleEngineService');
const { pushTelemetry } = require('../streams/telemetryStream');

// ─── Simulator config ────────────────────────────────────────────────────────

const INTERVAL_MS = 16000; // emit every 2 seconds

/**
 * Each turbine has its own live state that drifts continuously.
 * This makes the dashboard look like a real IoT system — values
 * trend up and down rather than jumping to random numbers every tick.
 */
const turbineState = {
    'TURBINE-001': {
        temperature: 72.0,   // °F
        pressure:    120.0,  // PSI
        humidity:    43.0,   // %
        rpm:         1800.0, // RPM
        _tempStep:   0,      // internal step counter for anomaly injection
    },
    'TURBINE-002': {
        temperature: 68.5,
        pressure:    115.0,
        humidity:    51.0,
        rpm:         1740.0,
        _tempStep:   0,
    },
    'TURBINE-003': {
        temperature: 75.3,
        pressure:    125.0,
        humidity:    38.0,
        rpm:         1860.0,
        _tempStep:   0,
    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Nudge a value by a random walk step, then clamp it inside [min, max].
 * @param {number} current  - current reading
 * @param {number} delta    - max change per tick (±)
 * @param {number} min
 * @param {number} max
 * @param {number} decimals - decimal places to keep
 */
function nudge(current, delta, min, max, decimals = 1) {
    const next = current + (Math.random() * 2 - 1) * delta;
    return +Math.min(max, Math.max(min, next)).toFixed(decimals);
}

/**
 * Derive a human-readable status from a temperature reading.
 * @param {number} temperature
 * @returns {'NORMAL' | 'WARNING'}
 */
function deriveStatus(temperature) {
    return temperature >= 80 ? 'WARNING' : 'NORMAL';
}

// ─── Core tick ───────────────────────────────────────────────────────────────

/**
 * Advance one simulation tick for a single turbine.
 * Every ~8 ticks we inject a short temperature spike to simulate
 * a real-world anomaly (e.g. a load surge).
 *
 * @param {string} sensorId
 * @returns {Object} - the complete telemetry payload for this tick
 */
function tickTurbine(sensorId) {
    const s = turbineState[sensorId];
    s._tempStep += 1;

    // ── Temperature: gentle random-walk with periodic anomaly spikes ──
    // Every 8 ticks inject a +4–7 °F spike, then it naturally drifts back.
    if (s._tempStep % 8 === 0) {
        s.temperature += 4 + Math.random() * 3; // spike up
    } else {
        s.temperature = nudge(s.temperature, 1.5, 60, 95);
    }
    s.temperature = +s.temperature.toFixed(1);

    // ── Pressure: slow drift ──────────────────────────────────────────
    s.pressure = nudge(s.pressure, 2.5, 90, 150, 1);

    // ── Humidity: very slow drift ─────────────────────────────────────
    s.humidity = nudge(s.humidity, 1.5, 20, 80, 1);

    // ── RPM: moderate drift ───────────────────────────────────────────
    s.rpm = nudge(s.rpm, 35, 1400, 2100, 0);

    return {
        sensorId,
        timestamp:   new Date(),
        temperature: s.temperature,
        pressure:    s.pressure,
        humidity:    s.humidity,
        rpm:         s.rpm,
        status:      deriveStatus(s.temperature),
    };
}

// ─── Broadcast one tick for all turbines ─────────────────────────────────────

async function broadcastAndSave() {
    const io = getIo();

    for (const sensorId of Object.keys(turbineState)) {
        const payload = tickTurbine(sensorId);

        // ── 1. Save to MongoDB (time-series collection) ───────────────
        try {
            await Telemetry.create(payload);
        } catch (dbErr) {
            console.error(`[Simulator] MongoDB save failed for ${sensorId}:`, dbErr.message);
        }

        // ── 2. Broadcast via Socket.IO → "telemetry:update" ──────────
        const socketPayload = {
            sensorId:    payload.sensorId,
            timestamp:   payload.timestamp.toISOString(),
            temperature: payload.temperature,
            pressure:    payload.pressure,
            humidity:    payload.humidity,
            rpm:         payload.rpm,
            status:      payload.status,
        };
        io.emit('telemetry:update', socketPayload);

        // ── 3. Push into RxJS Telemetry Stream ──────────────────────
        pushTelemetry(socketPayload);

        // ── 4. Pass telemetry stream to active Rule Engine (Steps 6-10) ──
        try {
            await processTelemetry(payload);
        } catch (engineErr) {
            console.error(`[RuleEngine] Processing error for ${sensorId}:`, engineErr.message);
        }

        console.log(
            `[Simulator] ${payload.sensorId} | ` +
            `Temp: ${payload.temperature}°F | ` +
            `Pressure: ${payload.pressure} PSI | ` +
            `RPM: ${payload.rpm} | ` +
            `Status: ${payload.status}`
        );
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

let _intervalHandle = null;

/**
 * Start the telemetry simulation loop.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
function startSimulator() {
    if (_intervalHandle) {
        console.warn('[Simulator] Already running — ignoring duplicate startSimulator() call.');
        return;
    }

    console.log(`[Simulator] Starting — 3 turbines, tick every ${INTERVAL_MS / 1000}s`);
    _intervalHandle = setInterval(broadcastAndSave, INTERVAL_MS);

    // Fire immediately so the dashboard isn't blank on first load
    broadcastAndSave().catch((err) =>
        console.error('[Simulator] Error on initial broadcast:', err.message)
    );
}

/**
 * Stop the simulation loop (e.g. during graceful shutdown).
 */
function stopSimulator() {
    if (_intervalHandle) {
        clearInterval(_intervalHandle);
        _intervalHandle = null;
        console.log('[Simulator] Stopped.');
    }
}

module.exports = { startSimulator, stopSimulator };
