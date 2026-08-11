require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { initWebSocket } = require('./websocket/telemetrySocket');

// Connect to database
connectDB();

// Create HTTP server instead of using Express app directly
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for the test client
        methods: ["GET", "POST"]
    }
});

// Setup WebSocket events
initWebSocket(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
