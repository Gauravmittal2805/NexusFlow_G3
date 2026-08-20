const Sensor = require('../models/Sensor');

// @desc    Get all sensors
// @route   GET /api/sensors
// @access  Private (admin, operator, viewer)
const getSensors = async (req, res) => {
  try {
    const sensors = await Sensor.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: sensors.length,
      sensors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create a new sensor
// @route   POST /api/sensors
// @access  Private (admin, operator)
const createSensor = async (req, res) => {
  try {
    const { sensorId, name, type, status } = req.body || {};

    if (!sensorId || !name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing sensorId, name, or type'
      });
    }

    const sensorExists = await Sensor.findOne({ sensorId });
    if (sensorExists) {
      return res.status(409).json({
        success: false,
        message: 'Sensor already exists'
      });
    }

    const sensor = await Sensor.create({
      sensorId,
      name,
      type,
      status: status || 'active'
    });

    res.status(201).json({
      success: true,
      sensor
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete a sensor
// @route   DELETE /api/sensors/:id
// @access  Private (admin)
const deleteSensor = async (req, res) => {
  try {
    const { id } = req.params;

    // Try deleting by sensorId first, then by mongoose Object ID
    let sensor = await Sensor.findOne({ sensorId: id });
    if (!sensor) {
      sensor = await Sensor.findById(id);
    }

    if (!sensor) {
      return res.status(404).json({
        success: false,
        message: 'Sensor not found'
      });
    }

    await sensor.deleteOne();

    res.status(200).json({
      success: true,
      message: `Sensor ${id} deleted successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getSensors,
  createSensor,
  deleteSensor
};
