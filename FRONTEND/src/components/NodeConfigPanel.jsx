import React from "react";

const SENSOR_METRICS = [
  { key: "temperature", label: "Temperature", icon: "🌡️", unit: "°C" },
  { key: "humidity", label: "Humidity", icon: "💧", unit: "%" },
  { key: "pressure", label: "Pressure", icon: "⏲️", unit: "PSI" },
  { key: "rpm", label: "RPM", icon: "🔄", unit: "RPM" }
];

const SENSOR_PRESETS = [
  "TURBINE-001",
  "TURBINE-002",
  "TURBINE-003",
  "BOILER-101",
  "CHILLER-201",
  "T-001",
  "P-003",
  "H-002",
  "R-004"
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
  { key: ">=", label: "Greater or Equal (>=)", icon: ">=" },
  { key: "<=", label: "Less or Equal (<=)", icon: "<=" },
  { key: "==", label: "Equals (==)", icon: "==" },
  { key: "!=", label: "Not Equals (!=)", icon: "!=" }
];

const ALERT_ACTIONS = [
  { key: "ALERT", label: "Alert", icon: "🚨" },
  { key: "NOTIFICATION", label: "Notification", icon: "🔔" },
  { key: "SMS", label: "SMS Alert", icon: "📱" },
  { key: "EMAIL", label: "Email Alert", icon: "✉️" },
  { key: "SYSTEM", label: "System Log", icon: "📋" }
];

const SEVERITY_LEVELS = [
  { key: "CRITICAL", label: "Critical", icon: "🔴" },
  { key: "HIGH", label: "High", icon: "🟠" },
  { key: "MEDIUM", label: "Medium", icon: "🟡" },
  { key: "LOW", label: "Low", icon: "🔵" },
  { key: "INFO", label: "Info", icon: "⚪" }
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
            <div className="hint-pill">🔌 Data Sources</div>
            <div className="hint-pill">⚙️ Conditions</div>
            <div className="hint-pill">🚨 Actions</div>
            <div className="hint-pill">📈 Operations</div>
          </div>
        </div>
      </aside>
    );
  }

  const { id, type, data = {} } = selectedNode;
  const rawType = (type || "").toLowerCase();

  const isSensor = rawType === "sensor" || rawType === "sensornode";
  const isCondition = rawType === "condition" || rawType === "conditionnode";
  const isAlert =
    rawType === "action" ||
    rawType === "alert" ||
    rawType === "alertnode" ||
    rawType === "notification";
  const isProcessing =
    rawType === "math" ||
    rawType === "mathnode" ||
    rawType === "movingaverage" ||
    rawType === "movingaveragenode" ||
    rawType === "processingnode";

  const handleMetricChange = (metricKey) => {
    const config = SENSOR_METRICS.find((m) => m.key === metricKey) || SENSOR_METRICS[0];
    onUpdateNodeData(id, {
      field: metricKey,
      sensor: metricKey,
      label: `${config.label} Sensor`,
      icon: config.icon,
      unit: config.unit
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
    onUpdateNodeData(id, {
      operator: op,
      label: `Condition (${op} ${data.value ?? 80})`,
      icon: op
    });
  };

  const handleActionTypeChange = (actionType) => {
    const config = ALERT_ACTIONS.find((a) => a.key === actionType) || ALERT_ACTIONS[0];
    onUpdateNodeData(id, {
      action: actionType,
      actionType: actionType,
      label: `${config.label} Action`,
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
              <label className="form-label">Hardware Sensor ID</label>
              <input
                type="text"
                className="form-input"
                value={data.sensorId || data.sensor_id || "TURBINE-001"}
                onChange={(e) => {
                  handleGenericChange("sensorId", e.target.value);
                  handleGenericChange("sensor_id", e.target.value);
                }}
                placeholder="e.g. TURBINE-001"
              />
              <div className="preset-buttons" style={{ marginTop: "6px" }}>
                {SENSOR_PRESETS.slice(0, 5).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`preset-btn ${(data.sensorId || "TURBINE-001") === preset ? "active" : ""}`}
                    onClick={() => {
                      handleGenericChange("sensorId", preset);
                      handleGenericChange("sensor_id", preset);
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Telemetry Field</label>
              <div className="pill-grid">
                {SENSOR_METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`pill-option ${(data.field || data.sensor || "temperature") === m.key ? "active" : ""}`}
                    onClick={() => handleMetricChange(m.key)}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Engineering Unit</label>
              <div className="read-only-badge">
                {data.unit || SENSOR_METRICS.find((m) => m.key === (data.field || "temperature"))?.unit || "°C"}
              </div>
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
                onChange={(e) => {
                  const val = e.target.value === "" ? "" : Number(e.target.value);
                  handleGenericChange("value", val);
                  handleGenericChange("label", `Condition (${data.operator || ">"} ${val})`);
                }}
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
                    onClick={() => {
                      handleGenericChange("value", preset);
                      handleGenericChange("label", `Condition (${data.operator || ">"} ${preset})`);
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Action Node Configuration ─── */}
        {isAlert && (
          <div className="config-section">
            <h4 className="config-section-title">ACTION DISPATCH</h4>

            <div className="form-group">
              <label className="form-label">Action Channel</label>
              <div className="pill-grid">
                {ALERT_ACTIONS.map((act) => (
                  <button
                    key={act.key}
                    type="button"
                    className={`pill-option ${(data.action || data.actionType || "ALERT").toUpperCase() === act.key ? "active" : ""}`}
                    onClick={() => handleActionTypeChange(act.key)}
                  >
                    <span>{act.icon}</span>
                    <span>{act.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Severity Level</label>
              <div className="pill-grid">
                {SEVERITY_LEVELS.map((sev) => (
                  <button
                    key={sev.key}
                    type="button"
                    className={`pill-option ${(data.severity || "HIGH").toUpperCase() === sev.key ? "active" : ""}`}
                    onClick={() => handleGenericChange("severity", sev.key)}
                  >
                    <span>{sev.icon}</span>
                    <span>{sev.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Math / Processing Node Configuration ─── */}
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
