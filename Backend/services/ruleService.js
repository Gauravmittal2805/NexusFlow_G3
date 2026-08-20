const Rule = require('../models/Rule');

/**
 * Retrieve all active rules from MongoDB for the execution engine (Step 4 & 5).
 * Only rules where `isActive === true` are returned.
 *
 * @returns {Promise<Array>} Array of active rule objects containing nodes and edges.
 */
const getActiveRules = async () => {
  try {
    const activeRules = await Rule.find({ isActive: true }).lean();
    return activeRules;
  } catch (error) {
    console.error('Error fetching active rules in ruleService:', error.message);
    return [];
  }
};

module.exports = {
  getActiveRules,
};
