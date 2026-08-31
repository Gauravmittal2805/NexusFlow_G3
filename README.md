# 🏭 NexusFlow

<div align="center">

![NexusFlow Banner](https://img.shields.io/badge/NexusFlow-Industrial_IoT_Platform-7c3aed?style=for-the-badge)

**Real-Time IoT Telemetry Monitoring & Rule-Based Alert System**

[![React](https://img.shields.io/badge/React-18.x-61dafb?logo=react&logoColor=white)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.x-47a248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![RxJS](https://img.shields.io/badge/RxJS-7.8-b7178c?logo=reactivex&logoColor=white)](https://rxjs.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io&logoColor=white)](https://socket.io/)

[Features](#-key-features) • [Architecture](#-system-architecture) • [Installation](#-installation--setup) • [Usage](#-usage) • [API](#-api-documentation) • [Team](#-development-team)

</div>

---

## 🎯 Project Objective

NexusFlow provides a **flexible, no-code platform** for monitoring real-time industrial telemetry and creating automated rules through an intuitive drag-and-drop interface. Designed for industrial IoT environments, it eliminates the need for backend code changes when configuring new monitoring conditions.

### Main Objectives

- 📡 Monitor industrial sensor data in real time
- 📊 Visualize live telemetry data with interactive charts
- 🧩 Create rules using a visual drag-and-drop interface
- ⚙️ Convert visual rules into executable RxJS pipelines
- 🚨 Generate alerts automatically when conditions are satisfied
- 📋 Maintain comprehensive alert history
- 📈 Provide analytics for telemetry and alerts
- 🔐 Secure the application with JWT authentication
- 👥 Support role-based access control (RBAC)
- 🚀 Scalable architecture for future IoT integrations

---

## ✨ Key Features

### 📡 1. Real-Time Telemetry Monitoring

Monitor industrial sensors with **sub-second latency** using WebSocket connections.

**Supported Parameters:**

| Parameter   | Example      | Unit |
|-------------|--------------|------|
| Temperature | 92.8         | °C   |
| Pressure    | 127.9        | PSI  |
| RPM         | 1899         | RPM  |
| Humidity    | 45.4         | %    |
| Sensor ID   | TURBINE-001  | -    |
| Timestamp   | Real-time    | -    |

### 🖥️ 2. Live Dashboard

Centralized operational view with:

- **Stat Cards**: Total sensors, active rules, unread alerts
- **Live Sensor Cards**: Real-time readings with color-coded status
- **Telemetry Charts**: Temperature, Pressure, Humidity trends
- **RPM Chart**: Separate engine speed visualization
- **Recent Alerts**: Last 5 triggered alerts with navigation
- **System Health**: Connection status, rule engine, telemetry stream
- **Multi-Sensor Selector**: Switch between TURBINE-001, 002, 003...

```
┌──────────────────────────────────────────────────────────┐
│                     NEXUSFLOW DASHBOARD                   │
├──────────────┬──────────────┬────────────────────────────┤
│   Sensors    │ Active Rules │       Unread Alerts        │
│      3       │      5       │           2                │
└──────────────┴──────────────┴────────────────────────────┘

                LIVE SENSOR OVERVIEW

┌─────────────┬─────────────┬─────────────┬──────────────┐
│ Temperature │  Pressure   │     RPM     │   Humidity   │
│   92.8 °C   │ 127.9 PSI   │   1899 RPM  │   45.4 %     │
│    🔴 HIGH  │   ✅ NORMAL │  ⚠️ ELEVATED│  ✅ NORMAL   │
└─────────────┴─────────────┴─────────────┴──────────────┘
```

### 🧩 3. Visual Rule Builder

Create monitoring rules **without writing code** using React Flow.

**Drag & Drop Node Types:**

- 📊 **Sensor Node**: Select data source (TURBINE-001, TURBINE-002...)
- 🔍 **Condition Node**: Define thresholds (>, <, ==, !=, >=, <=)
- ➕ **Math Node**: Perform calculations (add, subtract, multiply, divide)
- 🚨 **Alert Node**: Configure alert severity (HIGH, MEDIUM, LOW)

**Example Rule:**

```
┌─────────────────────┐
│ Temperature Sensor  │
│   TURBINE-001       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Condition: > 80    │
│  Operator: GREATER  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Alert: HIGH       │
│   "Overheating!"    │
└─────────────────────┘
```

### 🧠 4. RxJS Rule Engine

**Real-time reactive processing** using RxJS operators.

**Compilation Pipeline:**

```
React Flow Graph
      ↓
Graph Validator (12 checks)
      ↓
Rule Compiler
      ↓
RxJS Operator Chain
      ↓
Runtime Registry
      ↓
Live Telemetry Stream
      ↓
Condition Evaluation
      ↓
Alert Generation
```

**Features:**

- ✅ Graph validation (cycles, orphans, connections)
- ✅ Sensor-based filtering
- ✅ Field selection (temperature, pressure, rpm, humidity)
- ✅ Error isolation (one rule failure doesn't crash others)
- ✅ Hot reload (update rules without restart)
- ✅ Subscription cleanup (no memory leaks)

### ⚙️ 5. Dynamic Rule Evaluation

Rules evaluate against **live telemetry streams** in real time.

**Example:**

```
Rule: Temperature > 80°C

Incoming: 75°C  →  75 > 80  →  FALSE  →  No Alert

Incoming: 92°C  →  92 > 80  →  TRUE   →  🚨 ALERT!
```

### 🚨 6. Real-Time Alerts

Alerts contain:

- Rule name & ID
- Sensor ID
- Severity (HIGH, MEDIUM, LOW)
- Message
- Triggered value
- Field name
- Timestamp
- Read/Unread status

**Alert Card Example:**

```
┌──────────────────────────────────────────────┐
│ 🔴 HIGH                                      │
│                                              │
│ High Turbine Temperature                     │
│ Temperature exceeded 80°C threshold          │
│                                              │
│ Sensor: TURBINE-001                          │
│ Value: 92°C                                  │
│ Time: 23:39:54                               │
│                                              │
│ [Mark as Read] [View Details →]             │
└──────────────────────────────────────────────┘
```

### 📋 7. Alert History

Complete alert management with:

- **Search**: Filter by rule name, sensor, message
- **Filters**: Severity, status, sensor, date range
- **Bulk Actions**: Mark all as read
- **Pagination**: 10 alerts per page
- **Export**: CSV download (coming soon)

### 📊 8. Analytics

Gain insights with:

- **Telemetry Trends**: Temperature, Pressure, Humidity (3-line chart)
- **RPM Trends**: Separate engine speed chart
- **Metric Selector**: View all metrics or individual ones
- **Time Range Filter**: 1h, 24h, 7d, 30d
- **Sensor Filter**: View all sensors or specific turbine
- **Alert Statistics**: Total, High, Medium, Low counts
- **Sensor Overview**: Live status of all turbines

### ⚙️ 9. Settings

Configure:

- **Profile**: View name, email, role (from AuthContext)
- **Notifications**: Toggle alert notifications & high severity filter
- **Monitoring**: Set default sensor for dashboard
- **Persistence**: Settings saved to localStorage

### 🔐 10. Authentication & Authorization

**JWT-based authentication** with password hashing:

```
Registration:
User → Validate → Hash Password → Store → Success

Login:
User → Verify → Generate JWT → Return Token → Authenticated

Protected Routes:
Request → JWT Middleware → Token Valid? → Role Check → Allow
```

### 👥 11. Role-Based Access Control (RBAC)

**Supported Roles:**

| Role     | Permissions                                      |
|----------|--------------------------------------------------|
| Admin    | Full access, user management, system config      |
| Operator | Create/edit rules, view telemetry, manage alerts |
| Viewer   | View-only access to dashboard and analytics      |

---

## 🏗️ System Architecture

```
                    ┌──────────────────┐
                    │   React Frontend │
                    │                  │
                    │  • Dashboard     │
                    │  • Rule Builder  │
                    │  • Sensors       │
                    │  • Alerts        │
                    │  • Analytics     │
                    │  • Settings      │
                    └─────────┬────────┘
                              │
                    REST API + WebSocket
                              │
                    ┌─────────▼────────┐
                    │ Node.js + Express│
                    │                  │
                    │  • Auth/RBAC     │
                    │  • Telemetry API │
                    │  • Rule API      │
                    │  • Alert API     │
                    └─────────┬────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    ┌─────▼──────┐   ┌────────▼────────┐   ┌─────▼──────┐
    │  MongoDB   │   │  RxJS Engine    │   │ WebSocket  │
    │            │   │                 │   │            │
    │ • Users    │   │ • Compiler      │   │ • Live     │
    │ • Rules    │   │ • Runtime       │   │   Stream   │
    │ • Alerts   │   │ • Evaluator     │   │ • Pub/Sub  │
    │ • Telemetry│   │ • Validator     │   │            │
    └────────────┘   └─────────────────┘   └────────────┘
```

### Data Flow

```
Industrial Sensor
      ↓
Telemetry Data (WebSocket)
      ↓
Node.js Backend
      ├──→ MongoDB (persist)
      └──→ RxJS Telemetry Stream
            ↓
      Rule Runtime Registry
            ↓
      Active Rule Pipelines
            ↓
      Condition Evaluation
            ↓
      ┌─────┴──────┐
    FALSE        TRUE
      │            │
      │            ▼
      │        Alert Service
      │            ↓
      │    ┌───────┼───────┐
      │    ▼       ▼       ▼
      │  Save   WebSocket  Email
      │   DB    Frontend   (future)
      │
      └──→ Continue Monitoring
```

---

## 🛠️ Technology Stack

### Frontend

| Technology | Version | Purpose                           |
|------------|---------|-----------------------------------|
| React      | 18.x    | UI framework                      |
| React Flow | 11.x    | Visual rule builder               |
| Recharts   | 2.x     | Telemetry visualization           |
| Socket.IO  | 4.8     | Real-time WebSocket client        |
| Zustand    | 4.x     | State management                  |
| Vite       | 5.x     | Build tool & dev server           |

### Backend

| Technology | Version | Purpose                           |
|------------|---------|-----------------------------------|
| Node.js    | 18.x    | JavaScript runtime                |
| Express    | 5.x     | REST API framework                |
| RxJS       | 7.8     | Reactive rule processing          |
| Socket.IO  | 4.8     | Real-time WebSocket server        |
| Mongoose   | 8.x     | MongoDB ODM                       |
| JWT        | 9.x     | Authentication tokens             |
| bcrypt     | 6.x     | Password hashing                  |

### Database

| Technology      | Purpose                           |
|-----------------|-----------------------------------|
| MongoDB         | Primary data store                |
| Time-Series     | Optimized telemetry storage       |

---

## 🚀 Installation & Setup

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **MongoDB** >= 7.x (or MongoDB Atlas)
- **Git**

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/NexusFlow.git
cd NexusFlow
```

### 2️⃣ Backend Setup

```bash
cd Backend
npm install
```

Create `.env` file:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/nexusflow
JWT_SECRET=your_super_secret_jwt_key_here_change_in_production
NODE_ENV=development
```

**For MongoDB Atlas:**

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nexusflow?retryWrites=true&w=majority
```

Start backend server:

```bash
npm run dev
```

Backend runs on `http://localhost:5000`

### 3️⃣ Frontend Setup

Open new terminal:

```bash
cd Frontend
npm install
```

Create `.env` file:

```env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=http://localhost:5000
```

Start frontend dev server:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`

### 4️⃣ Access Application

Open browser: **http://localhost:5173**

**Default Test Account:**

```
Email: admin@nexusflow.com
Password: admin123
```

---

## 📖 Usage

### Creating Your First Rule

1. **Navigate** to Rule Builder (`/rules`)
2. **Drag** a Sensor Node to canvas
3. **Configure** sensor: Select `TURBINE-001`
4. **Add** Condition Node and connect
5. **Set** condition: `temperature > 80`
6. **Add** Alert Node and connect
7. **Configure** alert: Severity `HIGH`, Message `"High Temperature"`
8. **Save** rule with name `"High Temp Alert"`
9. **Enable** rule using toggle switch

### Monitoring Live Telemetry

1. **Go to** Dashboard (`/dashboard`)
2. **Select** sensor from dropdown (TURBINE-001)
3. **View** live readings in sensor cards
4. **Monitor** real-time charts (auto-updating)
5. **Check** recent alerts panel

### Viewing Alert History

1. **Navigate** to Alerts (`/alerts`)
2. **Search** by rule name or sensor
3. **Filter** by severity (HIGH/MEDIUM/LOW)
4. **Click** alert card to view details
5. **Mark** as read when resolved

### Analytics

1. **Go to** Analytics (`/analytics`)
2. **Select** time range (1h, 24h, 7d, 30d)
3. **Choose** sensor (All or specific)
4. **View** telemetry trends
5. **Check** alert statistics

---

## 📡 API Documentation

### Authentication

#### Register User

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass123",
  "role": "operator"
}
```

**Response:**

```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "operator"
  }
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepass123"
}
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "operator"
  }
}
```

### Telemetry

#### Post Telemetry Reading

```http
POST /api/telemetry
Authorization: Bearer <token>
Content-Type: application/json

{
  "sensorId": "TURBINE-001",
  "temperature": 92.5,
  "pressure": 127.9,
  "humidity": 45.2,
  "rpm": 1899,
  "timestamp": "2026-08-31T10:30:00Z"
}
```

#### Get Telemetry History

```http
GET /api/telemetry?sensorId=TURBINE-001&limit=100
Authorization: Bearer <token>
```

### Rules

#### Create Rule

```http
POST /api/rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "High Temperature Alert",
  "description": "Alert when temp > 80°C",
  "graph": {
    "nodes": [...],
    "edges": [...]
  },
  "isActive": true
}
```

#### Get All Rules

```http
GET /api/rules
Authorization: Bearer <token>
```

#### Update Rule

```http
PUT /api/rules/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Rule Name",
  "isActive": false
}
```

#### Delete Rule

```http
DELETE /api/rules/:id
Authorization: Bearer <token>
```

#### Get Rule Runtime Status

```http
GET /api/rules/runtime/status
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "running": 5,
  "rules": {
    "rule-id-1": "running",
    "rule-id-2": "running"
  }
}
```

### Alerts

#### Get Alerts

```http
GET /api/alerts?severity=HIGH&status=unread&limit=10
Authorization: Bearer <token>
```

#### Mark Alert as Read

```http
PUT /api/alerts/:id/read
Authorization: Bearer <token>
```

---

## 🧪 Testing

### Manual Testing with Postman

Import the Postman collection: `Backend/NexusFlow_Auth_Collection.json`

**Test Flow:**

```
1. Register → 2. Login → 3. Get Token → 4. Create Rule → 5. Post Telemetry → 6. Verify Alert
```

### Backend Tests

Run telemetry stream tests:

```bash
cd Backend
node tests/telemetryStreamTest.js
```

**Expected Output:**

```
================================================================
   NEXUSFLOW TELEMETRY STREAM — COMPLETE 13-STEP VERIFICATION   
================================================================
✅ PASS [Step 1]: telemetry$ exposes .subscribe()
✅ PASS [Step 2]: TURBINE-001 sub-stream received 2 events
✅ PASS [Step 3]: selectField() extracted temperature: 84.5
...
================================================================
 TEST RESULTS: 58 PASSED, 0 FAILED across all 13 Steps
================================================================
```

### End-to-End Testing

1. **Start both servers** (backend + frontend)
2. **Register** new user
3. **Login** and receive JWT
4. **Create rule** in Rule Builder
5. **Post telemetry** via API or simulator
6. **Verify alert** appears in Dashboard & Alerts page

---

## 📁 Project Structure

```
NexusFlow_G3/
│
├── Backend/
│   ├── config/
│   │   └── db.js                    # MongoDB connection
│   ├── controllers/
│   │   ├── authController.js        # Login, register
│   │   ├── alertController.js       # Alert CRUD
│   │   ├── ruleController.js        # Rule management
│   │   ├── sensorController.js      # Sensor operations
│   │   ├── telemetryController.js   # Telemetry ingestion
│   │   └── userController.js        # User management
│   ├── middleware/
│   │   ├── authMiddleware.js        # JWT verification
│   │   └── roleMiddleware.js        # RBAC checks
│   ├── models/
│   │   ├── User.js                  # User schema
│   │   ├── Rule.js                  # Rule schema
│   │   ├── Alert.js                 # Alert schema
│   │   ├── Sensor.js                # Sensor schema
│   │   └── Telemetry.js             # Telemetry schema
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── alertRoutes.js
│   │   ├── ruleRoutes.js
│   │   ├── sensorRoutes.js
│   │   ├── telemetryRoutes.js
│   │   └── userRoutes.js
│   ├── services/
│   │   ├── telemetryStream.js       # RxJS telemetry bus
│   │   ├── ruleCompiler.js          # Graph → RxJS compiler
│   │   ├── nodeHandlers.js          # Node type processors
│   │   ├── graphValidator.js        # 12-step validation
│   │   ├── ruleRuntime.js           # Runtime registry
│   │   ├── ruleEngineService.js     # Rule orchestration
│   │   ├── alertService.js          # Alert generation
│   │   └── telemetrySimulator.js    # Mock data generator
│   ├── compiler/
│   │   └── graphValidator.js        # Validation logic
│   ├── tests/
│   │   └── telemetryStreamTest.js   # 58 test suite
│   ├── websocket/
│   │   └── telemetrySocket.js       # Socket.IO setup
│   ├── .env.example
│   ├── server.js                    # Express + Socket.IO
│   ├── app.js                       # Express app
│   └── package.json
│
├── Frontend/
│   ├── public/
│   │   ├── favicon.ico
│   │   └── favicon.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── AlertCard.jsx
│   │   │   ├── DashboardLayout.jsx
│   │   │   ├── Navbar.jsx
│   │   │   ├── RecentAlerts.jsx
│   │   │   ├── RPMChart.jsx
│   │   │   ├── SensorCard.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── TelemetryChart.jsx
│   │   │   └── ruleNodes/
│   │   │       ├── SensorNode.jsx
│   │   │       ├── ConditionNode.jsx
│   │   │       ├── MathNode.jsx
│   │   │       └── AlertNode.jsx
│   │   ├── context/
│   │   │   ├── AlertContext.jsx     # Alert state
│   │   │   ├── AuthContext.jsx      # User state
│   │   │   └── TelemetryContext.jsx # WebSocket + data
│   │   ├── layouts/
│   │   │   └── DashboardLayout.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        # Main dashboard
│   │   │   ├── RuleBuilder.jsx      # Visual rule editor
│   │   │   ├── Sensors.jsx          # Sensor management
│   │   │   ├── Alerts.jsx           # Alert history
│   │   │   ├── Analytics.jsx        # Charts & stats
│   │   │   ├── Settings.jsx         # User settings
│   │   │   ├── Login.jsx
│   │   │   └── Register.jsx
│   │   ├── routes/
│   │   │   └── ProtectedRoute.jsx
│   │   ├── services/
│   │   │   ├── api.js               # Axios instance
│   │   │   ├── authService.js
│   │   │   ├── ruleService.js
│   │   │   ├── alertService.js
│   │   │   └── telemetryService.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css               # Global styles
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md                         # This file
```

---

## 🔐 Security Best Practices

✅ **Implemented:**

- JWT authentication with secure secret keys
- Password hashing using bcrypt (cost factor: 10)
- Protected API routes with middleware
- Role-based authorization (Admin, Operator, Viewer)
- Input validation on backend
- CORS configuration
- Environment variables for secrets
- MongoDB injection prevention via Mongoose

⚠️ **Production Recommendations:**

- Enable HTTPS/TLS for all connections
- Use MongoDB Atlas with IP whitelisting
- Implement rate limiting (express-rate-limit)
- Add request sanitization (express-mongo-sanitize)
- Set secure cookie flags
- Enable helmet.js security headers
- Implement refresh token rotation
- Add audit logging for sensitive operations

---

## 📈 Performance & Scalability

### Current Architecture

- **Telemetry Processing**: RxJS streams handle 1000+ events/sec
- **WebSocket Connections**: Socket.IO supports 10,000+ concurrent clients
- **Rule Engine**: Parallel execution, isolated error handling
- **Database**: MongoDB indexes on sensorId, timestamp, ruleId

### Scaling Strategies

**Horizontal Scaling:**

```
Load Balancer
      ↓
┌──────┬──────┬──────┐
│ App1 │ App2 │ App3 │
└──────┴──────┴──────┘
      ↓
MongoDB Replica Set
```

**Future Enhancements:**

- Redis for session storage
- Message queue (RabbitMQ/Kafka) for telemetry ingestion
- Microservices architecture
- Kubernetes deployment
- Time-series database (InfluxDB/TimescaleDB)

---

## 🐛 Troubleshooting

### MongoDB Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution:**

```bash
# Check MongoDB is running
mongod --version

# Start MongoDB
sudo systemctl start mongod  # Linux
brew services start mongodb-community  # macOS
```

### JWT Token Invalid

```
Error: jwt malformed
```

**Solution:**

- Check JWT_SECRET is set in `.env`
- Verify token format: `Bearer <token>`
- Ensure token hasn't expired (24h default)

### WebSocket Connection Failed

```
WebSocket connection to 'ws://localhost:5000' failed
```

**Solution:**

- Verify backend is running on port 5000
- Check VITE_WS_URL in frontend `.env`
- Ensure Socket.IO CORS is configured

### Rule Not Triggering

**Checklist:**

- ✅ Rule is enabled (isActive: true)
- ✅ Rule compiled without errors
- ✅ Telemetry data matches sensor ID
- ✅ Condition threshold is correct
- ✅ Check backend logs for evaluation traces

---

## 🗺️ Roadmap

### Phase 1: Core Features ✅ (Completed)

- [x] Authentication & Authorization
- [x] Real-time telemetry streaming
- [x] Visual rule builder
- [x] RxJS rule engine
- [x] Alert system
- [x] Dashboard & Analytics

### Phase 2: Enhanced Features 🚧 (In Progress)

- [ ] Email notifications
- [ ] SMS alerts
- [ ] Webhook integrations
- [ ] Rule templates
- [ ] Multi-condition rules (AND/OR)
- [ ] Rule versioning

### Phase 3: Enterprise Features 🔮 (Planned)

- [ ] Multi-tenant support
- [ ] Advanced RBAC (custom roles)
- [ ] Audit logs
- [ ] Report generation (PDF/Excel)
- [ ] Machine learning anomaly detection
- [ ] Predictive maintenance alerts
- [ ] Mobile app (React Native)

---

## 👨‍💻 Development Team

<table>
  <tr>
    <td align="center">
      <strong>Member 1</strong><br>
      Backend & Database<br>
      <small>MongoDB, Authentication, RBAC</small>
    </td>
    <td align="center">
      <strong>Member 2</strong><br>
      Rule Engine<br>
      <small>RxJS, Compiler, Evaluator</small>
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>Member 3</strong><br>
      Rule Builder<br>
      <small>React Flow, Graph Management</small>
    </td>
    <td align="center">
      <strong>Member 4</strong><br>
      Frontend Integration<br>
      <small>Dashboard, Analytics, Settings</small>
    </td>
  </tr>
</table>

### Team Contributions

| Member   | Responsibility                                      | Key Deliverables                          |
|----------|-----------------------------------------------------|-------------------------------------------|
| Member 1 | Backend, MongoDB, Auth                              | User model, JWT, RBAC, API routes         |
| Member 2 | Rule Engine, Logic Compiler                         | RxJS streams, compiler, runtime registry  |
| Member 3 | React Flow Rule Builder, Rule Management            | Visual editor, node types, graph saving   |
| Member 4 | Dashboard, Analytics, Settings, Frontend Integration| Live charts, alerts, system health        |

---

## 📜 License

This project was developed as part of an **internship training project** at:

**Infotact Solutions**  
Electronic City Phase 1, Bengaluru, Karnataka  
[www.infotactsolutions.com](https://www.infotactsolutions.com)

© 2026 NexusFlow Team. All rights reserved.

---

## 🙏 Acknowledgments

- **Infotact Solutions** for mentorship and guidance
- **React Flow** for the visual graph editor
- **RxJS** for reactive programming patterns
- **MongoDB** for flexible data storage
- **Socket.IO** for real-time communication

---

## 📞 Contact & Support

**For questions or support:**

- 📧 Email: support@nexusflow.io (example)
- 💬 Issues: [GitHub Issues](https://github.com/your-username/NexusFlow/issues)
- 📖 Docs: [Project Wiki](https://github.com/your-username/NexusFlow/wiki)

---

<div align="center">

## ⭐ NexusFlow Data Flow

```
📡 COLLECT → ⚙️ PROCESS → 🧠 EVALUATE → 🚨 ALERT → 📊 ANALYZE → 🏭 MONITOR
```

**Turning real-time telemetry into intelligent, actionable monitoring.**

---

Made with ❤️ by the NexusFlow Team

[![GitHub](https://img.shields.io/badge/GitHub-NexusFlow-181717?logo=github)](https://github.com/your-username/NexusFlow)
[![License](https://img.shields.io/badge/License-Infotact_Solutions-blue)](https://www.infotactsolutions.com)

</div>
