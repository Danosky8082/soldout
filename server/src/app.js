// server/src/app.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videoRoutes');
const fs = require('fs');

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:3000', // Update with your client URL
  credentials: true
}));

// Increase payload limit
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Serve static files
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '../../client/public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;