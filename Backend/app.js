const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: "NexusFlow Backend is running"
    });
});
// Routes
app.use('/api/auth', authRoutes);

// REST telemetry endpoint (returns latest mock data)
app.get('/telemetry', (req, res) => {
    res.json({
        success: true,
        data: {
            sensorId: 'TURBINE-001',
            timestamp: new Date().toISOString(),
            temperature: +(78 + Math.random() * 4).toFixed(1),
            pressure: +(118 + Math.random() * 5).toFixed(1),
            humidity: +(40 + Math.random() * 8).toFixed(1),
            rpm: Math.round(1780 + Math.random() * 50),
        },
    });
});

app.get('/telemetry/:sensorId', (req, res) => {
    const { sensorId } = req.params;
    res.json({
        success: true,
        data: {
            sensorId,
            timestamp: new Date().toISOString(),
            temperature: +(78 + Math.random() * 4).toFixed(1),
            pressure: +(118 + Math.random() * 5).toFixed(1),
            humidity: +(40 + Math.random() * 8).toFixed(1),
            rpm: Math.round(1780 + Math.random() * 50),
        },
    });
});

module.exports = app;
