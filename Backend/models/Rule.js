const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a rule name'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  nodes: {
    type: Array,
    required: [true, 'Nodes array is required'],
    default: [],
  },
  edges: {
    type: Array,
    required: [true, 'Edges array is required'],
    default: [],
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'RUNNING'],
    default: 'ACTIVE',
  },
  lastTriggered: {
    type: Date,
    default: null,
  },
  lastTriggeredSensor: {
    type: String,
    default: null,
  },
  lastTriggeredValue: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Rule', ruleSchema);
