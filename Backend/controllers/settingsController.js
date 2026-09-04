'use strict';

const User = require('../models/User');

const DEFAULT_PREFERENCES = {
  alertNotifications: true,
  highSeverityOnly: false,
  defaultSensor: 'TURBINE-001',
  telemetryInterval: '5s',
};

/**
 * @desc    Get current user settings & preferences
 * @route   GET /api/settings
 * @access  Private
 */
exports.getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...(user.preferences ? (user.preferences.toObject ? user.preferences.toObject() : user.preferences) : {}),
    };

    return res.status(200).json({
      success: true,
      profile: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      preferences,
    });
  } catch (error) {
    console.error('[SettingsController] Error fetching settings:', error.message);
    return res.status(500).json({ success: false, message: 'Server error fetching settings' });
  }
};

/**
 * @desc    Update current user settings & preferences
 * @route   PUT /api/settings (or PATCH /api/settings)
 * @access  Private
 */
exports.updateSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { alertNotifications, highSeverityOnly, defaultSensor, telemetryInterval } = req.body || {};

    if (!user.preferences) {
      user.preferences = { ...DEFAULT_PREFERENCES };
    }

    if (alertNotifications !== undefined) {
      user.preferences.alertNotifications = Boolean(alertNotifications);
    }
    if (highSeverityOnly !== undefined) {
      user.preferences.highSeverityOnly = Boolean(highSeverityOnly);
    }
    if (defaultSensor !== undefined && typeof defaultSensor === 'string' && defaultSensor.trim() !== '') {
      user.preferences.defaultSensor = defaultSensor.trim();
    }
    if (telemetryInterval !== undefined && typeof telemetryInterval === 'string' && telemetryInterval.trim() !== '') {
      user.preferences.telemetryInterval = telemetryInterval.trim();
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      preferences: user.preferences,
    });
  } catch (error) {
    console.error('[SettingsController] Error updating settings:', error.message);
    return res.status(500).json({ success: false, message: 'Server error updating settings' });
  }
};
