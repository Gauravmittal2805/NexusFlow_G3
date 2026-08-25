const Telemetry = require('../models/Telemetry');
const { getIo } = require('../websocket/telemetrySocket');
const { validateTelemetry } = require('../utils/validateTelemetry');
const { processTelemetry: evaluateRuleTelemetry } = require('./ruleEngineService');
const { pushTelemetry } = require('../streams/telemetryStream');

const processTelemetry = async (data) => {
    // Step 1: Validate incoming telemetry data
    const { isValid, errors } = validateTelemetry(data);
    if (!isValid) {
        const error = new Error(`Invalid telemetry data: ${errors.join(' | ')}`);
        error.statusCode = 400;
        error.validationErrors = errors;
        throw error;
    }

    // Step 2: Derive Sensor Status based on temperature
    const status = data.temperature >= 80 ? 'WARNING' : 'NORMAL';

    const telemetry = new Telemetry({
        ...data,
        status,
        timestamp: data.timestamp || new Date()
    });

    // Store it in MongoDB
    const savedTelemetry = await telemetry.save();
    const telemetryObj = savedTelemetry.toObject ? savedTelemetry.toObject() : savedTelemetry;

    // Push into RxJS Telemetry Stream
    pushTelemetry(telemetryObj);

    // Broadcast through Socket.IO
    try {
        const io = getIo();
        io.emit('telemetry:update', savedTelemetry);
    } catch (err) {
        console.error('Socket.IO emit error:', err.message);
    }

    // Pass to Rule Engine for evaluation (Step 10)
    try {
        await evaluateRuleTelemetry(savedTelemetry.toObject ? savedTelemetry.toObject() : savedTelemetry);
    } catch (ruleErr) {
        console.error('[TelemetryService] Rule evaluation error:', ruleErr.message);
    }

    return savedTelemetry;
};

module.exports = {
    processTelemetry
};
