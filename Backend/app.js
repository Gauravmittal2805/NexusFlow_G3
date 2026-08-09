const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173'
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: "NexusFlow Backend is running"
    });
});

// Import Routes
const telemetryRoutes = require('./routes/telemetryRoutes');

// Mount Routes
app.use('/api/telemetry', telemetryRoutes);

module.exports = app;
