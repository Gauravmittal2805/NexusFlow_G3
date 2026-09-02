const mongoose     = require('mongoose');
const alertService = require('../services/alertService');

// @desc    Get all alerts (newest first)
// @route   GET /api/alerts
// @access  Public / Authenticated
exports.getAlerts = async (req, res) => {
  try {
    const alerts = await alertService.getAllAlerts();
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

