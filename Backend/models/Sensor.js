const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  sensorId: {
    type: String,
    required: [true, 'Please add a sensor ID'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please add a sensor name'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Please add a sensor type'],
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Sensor', sensorSchema);
