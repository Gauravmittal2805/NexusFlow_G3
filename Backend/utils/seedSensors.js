'use strict';

const Sensor = require('../models/Sensor');

const DEFAULT_SENSORS = [
  { sensorId: 'TURBINE-001', name: 'Wind Turbine 01', type: 'Industrial Turbine', status: 'active' },
  { sensorId: 'TURBINE-002', name: 'Wind Turbine 02', type: 'Industrial Turbine', status: 'active' },
  { sensorId: 'TURBINE-003', name: 'Wind Turbine 03', type: 'Industrial Turbine', status: 'active' },
];

/**
 * Seeds default turbine sensors if the collection is empty
 */
async function seedSensors() {
  try {
    const count = await Sensor.countDocuments();
    if (count === 0) {
      await Sensor.insertMany(DEFAULT_SENSORS);
      console.log('✅ Seeded default turbine fleet sensors into MongoDB (TURBINE-001, TURBINE-002, TURBINE-003)');
    }
  } catch (error) {
    console.warn('[SeedSensors] Non-fatal sensor seeding notice:', error.message);
  }
}

module.exports = { seedSensors, DEFAULT_SENSORS };
