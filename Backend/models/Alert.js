const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  ruleId: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  ruleName: {
    type: String,
    required: [true, 'Please add a rule name'],
    trim: true,
  },
  sensorId: {
    type: String,
    required: [true, 'Please add a sensor ID'],
    trim: true,
  },
  message: {
    type: String,
    required: [true, 'Please add an alert message'],
    trim: true,
  },
  severity: {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    default: 'HIGH',
  },
  status: {
    type: String,
    enum: ['unread', 'read'],
    default: 'unread',
  },
  action: {
    type: String,
    enum: ['SMS', 'EMAIL', 'NOTIFICATION'],
    default: 'NOTIFICATION',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Alert', alertSchema);
