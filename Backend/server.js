require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app          = require('./app');
const connectDB    = require('./config/db');
const { initWebSocket }  = require('./websocket/telemetrySocket');
const { startSimulator, stopSimulator } = require('./services/telemetrySimulator');

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

    // Start the real-time simulator (replaces the old inline setInterval)
    startSimulator();
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGINT',  () => { stopSimulator(); process.exit(0); });
process.on('SIGTERM', () => { stopSimulator(); process.exit(0); });
