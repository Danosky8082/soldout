const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors');
const fs = require('fs');
const { PrismaClient, LikeType } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

// ✅ Corrected paths
const videoRoutes = require('./routes/videoRoutes');
const interactionRoutes = require('./routes/interactionRoutes');
const authRoutes = require('./routes/authRoutes');

// ===== DIAGNOSTIC: List all files in the routes folder =====
console.log('\n=== ROUTES FOLDER CONTENTS ===');
try {
    const routeFiles = fs.readdirSync(path.join(__dirname, 'routes'));
    console.log('Files in routes folder:', routeFiles);
} catch (err) {
    console.error('ERROR reading routes folder:', err.message);
}
console.log('================================\n');

// ===== NOW try to load adminRoutes =====
let adminRoutes;
try {
    adminRoutes = require('./routes/adminRoutes');
    console.log('✅ adminRoutes loaded successfully.');
} catch (err) {
    console.error('❌ Failed to load adminRoutes:', err.message);
    adminRoutes = null;
}

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const prisma = new PrismaClient();
const app = express();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ====== MULTER: Memory Storage ======
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
const videoUpload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// ====== PATHS ======
const PROJECT_ROOT = path.join(__dirname, '../..');
const CLIENT_PUBLIC_DIR = path.join(PROJECT_ROOT, 'client', 'public');

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors({ origin: '*', credentials: true }));

// ============================================================
//  HELPER: Upload to Supabase
// ============================================================
async function uploadToSupabase(file, folder) {
  const fileExt = path.extname(file.originalname);
  const fileName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
  const { data, error } = await supabase.storage
    .from('uploads')
    .upload(fileName, file.buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.mimetype,
    });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);
  return publicUrl;
}

// ============================================================
//  SUPER ADMIN CHECK
// ============================================================
async function checkSuperAdmin() {
  const superAdminEmail = 'superadmin@example.com';
  try {
    const existing = await prisma.user.findUnique({
      where: { email: superAdminEmail }
    });
    if (!existing) {
      const hashedPassword = await bcrypt.hash('ChangeThisPassword123!', 12);
      await prisma.user.create({
        data: {
          email: superAdminEmail,
          password: hashedPassword,
          firstName: 'Super',
          lastName: 'Admin',
          isAdmin: true,
          role: 'SUPER_ADMIN'
        }
      });
      console.log('Initial Super Admin created');
    }
  } catch (error) {
    console.error('Super Admin creation error:', error);
  }
}

// ============================================================
//  ADMIN AUTH MIDDLEWARE
// ============================================================
const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authorization required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { isAdmin: true, role: true }
    });
    if (!admin || !admin.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(401).json({ error: 'Invalid admin token' });
  }
};

// ============================================================
//  PUBLIC ROUTES
// ============================================================
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Soldout API' });
});

app.get('/admin', (req, res) => {
  const adminFile = path.join(CLIENT_PUBLIC_DIR, 'admin.html');
  if (!fs.existsSync(adminFile)) {
    console.error('Admin file not found at:', adminFile);
    return res.status(404).send('Admin dashboard not found');
  }
  res.sendFile(adminFile);
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Soldout API Documentation',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        adminLogin: 'POST /api/auth/admin/login',
        adminRegister: 'POST /api/admin/register'
      },
      admin: {
        dashboard: 'GET /api/admin/dashboard',
        pendingVideos: 'GET /api/admin/videos/pending',
        approvedVideos: 'GET /api/admin/videos/approved',
        rejectedVideos: 'GET /api/admin/videos/rejected',
        approveVideo: 'POST /api/admin/videos/:id/approve',
        rejectVideo: 'POST /api/admin/videos/:id/reject',
        listUsers: 'GET /api/admin/users',
        banUser: 'POST /api/admin/users/:id/ban',
        admins: 'GET /api/admin/admins'
      },
      videos: {
        upload: 'POST /api/videos/upload',
        premium: 'GET /api/videos/premium',
        trending: 'GET /api/videos/trending',
        byId: 'GET /api/videos/:id',
        updateSynopsis: 'POST /api/videos/:id/synopsis',
        trivia: 'GET /api/videos/:id/trivia'
      },
      interactions: {
        like: 'POST /api/interactions/like',
        comment: 'POST /api/interactions/comment',
        reply: 'POST /api/interactions/reply',
        subscribe: 'POST /api/interactions/subscribe',
        rate: 'POST /api/interactions/rate',
        trivia: 'POST /api/interactions/trivia'
      },
      users: {
        profile: 'GET /api/users/:id/profile',
        update: 'PUT /api/users/:id',
        profilePicture: 'POST /api/users/:id/profile-picture'
      }
    }
  });
});

// ============================================================
//  AUTH ROUTES
// ============================================================
app.use('/api/auth', authRoutes);

// ============================================================
//  ADMIN ROUTES – Mount the modular admin routes (if loaded)
// ============================================================
if (adminRoutes) {
  app.use('/api/admin', adminRoutes);
  console.log('✅ Admin routes mounted.');
} else {
  console.warn('⚠️ Admin routes NOT mounted because adminRoutes could not be loaded.');
}

// ============================================================
//  ADDITIONAL ADMIN ENDPOINT: /me (session check)
// ============================================================
app.get('/api/auth/admin/me', adminAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.admin.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        isAdmin: true,
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Admin /me error:', error);
    res.status(500).json({ error: 'Failed to fetch admin data' });
  }
});

// ============================================================
//  VIDEO & INTERACTION ROUTES
// ============================================================
app.use('/api/videos', videoRoutes);
app.use('/api/interactions', interactionRoutes);

// ============================================================
//  USER ROUTES (profile, update, picture) – keep these
// ============================================================
app.get('/api/users/:id/profile', async (req, res) => {
  // ... unchanged ...
});

app.put('/api/users/:id', async (req, res) => {
  // ... unchanged ...
});

app.post('/api/users/:id/profile-picture', upload.single('profilePicture'), async (req, res) => {
  // ... unchanged ...
});

// ============================================================
//  STATIC FILES & CATCH-ALL
// ============================================================
app.use(express.static(CLIENT_PUBLIC_DIR));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(CLIENT_PUBLIC_DIR, 'index.html'));
});

// ============================================================
//  ERROR HANDLING
// ============================================================
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 5000;

checkSuperAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Serving static files from: ${CLIENT_PUBLIC_DIR}`);
  });
});