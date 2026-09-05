const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const ruleRoutes = require('./routes/ruleRoutes');
const sensorRoutes = require('./routes/sensorRoutes');
const userRoutes = require('./routes/userRoutes');
const alertRoutes = require('./routes/alertRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());

// Trim whitespace from URLs (prevents 404 from trailing spaces in Postman/clients)
app.use((req, res, next) => {
    if (req.url) {
        req.url = req.url.trim();
    }
    next();
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: "NexusFlow Backend is running"
    });
});
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/users', userRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

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
