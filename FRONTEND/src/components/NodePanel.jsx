import React from "react";

const NODE_CATEGORIES = [
  {
    title: "DATA SOURCES",
    items: [
      {
        id: "temp",
        nodeType: "sensorNode",
        label: "Temperature",
        icon: "🌡️",
        sensor: "temperature",
        sensorId: "T-001"
      },
      {
        id: "humidity",
        nodeType: "sensorNode",
        label: "Humidity",
        icon: "💧",
        sensor: "humidity",
        sensorId: "H-002"
      },
      {
        id: "pressure",
        nodeType: "sensorNode",
        label: "Pressure",
        icon: "⏲️",
        sensor: "pressure",
        sensorId: "P-003"
      },
      {
        id: "rpm",
        nodeType: "sensorNode",
        label: "RPM",
        icon: "🔄",
        sensor: "rpm",
        sensorId: "R-004"
      }
    ]
  },
  {
    title: "PROCESSING",
    items: [
      {
        id: "mavg",
        nodeType: "processingNode",
        label: "Moving Average",
        icon: "📈",
        window: 5
      },
      {
        id: "avg",
        nodeType: "processingNode",
        label: "Average",
        icon: "📊",
        window: 10
      },
      {
        id: "min",
        nodeType: "processingNode",
        label: "Minimum Window",
        icon: "⬇️",
        window: 5
      },
      {
        id: "max",
        nodeType: "processingNode",
        label: "Maximum Window",
        icon: "⬆️",
        window: 5
      }
    ]
  },
  {
    title: "CONDITIONS",
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
        <h3>Node Library</h3>
        <p className="panel-subtitle">Drag & drop nodes into canvas</p>
      </div>

      <div className="node-categories">
        {NODE_CATEGORIES.map((category) => (
          <div key={category.title} className="category-section">
            <h4 className="category-title">{category.title}</h4>
            <div className="category-items">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className="draggable-node-item"
                  onDragStart={(event) => onDragStart(event, item)}
                  draggable
                >
                  <span className="item-icon">{item.icon}</span>
                  <span className="item-label">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
