const mongoose     = require('mongoose');
const alertService = require('../services/alertService');

// @desc    Get all alerts (with optional sensorId, severity, status, limit filters)
// @route   GET /api/alerts
// @access  Public / Authenticated
exports.getAlerts = async (req, res) => {
  try {
    const { sensorId, severity, status, limit } = req.query || {};
    const filter = {};
    if (sensorId && sensorId !== 'All' && sensorId !== 'all') {
      filter.sensorId = sensorId;
    }
    if (severity && severity !== 'all' && severity !== 'All') {
      filter.severity = new RegExp(`^${severity}$`, 'i');
    }
    if (status && status !== 'all' && status !== 'All') {
      filter.status = status.toLowerCase();
    }

    const maxLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 0, 1), 500) : 0;
    const alerts = await alertService.getAllAlerts(filter, maxLimit);
    res.status(200).json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error('[AlertController] Error fetching alerts:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get alert statistics breakdown
// @route   GET /api/alerts/stats
// @access  Public / Authenticated
exports.getAlertStats = async (req, res) => {
  try {
    const Alert = require('../models/Alert');
    const [total, unread, high, medium, low] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ status: 'unread' }),
      Alert.countDocuments({ severity: { $in: [/^high$/i, /^critical$/i] } }),
      Alert.countDocuments({ severity: /^medium$/i }),
      Alert.countDocuments({ severity: { $in: [/^low$/i, /^info$/i] } }),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        total,
        unread,
        high,
        medium,
        low,
      },
    });
  } catch (error) {
    console.error('[AlertController] Error fetching alert stats:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get single alert by ID
// @route   GET /api/alerts/:id
// @access  Public / Authenticated
exports.getAlertById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid alert ID format' });
    }

    const alert = await alertService.getAlertById(id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    res.status(200).json({ success: true, alert });
  } catch (error) {
    console.error('[AlertController] Error fetching alert by ID:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Mark alert as read
// @route   PATCH /api/alerts/:id/read
// @access  Public / Authenticated
exports.markAlertAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid alert ID format' });
    }

    const alert = await alertService.markAlertAsRead(id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    res.status(200).json({
      success: true,
      message: 'Alert marked as read',
      alert,
    });
  } catch (error) {
    console.error('[AlertController] Error marking alert as read:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

