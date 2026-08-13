require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');

// Connect to database
connectDB();

const PORT = process.env.PORT || 5005;

// Create HTTP server wrapping the Express app
const server = http.createServer(app);

// Attach Socket.IO to the HTTP server
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket', 'polling'],
});

// ─── Simulated sensor state ─────────────────────────────────────────────────

const sensorState = {
    'TURBINE-001': { temperature: 78.5, pressure: 120, humidity: 43, rpm: 1800 },
    'TURBINE-002': { temperature: 82.1, pressure: 115, humidity: 51, rpm: 1740 },
    'TURBINE-003': { temperature: 75.3, pressure: 125, humidity: 38, rpm: 1860 },
};

/** Nudge a value randomly within ±delta, clamped to [min, max] */
function nudge(value, delta, min, max) {
    const next = value + (Math.random() * 2 - 1) * delta;
    return +Math.min(max, Math.max(min, next)).toFixed(1);
}

/** Emit one telemetry:update event for every sensor to all connected clients */
function broadcastTelemetry() {
    const now = new Date().toISOString();

    for (const sensorId of Object.keys(sensorState)) {
        const state = sensorState[sensorId];

        state.temperature = nudge(state.temperature, 1.2, 60, 100);
        state.pressure    = nudge(state.pressure,    3,   90, 150);
        state.humidity    = nudge(state.humidity,    2,   20,  80);
        state.rpm         = +nudge(state.rpm,       30, 1500, 2100).toFixed(0);

        const payload = {
            sensorId,
            timestamp:   now,
            temperature: state.temperature,
            pressure:    state.pressure,
            humidity:    state.humidity,
            rpm:         state.rpm,
        };

        io.emit('telemetry:update', payload);
    }
}

// ─── Socket.IO connection lifecycle ─────────────────────────────────────────

io.on('connection', (socketClient) => {
    console.log(`[Socket.IO] Client connected: ${socketClient.id}`);

    // Send the current snapshot immediately on connect
    const now = new Date().toISOString();
    for (const [sensorId, state] of Object.entries(sensorState)) {
        socketClient.emit('telemetry:update', { sensorId, timestamp: now, ...state });
    }

    socketClient.on('disconnect', (reason) => {
        console.log(`[Socket.IO] Client disconnected: ${socketClient.id} — ${reason}`);
    });
});

// ─── Broadcast telemetry every 2 seconds ────────────────────────────────────

setInterval(broadcastTelemetry, 2000);

// ─── Start server ────────────────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log(`✅  NexusFlow server running on http://localhost:${PORT}`);
    console.log(`🔌  Socket.IO ready — broadcasting telemetry every 2 s`);
});
