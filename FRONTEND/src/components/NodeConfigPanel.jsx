import React from "react";

const SENSOR_METRICS = [
  { key: "temperature", label: "Temperature", icon: "🌡️", unit: "°C", defaultId: "T-001" },
  { key: "humidity", label: "Humidity", icon: "💧", unit: "%", defaultId: "H-002" },
  { key: "pressure", label: "Pressure", icon: "⏲️", unit: "PSI", defaultId: "P-003" },
  { key: "rpm", label: "RPM", icon: "🔄", unit: "RPM", defaultId: "R-004" }
];

const PROCESSING_OPS = [
  { key: "movingAverage", label: "Moving Average", icon: "📈", defaultWindow: 5 },
  { key: "average", label: "Average Window", icon: "📊", defaultWindow: 10 },
  { key: "minimum", label: "Minimum Window", icon: "⬇️", defaultWindow: 5 },
  { key: "maximum", label: "Maximum Window", icon: "⬆️", defaultWindow: 5 }
];

const CONDITION_OPERATORS = [
  { key: ">", label: "Greater Than (>)", icon: ">" },
  { key: "<", label: "Less Than (<)", icon: "<" },
  { key: "=", label: "Equals (=)", icon: "=" },
  { key: ">=", label: "Greater or Equal (>=)", icon: ">=" },
  { key: "<=", label: "Less or Equal (<=)", icon: "<=" }
];

const ALERT_ACTIONS = [
  { key: "SMS", label: "SMS Alert", icon: "📱" },
  { key: "Email", label: "Email Alert", icon: "✉️" },
  { key: "System", label: "System Alert", icon: "🚨" }
];

export default function NodeConfigPanel({
  selectedNode,
  onUpdateNodeData,
  onDuplicateNode,
  onDeleteNode,
  onClose
}) {
  if (!selectedNode) {
    return (
      <aside className="node-config-panel empty-state">
        <div className="config-empty-content">
          <div className="config-empty-icon">⚙️</div>
          <h3>Node Configuration</h3>
          <p>Click on any node in the Flow Canvas to inspect and fine-tune its parameters.</p>
          <div className="config-hints">
            <div className="hint-pill">🌡️ Data Sources</div>
            <div className="hint-pill">📈 Operations</div>
            <div className="hint-pill">⚖️ Conditions</div>
            <div className="hint-pill">📱 Actions</div>
          </div>
        </div>
      </aside>
    );
  }

  const { id, type, data = {} } = selectedNode;
  const isSensor = type === "sensorNode" || Boolean(data.sensor);
  const isProcessing = type === "movingAverageNode" || type === "processingNode" || Boolean(data.operation);
  const isCondition = type === "conditionNode" || data.operator !== undefined;
  const isAlert = type === "alertNode" || Boolean(data.actionType);

  const handleMetricChange = (metricKey) => {
    const config = SENSOR_METRICS.find((m) => m.key === metricKey) || SENSOR_METRICS[0];
    onUpdateNodeData(id, {
      sensor: metricKey,
      label: `${config.label} Sensor`,
      icon: config.icon,
      unit: config.unit,
      sensorId: data.sensorId || config.defaultId
    });
  };

  const handleOpChange = (opKey) => {
    const config = PROCESSING_OPS.find((o) => o.key === opKey) || PROCESSING_OPS[0];
    onUpdateNodeData(id, {
      operation: opKey,
      label: config.label,
      icon: config.icon,
      window: data.window ?? config.defaultWindow
    });
  };

  const handleOperatorChange = (op) => {
    const config = CONDITION_OPERATORS.find((c) => c.key === op) || CONDITION_OPERATORS[0];
    onUpdateNodeData(id, {
      operator: op,
      label: config.label.split(" (")[0],
      icon: op
    });
  };

  const handleActionTypeChange = (actionType) => {
    const config = ALERT_ACTIONS.find((a) => a.key === actionType) || ALERT_ACTIONS[0];
    onUpdateNodeData(id, {
      actionType,
      label: config.label,
      icon: config.icon
    });
  };

  const handleGenericChange = (field, value) => {
    onUpdateNodeData(id, { [field]: value });
  };

  return (
    <aside className="node-config-panel active">
      <div className="config-header">
        <div className="config-header-title">
          <span className="config-node-icon">{data.icon || "⚙️"}</span>
          <div>
            <h3>Node Configuration</h3>
            <span className="config-node-id">ID: {id}</span>
          </div>
        </div>
        {onClose && (
          <button className="config-close-btn" onClick={onClose} title="Deselect Node">
            ✕
          </button>
        )}
      </div>

      <div className="config-body">
        {/* Selected Node Summary Banner */}
        <div className="config-type-badge">
          <span className="badge-dot"></span>
          <span>{data.label || type}</span>
        </div>

        {/* ─── Sensor Node Configuration ─── */}
        {isSensor && (
          <div className="config-section">
            <h4 className="config-section-title">SENSOR PARAMETERS</h4>

            <div className="form-group">
              <label className="form-label">Telemetry Metric</label>
              <div className="pill-grid">
                {SENSOR_METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`pill-option ${(data.sensor || "temperature") === m.key ? "active" : ""}`}
                    onClick={() => handleMetricChange(m.key)}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Hardware Sensor ID</label>
              <input
                type="text"
                className="form-input"
                value={data.sensorId || "T-001"}
                onChange={(e) => handleGenericChange("sensorId", e.target.value)}
                placeholder="e.g. TURBINE-001"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Engineering Unit</label>
              <div className="read-only-badge">
                {data.unit || SENSOR_METRICS.find((m) => m.key === (data.sensor || "temperature"))?.unit || "°C"}
              </div>
            </div>
          </div>
        )}

        {/* ─── Processing / Moving Average Configuration ─── */}
        {isProcessing && (
          <div className="config-section">
            <h4 className="config-section-title">OPERATION PARAMETERS</h4>

            <div className="form-group">
              <label className="form-label">Calculation Type</label>
              <div className="pill-grid">
                {PROCESSING_OPS.map((op) => (
                  <button
                    key={op.key}
                    type="button"
                    className={`pill-option ${(data.operation || "movingAverage") === op.key ? "active" : ""}`}
                    onClick={() => handleOpChange(op.key)}
                  >
                    <span>{op.icon}</span>
                    <span>{op.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Window Size (Samples)</label>
              <div className="number-stepper">
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => handleGenericChange("window", Math.max(1, (Number(data.window) || 5) - 1))}
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="form-input text-center"
                  value={data.window ?? 5}
                  onChange={(e) => handleGenericChange("window", Math.max(1, Number(e.target.value)))}
                />
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => handleGenericChange("window", (Number(data.window) || 5) + 1)}
                >
                  +
                </button>
              </div>
              <p className="form-hint">Averages the last {data.window ?? 5} consecutive telemetry readings.</p>
            </div>
          </div>
        )}

        {/* ─── Condition Node Configuration ─── */}
        {isCondition && (
          <div className="config-section">
            <h4 className="config-section-title">EVALUATION THRESHOLD</h4>

            <div className="form-group">
              <label className="form-label">Comparison Operator</label>
              <div className="operator-btn-group">
                {CONDITION_OPERATORS.map((op) => (
                  <button
                    key={op.key}
                    type="button"
                    className={`op-btn ${(data.operator || ">") === op.key ? "active" : ""}`}
                    onClick={() => handleOperatorChange(op.key)}
                    title={op.label}
                  >
                    {op.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Threshold Value</label>
              <input
                type="number"
                step="any"
                className="form-input"
                value={data.value ?? 80}
                onChange={(e) => handleGenericChange("value", Number(e.target.value))}
                placeholder="e.g. 80"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Quick Presets</label>
              <div className="preset-buttons">
                {[50, 75, 80, 85, 100, 120].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`preset-btn ${data.value === preset ? "active" : ""}`}
                    onClick={() => handleGenericChange("value", preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Alert Node Configuration ─── */}
        {isAlert && (
          <div className="config-section">
            <h4 className="config-section-title">ACTION DISPATCH</h4>

            <div className="form-group">
              <label className="form-label">Notification Channel</label>
              <div className="pill-grid">
                {ALERT_ACTIONS.map((act) => (
                  <button
                    key={act.key}
                    type="button"
                    className={`pill-option ${(data.actionType || "SMS") === act.key ? "active" : ""}`}
                    onClick={() => handleActionTypeChange(act.key)}
                  >
                    <span>{act.icon}</span>
                    <span>{act.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {(data.actionType || "SMS") === "SMS" && (
              <div className="form-group">
                <label className="form-label">Recipient Phone Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={data.phone || "+919876543210"}
                  onChange={(e) => handleGenericChange("phone", e.target.value)}
                  placeholder="+919876543210"
                />
              </div>
            )}

            {(data.actionType || "SMS") === "Email" && (
              <div className="form-group">
                <label className="form-label">Recipient Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={data.email || "admin@nexusflow.io"}
                  onChange={(e) => handleGenericChange("email", e.target.value)}
                  placeholder="admin@nexusflow.io"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Severity Level</label>
              <select
                className="form-select"
                value={data.severity || "High"}
                onChange={(e) => handleGenericChange("severity", e.target.value)}
              >
                <option value="Critical">🔴 Critical Alert</option>
                <option value="High">🟠 High Priority</option>
                <option value="Medium">🟡 Medium Priority</option>
                <option value="Info">🔵 Informational</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="config-footer">
        <button
          type="button"
          className="btn-config-secondary"
          onClick={() => onDuplicateNode && onDuplicateNode(id)}
          title="Duplicate selected node"
        >
          📋 Duplicate
        </button>
        <button
          type="button"
          className="btn-config-danger"
          onClick={() => onDeleteNode && onDeleteNode(id)}
          title="Delete selected node"
        >
          🗑️ Delete
        </button>
      </div>
    </aside>
  );
}
