require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app           = require('./app');
const connectDB     = require('./config/db');
const { initWebSocket }   = require('./websocket/telemetrySocket');
const { startSimulator, stopSimulator } = require('./services/telemetrySimulator');
const { seedSensors }       = require('./utils/seedSensors');

// ── Single authoritative rule engine ─────────────────────────────────────────
// ruleRuntime is the only engine that compiles rules and subscribes pipelines
// to telemetry$. rxjsRuleEngine is no longer activated at startup — this
// eliminates the duplicate-subscription problem that was causing double alerts.
const { activateAll, deactivateAll } = require('./engine/ruleRuntime');

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5005;

const server = http.createServer(app);

// ─── Socket.IO setup ─────────────────────────────────────────────────────────

const io = new Server(server, {
    cors: {
        origin:      process.env.CLIENT_URL || 'http://localhost:5173',
        methods:     ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket', 'polling'],
});

// Register the shared io instance so services can call getIo()
initWebSocket(io);

// ─── Start server then DB then simulator ─────────────────────────────────────

server.listen(PORT, async () => {
    console.log(`✅  NexusFlow server running on http://localhost:${PORT}`);
    console.log(`🔌  Socket.IO ready`);

    // Connect to MongoDB first — the simulator needs it to persist readings
    await connectDB();

    // Ensure default turbine fleet sensors exist in database
    await seedSensors();

    // Start the single authoritative rule engine — compile all active rules
    // into RxJS pipelines subscribed to telemetry$
    await activateAll();

    // Start the real-time simulator
    startSimulator();
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Step 9: Clean up all active rule subscriptions from both engines before exit

function gracefulShutdown() {
    deactivateAll();       // ruleRuntime: stop all running rule pipelines
    stopSimulator();       // telemetrySimulator: stop data generation
    process.exit(0);
}

process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

