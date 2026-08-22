import React from "react";

const NODE_CATEGORIES = [
  {
    title: "DATA SOURCES",
    badge: "Input",
    items: [
      {
        id: "temp",
        nodeType: "sensorNode",
        label: "Temperature",
        icon: "🌡️",
        sensor: "temperature",
        sensorId: "T-001",
        unit: "°C"
      },
      {
        id: "pressure",
        nodeType: "sensorNode",
        label: "Pressure",
        icon: "⏲️",
        sensor: "pressure",
        sensorId: "P-003",
        unit: "PSI"
      },
      {
        id: "humidity",
        nodeType: "sensorNode",
        label: "Humidity",
        icon: "💧",
        sensor: "humidity",
        sensorId: "H-002",
        unit: "%"
      },
      {
        id: "rpm",
        nodeType: "sensorNode",
        label: "RPM",
        icon: "🔄",
        sensor: "rpm",
        sensorId: "R-004",
        unit: "RPM"
      }
    ]
  },
  {
    title: "OPERATIONS",
    badge: "Process",
    items: [
      {
        id: "mavg",
        nodeType: "movingAverageNode",
        label: "Moving Avg",
        icon: "📈",
        operation: "movingAverage",
        window: 5
      },
      {
        id: "avg",
        nodeType: "movingAverageNode",
        label: "Average",
        icon: "📊",
        operation: "average",
        window: 10
      },
      {
        id: "min",
        nodeType: "movingAverageNode",
        label: "Minimum",
        icon: "⬇️",
        operation: "minimum",
        window: 5
      },
      {
        id: "max",
        nodeType: "movingAverageNode",
        label: "Maximum",
        icon: "⬆️",
        operation: "maximum",
        window: 5
      }
    ]
  },
  {
    title: "CONDITIONS",
    badge: "Evaluate",
    items: [
      {
        id: "gt",
        nodeType: "conditionNode",
        label: "Greater Than",
        icon: ">",
        operator: ">",
        value: 80
      },
      {
        id: "lt",
        nodeType: "conditionNode",
        label: "Less Than",
        icon: "<",
        operator: "<",
        value: 20
      },
      {
        id: "gte",
        nodeType: "conditionNode",
        label: "Greater Equal",
        icon: ">=",
        operator: ">=",
        value: 90
      },
      {
        id: "eq",
        nodeType: "conditionNode",
        label: "Equals",
        icon: "=",
        operator: "=",
        value: 50
      }
    ]
  },
  {
    title: "ACTIONS",
    badge: "Output",
    items: [
      {
        id: "sms",
        nodeType: "alertNode",
        label: "SMS Alert",
        icon: "📱",
        actionType: "SMS",
        phone: "+919876543210",
        severity: "High"
      },
      {
        id: "email",
        nodeType: "alertNode",
        label: "Email Alert",
        icon: "✉️",
        actionType: "Email",
        email: "admin@nexusflow.io",
        severity: "Medium"
      },
      {
        id: "alert",
        nodeType: "alertNode",
        label: "System Alert",
        icon: "🚨",
        actionType: "System",
        severity: "Critical"
      }
    ]
  }
];

export default function NodePanel() {
  const onDragStart = (event, nodeData) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="node-library-panel">
      <div className="panel-header">
        <div className="panel-header-icon">🧩</div>
        <div>
          <h3>Node Library</h3>
          <p className="panel-subtitle">Drag & drop onto canvas</p>
        </div>
      </div>

      <div className="node-categories">
        {NODE_CATEGORIES.map((category) => (
          <div key={category.title} className="category-section">
            <div className="category-header-row">
              <h4 className="category-title">{category.title}</h4>
              <span className={`category-badge ${category.badge.toLowerCase()}`}>
                {category.badge}
              </span>
            </div>
            <div className="category-items">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className="draggable-node-item"
                  onDragStart={(event) => onDragStart(event, item)}
                  draggable
                  title={`Drag ${item.label} to canvas`}
                >
                  <span className="item-icon">{item.icon}</span>
                  <span className="item-label">{item.label}</span>
                  <span className="drag-handle-dots">⋮⋮</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
