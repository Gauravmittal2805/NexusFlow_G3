const Rule = require('../models/Rule');
const { validateGraph } = require('../compiler/graphValidator');
const {
  loadRule,
  startRule,
  stopRule,
  reloadRule,
  getStatus,
  getRuleStatus: getRuntimeStatus,
} = require('../engine/ruleRuntime');

/**
 * Helper function to validate React Flow graph rule structure
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
    const inputError = validateRuleInput(req.body);
    if (inputError) {
      return res.status(400).json({
        success: false,
        message: inputError,
      });
    }

    const { name, description, nodes, edges, isActive } = req.body;

    // Validate graph completeness (Sensor, Condition, Action/Alert)
    const graphValidation = validateGraph({ nodes, edges });
    if (!graphValidation.valid) {
      return res.status(400).json({
        success: false,
        message: `Complete the rule before saving: ${graphValidation.errors[0] || 'Invalid rule graph'}`,
        errors: graphValidation.errors,
      });
    }

    const rule = await Rule.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      nodes,
      edges,
      createdBy: req.user.id,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    let compiled = false;
    let compilationMessage = 'Rule saved';
    if (rule.isActive) {
      const loadResult = loadRule(rule.toObject ? rule.toObject() : rule);
      compiled = loadResult.ok && startRule(loadResult.ruleId);
      compilationMessage = compiled
        ? 'Rule compiled and running successfully'
        : 'Rule saved, compilation pending';
    }

    return res.status(201).json({
      success: true,
      message: 'Rule saved successfully',
      compiled,
      compilationMessage,
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

// @desc    Get all rules — admin sees all, others see their own (GET /api/rules)
// @access  Private
const getRules = async (req, res) => {
  try {
    // Admins can see all rules; operator/viewer see only their own
    const filter = req.user.role === 'admin' ? {} : { createdBy: req.user.id };
    const rules = await Rule.find(filter).sort({ createdAt: -1 });

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
    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, createdBy: req.user.id };

    const rule = await Rule.findOne(filter);

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

// @desc    Update a rule (PUT /api/rules/:id) - Step 1
// @access  Private
const updateRule = async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, createdBy: req.user.id };

    const rule = await Rule.findOne(filter);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }

    const { name, description, nodes, edges, isActive } = req.body;

    // Validate if name, nodes, or edges are provided
    if (name !== undefined || nodes !== undefined || edges !== undefined) {
      const payloadToValidate = {
        name: name !== undefined ? name : rule.name,
        nodes: nodes !== undefined ? nodes : rule.nodes,
        edges: edges !== undefined ? edges : rule.edges,
      };
      const validationError = validateRuleInput(payloadToValidate);
      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }

      const graphValidation = validateGraph({
        nodes: payloadToValidate.nodes,
        edges: payloadToValidate.edges,
      });
      if (!graphValidation.valid) {
        return res.status(400).json({
          success: false,
          message: `Complete the rule before saving: ${graphValidation.errors[0] || 'Invalid rule graph'}`,
          errors: graphValidation.errors,
        });
      }
    }

    if (name !== undefined) rule.name = name.trim();
    if (description !== undefined) rule.description = description.trim();
    if (nodes !== undefined) rule.nodes = nodes;
    if (edges !== undefined) rule.edges = edges;
    if (isActive !== undefined) rule.isActive = Boolean(isActive);

    await rule.save();

    let compiled = false;
    let compilationMessage = 'Rule saved';
    if (rule.isActive) {
      compiled = reloadRule(rule.toObject ? rule.toObject() : rule);
      compilationMessage = compiled
        ? 'Rule compiled and running successfully'
        : 'Rule saved, compilation failed';
    } else {
      stopRule(rule._id ? String(rule._id) : rule.id);
      compilationMessage = 'Rule saved (Inactive)';
    }

    return res.status(200).json({
      success: true,
      message: 'Rule saved successfully',
      compiled,
      compilationMessage,
      rule,
    });
  } catch (error) {
    console.error('Error updating rule:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error while updating rule',
    });
  }
};

// @desc    Delete a rule (DELETE /api/rules/:id) - Step 2
// @access  Private
const deleteRule = async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, createdBy: req.user.id };

    const rule = await Rule.findOneAndDelete(filter);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }

    stopRule(rule._id ? String(rule._id) : rule.id);

    return res.status(200).json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting rule:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting rule',
    });
  }
};

// @desc    Explicit Enable/Disable Rule Status (PATCH /api/rules/:id/status) - Step 3
// @access  Private
const updateRuleStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: "Field 'isActive' boolean is required",
      });
    }

    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, createdBy: req.user.id };

    const rule = await Rule.findOne(filter);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }

    rule.isActive = Boolean(isActive);
    await rule.save();

    if (rule.isActive) {
      const ruleObj = rule.toObject ? rule.toObject() : rule;
      const loadResult = loadRule(ruleObj);
      if (loadResult.ok) startRule(loadResult.ruleId);
    } else {
      stopRule(rule._id ? String(rule._id) : rule.id);
    }

    const actionText = rule.isActive ? 'enabled' : 'disabled';
    return res.status(200).json({
      success: true,
      message: `Rule ${actionText} successfully`,
      rule,
    });
  } catch (error) {
    console.error('Error updating rule status:', error);
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

// @desc    Toggle rule active/inactive status (PATCH /api/rules/:id/toggle)
// @access  Private
const toggleRuleStatus = async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, createdBy: req.user.id };

    const rule = await Rule.findOne(filter);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found',
      });
    }

    rule.isActive = !rule.isActive;
    await rule.save();

    if (rule.isActive) {
      const ruleObj = rule.toObject ? rule.toObject() : rule;
      const loadResult = loadRule(ruleObj);
      if (loadResult.ok) startRule(loadResult.ruleId);
    } else {
      stopRule(rule._id ? String(rule._id) : rule.id);
    }

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

// @desc    Get all active rule pipelines currently running in memory
//          GET /api/rules/runtime/status
// @access  Private
const getRuntimePipelineStatus = (req, res) => {
  const pipelines = getStatus();

  const summary = pipelines.map((entry) => ({
    ruleId:         entry.ruleId,
    ruleName:       entry.ruleName,
    status:         entry.status,           // 'RUNNING' | 'STOPPED'
    conditionState: entry.conditionState,   // 'NORMAL'  | 'TRIGGERED'
    executionOrder: entry.executionOrder,   // ['s1', 'c1', 'a1']
    triggerCount:   entry.triggerCount,
    startedAt:      entry.startedAt,
    stoppedAt:      entry.stoppedAt,
    loadError:      entry.loadError,
    subscriptionClosed: entry.subscriptionClosed,
  }));

  const running = summary.filter((e) => e.status === 'RUNNING').length;
  const stopped = summary.filter((e) => e.status === 'STOPPED').length;

  return res.status(200).json({
    success:    true,
    total:      summary.length,
    running,
    stopped,
    pipelines:  summary,
  });
};

// @desc    Get runtime pipeline status for a single rule
//          GET /api/rules/:id/status
// @access  Private
const getRuleStatus = async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, createdBy: req.user.id };

    const rule = await Rule.findOne(filter);
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }

    const ruleId  = String(rule._id);
    const runtime = getRuntimeStatus(ruleId);

    // Determine status: check runtime registry first, fall back to DB isActive
    let status = 'INACTIVE';
    if (runtime) {
      status = runtime.status; // 'RUNNING' or 'STOPPED'
    } else if (rule.isActive) {
      status = 'ACTIVE'; // active in DB but not yet loaded into runtime
    }

    return res.status(200).json({
      success:  true,
      ruleId,
      ruleName: rule.name,
      isActive: Boolean(rule.isActive),
      status,
      // Runtime pipeline details (null if rule not in registry)
      pipeline: runtime ? {
        executionOrder:     runtime.executionOrder,
        conditionState:     runtime.conditionState,
        triggerCount:       runtime.triggerCount,
        startedAt:          runtime.startedAt,
        stoppedAt:          runtime.stoppedAt,
        loadError:          runtime.loadError,
        subscriptionClosed: runtime.subscriptionClosed,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching rule status:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }
    return res.status(500).json({ success: false, message: 'Server error while fetching rule status' });
  }
};

module.exports = {
  createRule,
  getRules,
  getRuleById,
  getRuleStatus,
  getRuntimePipelineStatus,
  updateRule,
  deleteRule,
  updateRuleStatus,
  toggleRuleStatus,
};
