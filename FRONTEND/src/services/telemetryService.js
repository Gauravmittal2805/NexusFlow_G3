/**
 * telemetryService.js — Telemetry API Service Layer
 * Handles fetching historical telemetry data from MongoDB backend
 */

import { getTelemetry, getSensorTelemetry } from './api';

/**
 * Fetch all telemetry records from the backend
 * @returns {Promise<Array>} Array of telemetry records
 */
export const fetchAllTelemetry = async () => {
  try {
    const response = await getTelemetry();
    if (response.data?.success && response.data?.data) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.error('[TelemetryService] Error fetching all telemetry:', error);
    throw error;
  }
};

/**
 * Fetch telemetry records for a specific sensor
 * @param {string} sensorId - The sensor identifier
 * @returns {Promise<Array>} Array of telemetry records for the sensor
 */
export const fetchSensorTelemetry = async (sensorId) => {
  try {
    const response = await getSensorTelemetry(sensorId);
    if (response.data?.success && response.data?.data) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.error(`[TelemetryService] Error fetching telemetry for ${sensorId}:`, error);
    throw error;
  }
};

/**
 * Filter telemetry data by time range
 * @param {Array} telemetryData - Array of telemetry records
 * @param {number} milliseconds - Time range in milliseconds
 * @returns {Array} Filtered telemetry data
 */
export const filterTelemetryByTimeRange = (telemetryData, milliseconds) => {
  const cutoff = Date.now() - milliseconds;
  return telemetryData.filter((record) => {
    if (!record.timestamp) return false;
    const recordTime = new Date(record.timestamp).getTime();
    return recordTime >= cutoff;
  });
};

/**
 * Transform telemetry records into chart-ready format
 * @param {Array} telemetryData - Array of telemetry records
 * @returns {Array} Chart-ready data points
 */
export const transformTelemetryForChart = (telemetryData) => {
  return telemetryData.map((record) => {
    const timestamp = record.timestamp || new Date().toISOString();
    const date = new Date(timestamp);
    
    // Format time as HH:MM:SS
    const time = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    return {
      timestamp,
      time,
      temperature: typeof record.temperature === 'number' ? record.temperature : null,
      pressure: typeof record.pressure === 'number' ? record.pressure : null,
      humidity: typeof record.humidity === 'number' ? record.humidity : null,
      rpm: typeof record.rpm === 'number' ? record.rpm : null,
      sensorId: record.sensorId,
    };
  }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

/**
 * Group telemetry data by sensor ID
 * @param {Array} telemetryData - Array of telemetry records
 * @returns {Object} Telemetry data grouped by sensorId
 */
export const groupTelemetrybySensor = (telemetryData) => {
  const grouped = {};
  
  telemetryData.forEach((record) => {
    const sensorId = record.sensorId;
    if (!grouped[sensorId]) {
      grouped[sensorId] = [];
    }
    grouped[sensorId].push(record);
  });

  return grouped;
};
