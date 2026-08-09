const Telemetry = require('../models/Telemetry');

// @desc    Create a new telemetry record
// @route   POST /api/telemetry
// @access  Public
exports.createTelemetry = async (req, res) => {
    try {
        const { sensorId, timestamp, temperature, pressure, humidity, rpm } = req.body;

        const telemetry = new Telemetry({
            sensorId,
            timestamp: timestamp || new Date(),
            temperature,
            pressure,
            humidity,
            rpm
        });

        const savedTelemetry = await telemetry.save();

        res.status(201).json({
            success: true,
            data: savedTelemetry
        });
    } catch (error) {
        console.error('Error creating telemetry:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get all telemetry records
// @route   GET /api/telemetry
// @access  Public
exports.getAllTelemetry = async (req, res) => {
    try {
        const telemetry = await Telemetry.find().sort({ timestamp: -1 });

        res.status(200).json({
            success: true,
            count: telemetry.length,
            data: telemetry
        });
    } catch (error) {
        console.error('Error fetching all telemetry:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get telemetry records by sensor ID
// @route   GET /api/telemetry/:sensorId
// @access  Public
exports.getTelemetryBySensorId = async (req, res) => {
    try {
        const { sensorId } = req.params;
        const telemetry = await Telemetry.find({ sensorId }).sort({ timestamp: -1 });

        res.status(200).json({
            success: true,
            count: telemetry.length,
            data: telemetry
        });
    } catch (error) {
        console.error(`Error fetching telemetry for sensor ${req.params.sensorId}:`, error.message);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};
