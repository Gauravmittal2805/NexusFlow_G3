const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema({
  sensorId: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  temperature: {
    type: Number
  },
  pressure: {
    type: Number
  },
  humidity: {
    type: Number
  },
  rpm: {
    type: Number
  }
}, {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'sensorId',
    granularity: 'seconds'
  }
});

const Telemetry = mongoose.model('Telemetry', telemetrySchema);

module.exports = Telemetry;
