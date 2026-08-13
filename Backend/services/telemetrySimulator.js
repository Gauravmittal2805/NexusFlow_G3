const Telemetry = require('../models/Telemetry');
const { getIo } = require('../websocket/telemetrySocket');

let simulatorInterval;

const generateRandomNumber = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

const startSimulator = () => {
    console.log('Starting telemetry simulator...');
    
    if (simulatorInterval) {
        clearInterval(simulatorInterval);
    }

    simulatorInterval = setInterval(async () => {
        try {
            const telemetryData = {
                sensorId: 'TURBINE-001',
                timestamp: new Date().toISOString(),
                temperature: generateRandomNumber(70, 90),
                pressure: generateRandomNumber(110, 130),
                humidity: generateRandomNumber(40, 50),
                rpm: generateRandomNumber(1750, 1850)
            };

            const status = telemetryData.temperature >= 80 ? 'WARNING' : 'NORMAL';

            const telemetry = new Telemetry({
                ...telemetryData,
                status
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

        } catch (error) {
            console.error('Error in telemetry simulator:', error);
        }
    }, 1000); // Every 1 second
};

const stopSimulator = () => {
    if (simulatorInterval) {
        clearInterval(simulatorInterval);
        console.log('Telemetry simulator stopped.');
    }
};

module.exports = {
    startSimulator,
    stopSimulator
};
