require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const hpp = require('hpp');
const multer = require('multer');

const authRoutes = require('./src/routes/authRoutes');
const postRoutes = require('./src/routes/postRoutes');
const userRoutes = require('./src/routes/userRoutes');
const storyRoutes = require('./src/routes/storyRoutes');
const bookmarkRoutes = require('./src/routes/bookmarkRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const { apiLimiter } = require('./src/middleware/rateLimiters');

const app = express();

// Security headers
app.use(helmet());
// Prevents HTTP parameter pollution (e.g. ?q=a&q=b tricks)
app.use(hpp());
// Blunts scraping / brute-force across the whole API
app.use(apiLimiter);

// Both frontend apps (main site + admin console) need to reach this API.
// Build the allowed-origins list from env vars, with sensible dev defaults.
const normalizeOrigin = (url) => url?.replace(/\/+$/, '');
const allowedOrigins = [
  normalizeOrigin(process.env.CLIENT_URL) || 'http://localhost:5173',
  normalizeOrigin(process.env.ADMIN_URL) || 'http://localhost:5174',
  'https://buzzhive-nine.vercel.app',
  'https://buzzhive-admin.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'buzzhive-api' }));

app.use(['/api/auth', '/auth'], authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 5MB' : err.message;
    return res.status(400).json({ message });
  }
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ message: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`BuzzHive API running on http://localhost:${PORT}`);
});
