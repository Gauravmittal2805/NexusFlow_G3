# NexusFlow Rule Execution Engine — Architecture & Execution Flow (Steps 1 – 8)

## 1. Rule Structure Overview (Step 1)

Every automation rule in NexusFlow represents an automated telemetry processing pipeline:

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ SENSOR NODE  │ ────► │  CONDITION   │ ────► │ ACTION NODE  │
│ (Data Source)│       │ (Evaluation) │       │ (Alert/Push) │
└──────────────┘       └──────────────┘       └──────────────┘
```

### Example Rule
```
IF temperature > 80
THEN trigger SMS / Email / System Alert
```

---

## 2. Rule Node Types & Responsibilities (Step 2)

| Node Type | Responsibility | Example Payload Data |
|---|---|---|
| **`sensor`** | Specifies the incoming telemetry source and metric (Temperature, Pressure, Humidity, RPM). | `{ "sensor": "temperature", "sensorId": "TURBINE-001" }` |
| **`condition`** | Evaluates incoming telemetry values against configured thresholds (`>`, `<`, `>=`, `<=`, `==`, `!=`). | `{ "field": "temperature", "operator": ">", "value": 80 }` |
| **`filter` / `movingAverage`** | Buffers or transforms stream values across a sample window before evaluation. | `{ "operation": "movingAverage", "window": 5 }` |
| **`action` / `alert`** | Executes the trigger output when conditions evaluate to `TRUE`. | `{ "actionType": "SMS", "phone": "+919876543210", "severity": "High" }` |

---

## 3. Basic Rule Data Structure (Step 3)

Rules are represented as clean directed graphs containing `nodes` and `edges`:

```json
{
  "name": "High Temperature Alert",
  "nodes": [
    {
      "id": "1",
      "type": "sensor",
      "data": {
        "sensor": "temperature",
        "sensorId": "TURBINE-001"
      }
    },
    {
      "id": "2",
      "type": "condition",
      "data": {
        "field": "temperature",
        "operator": ">",
        "value": 80
      }
    },
    {
      "id": "3",
      "type": "action",
      "data": {
        "actionType": "SMS",
        "phone": "+919876543210",
        "severity": "High"
      }
    }
  ],
  "edges": [
    { "source": "1", "target": "2" },
    { "source": "2", "target": "3" }
  ]
}
```

---

## 4. Condition Evaluation Logic (Step 4)

**File:** `Backend/services/conditionEvaluator.js`

Supports comparison operators:
- `>` : Greater Than
- `<` : Less Than
- `>=` : Greater Than or Equal To
- `<=` : Less Than or Equal To
- `==` : Equals
- `!=` : Not Equals

### Evaluation Return Matrix
| Condition | Telemetry Sample | Result | Action Taken |
|---|---|---|---|
| `temperature > 80` | `{ temperature: 85 }` | `TRUE` | Trigger Action |
| `temperature > 80` | `{ temperature: 75 }` | `FALSE` | No Action (Ignored) |
| `temperature < 20` | `{ temperature: 15 }` | `TRUE` | Trigger Action |
| `pressure == 100` | `{ pressure: 100 }` | `TRUE` | Trigger Action |
| `rpm >= 1500` | `{ rpm: 1500 }` | `TRUE` | Trigger Action |
| `rpm >= 1500` | `{ rpm: 1400 }` | `FALSE` | No Action (Ignored) |

---

## 5. Action Handling & Dispatch (Step 5)

**File:** `Backend/services/alertService.js`

When a rule evaluates to `TRUE`:
1. **Dynamic Message Generated:** e.g. `"Temperature of TURBINE-001 exceeded the configured threshold of 80°C. Current reading: 85."`
2. **Alert Document Created in MongoDB:** Persisted with `ruleId`, `sensorId`, `severity`, `status: "unread"`, and `timestamp`.
3. **Real-time Broadcast:** Dispatched to connected frontend clients via WebSocket event `alert:new`.
4. **Cooldown Protection:** 60-second cooldown per `(ruleId:sensorId)` pair suppresses duplicate spam.

---

## 6. Execution Flow Diagram (Step 8)

```
                       ┌───────────────────────────────┐
                       │   Incoming Telemetry Stream   │
                       │ { sensorId, temperature, ...} │
                       └──────────────┬────────────────┘
                                      │
                                      ▼
                       ┌───────────────────────────────┐
                       │      Rule Engine Service      │
                       │     (Fetch Active Rules)      │
                       └──────────────┬────────────────┘
                                      │
                                      ▼
                       ┌───────────────────────────────┐
                       │        Rule Evaluator         │
                       │ (Match Sensor ID & Graph Path)│
                       └──────────────┬────────────────┘
                                      │
                                      ▼
                       ┌───────────────────────────────┐
                       │      Condition Evaluator      │
                       │ (Evaluate field vs threshold) │
                       └──────────────┬────────────────┘
                                      │
                         Is condition satisfied?
                                 /         \
                             YES            NO
                             /                \
                            ▼                  ▼
             ┌─────────────────────────┐   ┌───────────────────────┐
             │       TRUE Path         │   │      FALSE Path       │
             ├─────────────────────────┤   ├───────────────────────┤
             │ 1. Emit rule:triggered  │   │ 1. Log evaluation     │
             │ 2. Create MongoDB Alert │   │ 2. Silently ignore    │
             │ 3. Broadcast Socket.IO  │   │ 3. No action taken    │
             └─────────────────────────┘   └───────────────────────┘
```

---

## 7. Error & Edge Case Handling (Step 7)

The engine never throws unhandled crashes on malformed inputs:
- **Missing Field:** Handled gracefully $\rightarrow$ logs error & returns `false`.
- **Unsupported Operator (e.g. `???`):** Handled gracefully $\rightarrow$ logs error & returns `false`.
- **Missing Value / Nulls:** Handled gracefully $\rightarrow$ returns `false`.
- **Missing Property in Telemetry:** Handled gracefully $\rightarrow$ returns `false`.
- **Unknown Node Type:** Handled gracefully $\rightarrow$ returns `false`.

---

## 8. Running the Test Suite

Run the standalone verification test suite:
```powershell
node Backend/tests/ruleExecutionFlowTest.js
```
