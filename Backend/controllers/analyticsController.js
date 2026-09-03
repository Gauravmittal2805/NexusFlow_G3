'use strict';

const Telemetry = require('../models/Telemetry');
const Alert     = require('../models/Alert');
const Rule      = require('../models/Rule');
const Sensor    = require('../models/Sensor');

/**
 * Helper to parse time-range query filters
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
    if (!isNaN(parsed.getTime())) start = parsed;
  }

  const rawEnd = endTime || to || endDate;
  if (rawEnd) {
    const parsed = new Date(rawEnd);
    if (!isNaN(parsed.getTime())) end = parsed;
  }

  if (start || end) {
    filter.timestamp = {};
    if (start) filter.timestamp.$gte = start;
    if (end) filter.timestamp.$lte = end;
  }

  return filter;
}

/**
 * @desc    Get overall analytics overview summary
 * @route   GET /api/analytics/overview (or /api/analytics/summary)
 * @access  Private
 */
exports.getAnalyticsOverview = async (req, res) => {
  try {
    const [
      totalTelemetry,
      totalAlerts,
      unreadAlerts,
      activeRules,
      distinctSensors,
      severityCounts,
    ] = await Promise.all([
      Telemetry.countDocuments(),
      Alert.countDocuments(),
      Alert.countDocuments({ status: 'unread' }),
      Rule.countDocuments({ isActive: true }),
      Telemetry.distinct('sensorId'),
      Alert.aggregate([
        { $group: { _id: { $toUpper: '$severity' }, count: { $sum: 1 } } },
      ]),
    ]);

    const severityMap = { HIGH: 0, MEDIUM: 0, LOW: 0, CRITICAL: 0, INFO: 0 };
    severityCounts.forEach((s) => {
      const key = (s._id || 'HIGH').toUpperCase();
      severityMap[key] = s.count;
    });

    const highTotal = (severityMap.HIGH || 0) + (severityMap.CRITICAL || 0);

    return res.status(200).json({
      success: true,
      data: {
        totalTelemetry,
        totalAlerts,
        unreadAlerts,
        activeRules,
        sensorCount: distinctSensors.length || 3,
        sensors: distinctSensors.length ? distinctSensors : ['TURBINE-001', 'TURBINE-002', 'TURBINE-003'],
        alertsBySeverity: {
          high: highTotal,
          medium: severityMap.MEDIUM || 0,
          low: (severityMap.LOW || 0) + (severityMap.INFO || 0),
          breakdown: severityMap,
        },
      },
    });
  } catch (error) {
    console.error('[AnalyticsController] Overview error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving analytics overview',
      error: error.message,
    });
  }
};

/**
 * @desc    Get historical telemetry with sensor, metric, and time filters
 * @route   GET /api/analytics/telemetry
 * @access  Private
 */
exports.getHistoricalTelemetry = async (req, res) => {
  try {
    const { sensorId, sensor, metric, limit = 150, sort = 'asc' } = req.query;
    const filter = parseTimeFilter(req.query);

    const targetSensor = sensorId || sensor;
    if (targetSensor && targetSensor !== 'All' && targetSensor !== 'all') {
      filter.sensorId = targetSensor;
    }

    if (metric && metric !== 'all' && metric !== 'All') {
      filter[metric] = { $exists: true, $ne: null };
    }

    const sortOrder = sort === 'asc' ? { timestamp: 1 } : { timestamp: -1 };
    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 150, 1), 2000);

    const records = await Telemetry.find(filter)
      .sort(sortOrder)
      .limit(maxLimit)
      .lean();

    const formatted = records.map((r) => {
      const date = new Date(r.timestamp);
      const timeStr = isNaN(date.getTime())
        ? ''
        : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

      return {
        id: r._id,
        sensorId: r.sensorId,
        timestamp: r.timestamp,
        time: timeStr,
        temperature: r.temperature,
        pressure: r.pressure,
        humidity: r.humidity,
        rpm: r.rpm,
        status: r.status,
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error('[AnalyticsController] Historical telemetry error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving historical telemetry',
      error: error.message,
    });
  }
};

/**
 * @desc    Get alert statistics and frequency over time
 * @route   GET /api/analytics/alerts
 * @access  Private
 */
exports.getAlertAnalytics = async (req, res) => {
  try {
    const { sensorId, days = 7 } = req.query;
    const numDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 90);

    const filter = {};
    if (sensorId && sensorId !== 'All' && sensorId !== 'all') {
      filter.sensorId = sensorId;
    }

    const cutoff = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000);
    filter.timestamp = { $gte: cutoff };

    const alerts = await Alert.find(filter).sort({ timestamp: -1 }).lean();

    // Severity summary
    let high = 0;
    let medium = 0;
    let low = 0;
    const sensorBreakdown = {};

    alerts.forEach((a) => {
      const sev = (a.severity || 'HIGH').toUpperCase();
      if (sev === 'HIGH' || sev === 'CRITICAL') high++;
      else if (sev === 'MEDIUM') medium++;
      else low++;

      const sId = a.sensorId || 'UNKNOWN';
      sensorBreakdown[sId] = (sensorBreakdown[sId] || 0) + 1;
    });

    // Time-based daily buckets
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets = {};
    const now = new Date();

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayLabel = dayNames[d.getDay()];
      const key = `${dayLabel} ${d.getDate()}/${d.getMonth() + 1}`;
      buckets[key] = { label: dayLabel, fullDate: key, high: 0, medium: 0, low: 0, total: 0 };
    }

    alerts.forEach((a) => {
      const aDate = new Date(a.timestamp || a.createdAt || Date.now());
      if (isNaN(aDate.getTime())) return;
      const dayLabel = dayNames[aDate.getDay()];
      const key = `${dayLabel} ${aDate.getDate()}/${aDate.getMonth() + 1}`;

      if (!buckets[key]) {
        buckets[key] = { label: dayLabel, fullDate: key, high: 0, medium: 0, low: 0, total: 0 };
      }

      const sev = (a.severity || 'HIGH').toUpperCase();
      if (sev === 'HIGH' || sev === 'CRITICAL') buckets[key].high++;
      else if (sev === 'MEDIUM') buckets[key].medium++;
      else buckets[key].low++;
      buckets[key].total++;
    });

    return res.status(200).json({
      success: true,
      total: alerts.length,
      severityCounts: {
        high,
        medium,
        low,
      },
      sensorBreakdown,
      frequencyOverTime: Object.values(buckets),
      recentAlerts: alerts.slice(0, 20),
    });
  } catch (error) {
    console.error('[AnalyticsController] Alert analytics error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving alert analytics',
      error: error.message,
    });
  }
};

/**
 * @desc    Get sensor-wise analytics and fleet health
 * @route   GET /api/analytics/sensors
 * @access  Private
 */
exports.getSensorAnalytics = async (req, res) => {
  try {
    const summary = await Telemetry.aggregate([
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
          readingCount: { $sum: 1 },
          lastReading: { $max: '$timestamp' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.status(200).json({
      success: true,
      count: summary.length,
      sensors: summary.map((s) => ({
        sensorId: s._id,
        readings: s.readingCount,
        lastSeen: s.lastReading,
        temperature: {
          avg: s.avgTemp ? Number(s.avgTemp.toFixed(1)) : null,
          min: s.minTemp,
          max: s.maxTemp,
        },
        pressure: {
          avg: s.avgPressure ? Number(s.avgPressure.toFixed(1)) : null,
          min: s.minPressure,
          max: s.maxPressure,
        },
        humidity: {
          avg: s.avgHumidity ? Number(s.avgHumidity.toFixed(1)) : null,
          min: s.minHumidity,
          max: s.maxHumidity,
        },
        rpm: {
          avg: s.avgRpm ? Math.round(s.avgRpm) : null,
          min: s.minRpm,
          max: s.maxRpm,
        },
      })),
    });
  } catch (error) {
    console.error('[AnalyticsController] Sensor analytics error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving sensor analytics',
      error: error.message,
    });
  }
};
