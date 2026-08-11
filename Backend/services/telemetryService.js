const Telemetry = require('../models/Telemetry');
const { getIo } = require('../websocket/telemetrySocket');

const processTelemetry = async (data) => {
    // Derive Sensor Status based on temperature
    const status = data.temperature >= 80 ? 'WARNING' : 'NORMAL';

    const telemetry = new Telemetry({
        ...data,
        status,
        timestamp: data.timestamp || new Date()
    });

    // Store it in MongoDB
    const savedTelemetry = await telemetry.save();

    // Broadcast through Socket.IO
    try {
        const io = getIo();
        io.emit('telemetry:update', savedTelemetry);
    } catch (err) {
        console.error('Socket.IO emit error:', err.message);
    }

    return savedTelemetry;
};

module.exports = {
    processTelemetry
};
