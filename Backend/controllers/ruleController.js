const Rule = require('../models/Rule');

/**
 * Helper function to validate React Flow graph rule structure (Step 6)
 * Minimum validation:
 * ✓ name exists and is a string
 * ✓ nodes is an array
 * ✓ edges is an array
 * ✓ every node has id and type
 */
const validateRuleInput = (body) => {
  const { name, nodes, edges } = body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'Rule name is required and must be a non-empty string';
  }

  if (!Array.isArray(nodes)) {
    return 'Nodes must be an array';
  }

  if (!Array.isArray(edges)) {
    return 'Edges must be an array';
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || typeof node !== 'object') {
      return `Node at index ${i} must be an object`;
    }
    if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
      return `Node at index ${i} is missing a valid 'id'`;
    }
    if (!node.type || typeof node.type !== 'string' || node.type.trim() === '') {
      return `Node at index ${i} is missing a valid 'type'`;
    }
  }

  return null;
};

// @desc    Create a new rule (POST /api/rules)
// @access  Private
const createRule = async (req, res) => {
  try {
    const validationError = validateRuleInput(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const { name, description, nodes, edges, isActive } = req.body;

    const rule = await Rule.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      nodes,
      edges,
      createdBy: req.user.id,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(201).json({
      success: true,
      message: 'Rule created successfully',
      rule,
    });
  } catch (error) {
    console.error('Error creating rule:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating rule',
    });
  }
};

// @desc    Get all rules for the authenticated user (GET /api/rules)
// @access  Private
const getRules = async (req, res) => {
  try {
    const rules = await Rule.find({ createdBy: req.user.id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      rules,
    });
  } catch (error) {
    console.error('Error fetching rules:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching rules',
    });
  }
};

// @desc    Get a single rule by ID with complete graph (GET /api/rules/:id)
// @access  Private
const getRuleById = async (req, res) => {
  try {
    const rule = await Rule.findOne({
      _id: req.params.id,
      createdBy: req.user.id,
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }

    return res.status(200).json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error('Error fetching rule by ID:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching rule',
    });
  }
};

// @desc    Toggle rule active/inactive status (PATCH /api/rules/:id/toggle)
// @access  Private
const toggleRuleStatus = async (req, res) => {
  try {
    const rule = await Rule.findOne({
      _id: req.params.id,
      createdBy: req.user.id,
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }

    rule.isActive = !rule.isActive;
    await rule.save();

    return res.status(200).json({
      success: true,
      message: `Rule status updated to ${rule.isActive ? 'active' : 'inactive'}`,
      rule,
    });
  } catch (error) {
    console.error('Error toggling rule status:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error while updating rule status',
    });
  }
};

module.exports = {
  createRule,
  getRules,
  getRuleById,
  toggleRuleStatus,
};
