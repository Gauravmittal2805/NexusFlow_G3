/**
 * Supported operators for condition evaluation.
 */
const SUPPORTED_OPERATORS = ['>', '<', '>=', '<=', '==', '!='];

/**
 * Validates a condition object and telemetry data (Step 5).
 *
 * @param {Object} condition - Condition object or node data containing field, operator, value
 * @param {Object} telemetry - Telemetry reading object containing sensor telemetry fields
 * @returns {{ isValid: boolean, error?: string, conditionData?: Object }} Validation result
 */
const validateCondition = (condition, telemetry) => {
  if (!condition || typeof condition !== 'object') {
    return { isValid: false, error: 'Condition object is required and must be an object.' };
  }

  if (!telemetry || typeof telemetry !== 'object') {
    return { isValid: false, error: 'Telemetry object is required and must be an object.' };
  }

  // Extract condition attributes (handles both condition node data or direct condition object)
  const conditionData = condition.data ? condition.data : condition;
  const { field, operator, value } = conditionData;

  // 1. Verify field exists
  if (!field || typeof field !== 'string' || field.trim() === '') {
    return { isValid: false, error: 'Condition field is required and must be a non-empty string.' };
  }

  // 2. Verify operator exists
  if (operator === undefined || operator === null || typeof operator !== 'string' || operator.trim() === '') {
    return { isValid: false, error: 'Condition operator is required and must be a non-empty string.' };
  }

  // 3. Verify value exists
  if (value === undefined || value === null) {
    return { isValid: false, error: 'Condition value is required.' };
  }

  // 4. Verify operator is supported
  const trimmedOp = operator.trim();
  if (!SUPPORTED_OPERATORS.includes(trimmedOp)) {
    return {
      isValid: false,
      error: `Unsupported operator '${operator}'. Supported operators are: ${SUPPORTED_OPERATORS.join(', ')}`,
    };
  }

  // 5. Verify telemetry contains the requested field (Step 4 & Step 5)
  const telemetryValue = telemetry[field];
  if (telemetryValue === undefined || telemetryValue === null) {
    return {
      isValid: false,
      error: `Telemetry does not contain requested field '${field}'.`,
    };
  }

  return {
    isValid: true,
    conditionData: {
      field: field.trim(),
      operator: trimmedOp,
      value,
    },
  };
};

/**
 * Evaluates a condition node against telemetry data (Steps 2-5).
 *
 * @param {Object} condition - Condition node or object e.g. { field: "temperature", operator: ">", value: 80 }
 * @param {Object} telemetry - Telemetry object e.g. { sensorId: "TURBINE-001", temperature: 82.4 }
 * @returns {boolean} TRUE if condition is satisfied, FALSE otherwise (or if condition is invalid)
 */
const evaluateCondition = (condition, telemetry) => {
  // Step 5: Validate condition node & telemetry before evaluation
  const validation = validateCondition(condition, telemetry);

  if (!validation.isValid) {
    // Log error gracefully, do not crash backend
    console.error(`[ConditionEvaluator] Invalid condition evaluation: ${validation.error}`);
    return false;
  }

  const { field, operator, value: targetValue } = validation.conditionData;
  const telemetryValue = telemetry[field];

  // Coerce numeric values if appropriate
  const numTelemetry = Number(telemetryValue);
  const numTarget = Number(targetValue);
  const isNumericComparison = !isNaN(numTelemetry) && !isNaN(numTarget);

  const valA = isNumericComparison ? numTelemetry : telemetryValue;
  const valB = isNumericComparison ? numTarget : targetValue;

  // Step 3: Support Basic Operators (>, <, >=, <=, ==, !=)
  switch (operator) {
    case '>':
      return valA > valB;
    case '<':
      return valA < valB;
    case '>=':
      return valA >= valB;
    case '<=':
      return valA <= valB;
    case '==':
      // Using abstract equality for numeric/string tolerance
      return valA == valB;
    case '!=':
      return valA != valB;
    default:
      return false;
  }
};

module.exports = {
  evaluateCondition,
  validateCondition,
  SUPPORTED_OPERATORS,
};
