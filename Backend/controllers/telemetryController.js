const Telemetry = require('../models/Telemetry');
const { processTelemetry } = require('../services/telemetryService');

/**
 * Helper to parse time-range filters from query params.
 * Supports:
 *  - timeRange ('1h', '24h', '7d', '30d')
 *  - startTime / from / startDate (ISO date or timestamp)
 *  - endTime / to / endDate (ISO date or timestamp)
 */
function parseTimeFilter(query = {}) {
  const filter = {};
  const { timeRange, startTime, from, startDate, endTime, to, endDate } = query;

  let start = null;
  let end = null;

  if (timeRange) {
    const now = Date.now();
    const rangeMap = {
      '1h':  60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d':  7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    if (rangeMap[timeRange]) {
      start = new Date(now - rangeMap[timeRange]);
    }
  }

  const rawStart = startTime || from || startDate;
  if (rawStart) {
    const parsed = new Date(rawStart);
    if (!isNaN(parsed.getTime())) {
      start = parsed;
    }
  }

  const rawEnd = endTime || to || endDate;
  if (rawEnd) {
    const parsed = new Date(rawEnd);
    if (!isNaN(parsed.getTime())) {
      end = parsed;
    }
  }

  if (start || end) {
    filter.timestamp = {};
    if (start) filter.timestamp.$gte = start;
    if (end) filter.timestamp.$lte = end;
  }

  return filter;
}

// @desc    Create a new telemetry record
// @route   POST /api/telemetry
// @access  Public
exports.createTelemetry = async (req, res) => {
  try {
    const savedTelemetry = await processTelemetry(req.body);

    res.status(201).json({
      success: true,
      data: savedTelemetry,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.validationErrors,
      });
    }

    console.error('Error creating telemetry:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Get all telemetry records with filters (sensorId, metric, timeRange, limit, sort)
// @route   GET /api/telemetry
// @access  Public
exports.getAllTelemetry = async (req, res) => {
  try {
    const { sensorId, sensor, metric, limit = 100, sort = 'desc' } = req.query;
    const filter = parseTimeFilter(req.query);

    const targetSensor = sensorId || sensor;
    if (targetSensor && targetSensor !== 'All' && targetSensor !== 'all') {
      filter.sensorId = targetSensor;
    }

    if (metric && metric !== 'all' && metric !== 'All') {
      filter[metric] = { $exists: true, $ne: null };
    }

    const sortOrder = sort === 'asc' ? { timestamp: 1 } : { timestamp: -1 };
    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);

    const telemetry = await Telemetry.find(filter)
      .sort(sortOrder)
      .limit(maxLimit);

    res.status(200).json({
      success: true,
      count: telemetry.length,
      data: telemetry,
    });
  } catch (error) {
    console.error('Error fetching all telemetry:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Get telemetry records by sensor ID with query filters (metric, timeRange, limit, sort)
// @route   GET /api/telemetry/:sensorId
// @access  Public
exports.getTelemetryBySensorId = async (req, res) => {
  try {
    const { sensorId } = req.params;
    const { metric, limit = 100, sort = 'desc' } = req.query;
    const filter = parseTimeFilter(req.query);

    if (sensorId && sensorId !== 'All' && sensorId !== 'all') {
      filter.sensorId = sensorId;
    }

    if (metric && metric !== 'all' && metric !== 'All') {
      filter[metric] = { $exists: true, $ne: null };
    }

    const sortOrder = sort === 'asc' ? { timestamp: 1 } : { timestamp: -1 };
    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);

    const telemetry = await Telemetry.find(filter)
      .sort(sortOrder)
      .limit(maxLimit);

    res.status(200).json({
      success: true,
      count: telemetry.length,
      data: telemetry,
    });
  } catch (error) {
    console.error(`Error fetching telemetry for sensor ${req.params.sensorId}:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// @desc    Get telemetry analytics summary / statistics
// @route   GET /api/telemetry/summary
// @access  Public
exports.getTelemetrySummary = async (req, res) => {
  try {
    const filter = parseTimeFilter(req.query);
    const { sensorId, sensor } = req.query;
    const targetSensor = sensorId || sensor;
    if (targetSensor && targetSensor !== 'All' && targetSensor !== 'all') {
      filter.sensorId = targetSensor;
    }

    const summary = await Telemetry.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$sensorId',
          avgTemp: { $avg: '$temperature' },
          maxTemp: { $max: '$temperature' },
          minTemp: { $min: '$temperature' },
          avgPressure: { $avg: '$pressure' },
          maxPressure: { $max: '$pressure' },
          minPressure: { $min: '$pressure' },
          avgHumidity: { $avg: '$humidity' },
          maxHumidity: { $max: '$humidity' },
          minHumidity: { $min: '$humidity' },
          avgRpm: { $avg: '$rpm' },
          maxRpm: { $max: '$rpm' },
          minRpm: { $min: '$rpm' },
          count: { $sum: 1 },
          lastTimestamp: { $max: '$timestamp' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      count: summary.length,
      summary,
    });
  } catch (error) {
    console.error('Error calculating telemetry summary:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
