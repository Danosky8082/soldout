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

// ✅ Corrected paths: no extra 'src/' because server.js is inside 'src'
const videoRoutes = require('./routes/videoRoutes');
const interactionRoutes = require('./routes/interactionRoutes');
const authRoutes = require('./routes/authRoutes'); // Make sure this exists

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

// Register (with profile picture) – direct handler (redundant but kept for compatibility)
app.post('/api/auth/register', upload.single('profilePicture'), async (req, res) => {
  try {
    const { firstName, lastName, email, password, isAdmin, role } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let profilePictureUrl = null;
    if (req.file) {
      profilePictureUrl = await uploadToSupabase(req.file, 'profiles');
    }

    const newUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        isAdmin: isAdmin === 'true',
        role: role || 'USER',
        profilePicture: profilePictureUrl,
      }
    });

    const token = jwt.sign(
      { 
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        isAdmin: newUser.isAdmin 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({ 
      user: {
        id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
        isAdmin: newUser.isAdmin,
        profilePicture: newUser.profilePicture
      },
      token 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Admin Login
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const admin = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        isAdmin: true,
        profilePicture: true
      }
    });
    if (!admin || !admin.isAdmin) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    const token = jwt.sign(
      { 
        id: admin.id,
        email: admin.email,
        role: admin.role,
        isAdmin: true 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    const adminData = {
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: admin.role,
      isAdmin: admin.isAdmin,
      profilePicture: admin.profilePicture,
      token
    };
    res.json(adminData);
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Failed to process admin login' });
  }
});

// ============================================================
//  USER ROUTES (profile, update, picture)
// ============================================================
app.get('/api/users/:id/profile', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
        createdAt: true,
        bio: true,
        role: true,
        videos: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            videoUrl: true,
            genre: true,
            views: true,
            createdAt: true,
            _count: {
              select: {
                likes: {
                  where: { type: 'LIKE' }
                },
                subscriptions: true,
                comments: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const totalViews = user.videos.reduce((sum, video) => sum + video.views, 0);
    const totalLikes = user.videos.reduce((sum, video) => sum + video._count.likes, 0);
    const totalSubscribers = await prisma.subscription.count({
      where: { creatorId: userId }
    });
    const response = {
      ...user,
      stats: {
        videos: user.videos.length,
        views: totalViews,
        likes: totalLikes,
        subscribers: totalSubscribers
      }
    };
    res.json(response);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { firstName, lastName, email, bio } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to update this profile' });
    }
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name and email are required' });
    }
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        email,
        bio
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
        bio: true,
        createdAt: true
      }
    });
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/users/:id/profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to update this profile' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const profilePictureUrl = await uploadToSupabase(req.file, 'profiles');

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { profilePicture: profilePictureUrl },
      select: {
        id: true,
        profilePicture: true
      }
    });

    res.json({ 
      profilePictureUrl: updatedUser.profilePicture,
      message: 'Profile picture updated successfully'
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

// ============================================================
//  VIDEO ROUTES – Mount once!
// ============================================================
app.use('/api/videos', videoRoutes);

// ============================================================
//  INTERACTION ROUTES – Mount once!
// ============================================================
app.use('/api/interactions', interactionRoutes);

// ============================================================
//  ADMIN ROUTES (dashboard, pending, approve, reject, etc.)
// ============================================================
app.get('/api/admin/dashboard', adminAuth, async (req, res) => {
  try {
    const [pendingVideos, approvedVideos, rejectedVideos, totalUsers] = await Promise.all([
      prisma.video.count({ where: { status: 'PENDING' } }),
      prisma.video.count({ where: { status: 'APPROVED' } }),
      prisma.video.count({ where: { status: 'REJECTED' } }),
      prisma.user.count()
    ]);
    res.json({
      pendingVideos,
      approvedVideos,
      rejectedVideos,
      totalUsers
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

app.get('/api/admin/videos/pending', adminAuth, async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Pending videos error:', error);
    res.status(500).json({ error: 'Failed to fetch pending videos' });
  }
});

app.get('/api/admin/videos/approved', adminAuth, async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'APPROVED' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { approvedAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Approved videos error:', error);
    res.status(500).json({ error: 'Failed to fetch approved videos' });
  }
});

app.get('/api/admin/videos/rejected', adminAuth, async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'REJECTED' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { rejectedAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Rejected videos error:', error);
    res.status(500).json({ error: 'Failed to fetch rejected videos' });
  }
});

app.get('/api/admin/videos/:id', adminAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json(video);
  } catch (error) {
    console.error('Video by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch video details' });
  }
});

app.post('/api/admin/videos/:id/approve', adminAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const video = await prisma.video.update({
      where: { id: videoId },
      data: { 
        status: 'APPROVED',
        approvedAt: new Date() 
      }
    });
    res.json(video);
  } catch (error) {
    console.error('Approve video error:', error);
    res.status(500).json({ error: 'Failed to approve video' });
  }
});

app.post('/api/admin/videos/:id/reject', adminAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const { reason } = req.body;
    const video = await prisma.video.update({
      where: { id: videoId },
      data: { 
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason 
      }
    });
    res.json(video);
  } catch (error) {
    console.error('Reject video error:', error);
    res.status(500).json({ error: 'Failed to reject video' });
  }
});

app.post('/api/admin/videos/:id/unpublish', adminAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const video = await prisma.video.update({
      where: { id: videoId },
      data: { 
        status: 'PENDING',
        approvedAt: null
      }
    });
    res.json(video);
  } catch (error) {
    console.error('Unpublish video error:', error);
    res.status(500).json({ error: 'Failed to unpublish video' });
  }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isBanned: true,
        createdAt: true,
        _count: {
          select: { videos: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/admins', adminAuth, async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        createdAt: true,
        lastLogin: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(admins);
  } catch (error) {
    console.error('Admin list error:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

app.put('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { firstName, lastName, email, role } = req.body;
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        email,
        role
      }
    });
    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/api/admin/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { isBanned } = req.body;
    if (isBanned) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });
      if (user.role === 'ADMIN' && req.admin.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only super admins can ban other admins' });
      }
    }
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isBanned }
    });
    res.json(updatedUser);
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ error: 'Failed to update user ban status' });
  }
});

app.post('/api/admin/users/:id/unban', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: false }
    });
    res.json(updatedUser);
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

app.delete('/api/admin/admins/:id', adminAuth, async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const requestingAdmin = await prisma.user.findUnique({
      where: { id: req.admin.id },
      select: { role: true }
    });
    if (requestingAdmin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only super admins can delete other admins' });
    }
    const targetAdmin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { role: true }
    });
    if (!targetAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    if (targetAdmin.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot delete super admin' });
    }
    await prisma.user.delete({
      where: { id: adminId }
    });
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

app.post('/api/admin/change-password', adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { password: true }
    });
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    const validPassword = await bcrypt.compare(currentPassword, admin.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: adminId },
      data: { password: hashedPassword }
    });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============================================================
//  DELETE VIDEO ENDPOINT (redundant – already in videoRoutes, but kept for admin)
// ============================================================
app.delete('/api/videos/:id', async (req, res) => {
  // This is already defined in videoRoutes, but if you want admin-only delete, you can keep this.
  // To avoid duplicate routes, comment this out or remove.
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