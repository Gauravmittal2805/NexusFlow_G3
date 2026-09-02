const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const ruleRoutes = require('./routes/ruleRoutes');
const sensorRoutes = require('./routes/sensorRoutes');
const userRoutes = require('./routes/userRoutes');
const alertRoutes = require('./routes/alertRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
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
app.use('/telemetry', telemetryRoutes);

module.exports = app;
