/**
 * Validates incoming telemetry data before processing or broadcasting.
 * 
 * Rules:
 *  - sensorId    : must exist and be a non-empty string
 *  - timestamp   : must exist (string or Date)
 *  - temperature : must be a finite number
 *  - pressure    : must be a finite number
 *  - rpm         : must be a finite number
 * 
 * @param {Object} data - Raw telemetry payload
 * @returns {{ isValid: boolean, errors: string[] }}
 */
const validateTelemetry = (data) => {
    const errors = [];

    // sensorId — must exist and be a non-empty string
    if (!data.sensorId || typeof data.sensorId !== 'string' || data.sensorId.trim() === '') {
        errors.push('sensorId is required and must be a non-empty string');
    }

    // timestamp — must exist
    if (!data.timestamp) {
        errors.push('timestamp is required');
    }

    // temperature — must be a finite number
    if (typeof data.temperature !== 'number' || !isFinite(data.temperature)) {
        errors.push('temperature must be a valid number');
    }

    // pressure — must be a finite number
    if (typeof data.pressure !== 'number' || !isFinite(data.pressure)) {
        errors.push('pressure must be a valid number');
    }

    // rpm — must be a finite number
    if (typeof data.rpm !== 'number' || !isFinite(data.rpm)) {
        errors.push('rpm must be a valid number');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

module.exports = { validateTelemetry };
