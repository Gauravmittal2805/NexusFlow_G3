const { io } = require("socket.io-client");

// Get client name from command line argument, or default to "Client"
const clientName = process.argv[2] || "Client";

// Connect to the WebSocket server
const socket = io("http://localhost:5005");

socket.on("connect", () => {
    console.log(`[${clientName}] Connected to server`);
});

// Listen to telemetry:update events
socket.on("telemetry:update", (data) => {
    console.log(`\n[${clientName}] Telemetry received:`);
    console.log(data.sensorId);
    console.log(`Temperature: ${data.temperature}°C`);
});

socket.on("disconnect", () => {
    console.log(`\n[${clientName}] Disconnected from server`);
});

socket.on("connect_error", (error) => {
    console.error(`[${clientName}] Connection error:`, error.message);
});
