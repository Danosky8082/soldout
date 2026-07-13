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

// ====== MULTER: Memory Storage (for Supabase uploads) ======
const storage = multer.memoryStorage();

// For profile picture (max 5MB)
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// For video upload (max 2GB)
const videoUpload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

// ====== PATHS ======
const PROJECT_ROOT = path.join(__dirname, '../..');
const CLIENT_PUBLIC_DIR = path.join(PROJECT_ROOT, 'client', 'public');

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(cors({
  origin: '*',
  credentials: true
}));

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
  // CORRECT: use publicUrl (lowercase u)
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

// Root
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Soldout API' });
});

// Admin HTML (static)
app.get('/admin', (req, res) => {
  const adminFile = path.join(CLIENT_PUBLIC_DIR, 'admin.html');
  if (!fs.existsSync(adminFile)) {
    console.error('Admin file not found at:', adminFile);
    return res.status(404).send('Admin dashboard not found');
  }
  res.sendFile(adminFile);
});

// API Documentation
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
//  AUTH ROUTES (NOW WITH ROUTER MOUNT)
// ============================================================

// ***** FIX: Mount the external auth router *****
app.use('/api/auth', require('./routes/authRoutes'));

// Register (with profile picture) – direct handler (redundant but kept)
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
//  USER ROUTES
// ============================================================

// Get profile (including videos)
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
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const totalViews = user.videos.reduce((sum, video) => sum + video.views, 0);
    const totalLikes = user.videos.reduce((sum, video) => sum + video._count.likes, 0);
    const totalSubscribers = await prisma.subscription.count({
      where: {
        creatorId: userId
      }
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

// Update user profile
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

// Update profile picture (Supabase)
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
//  VIDEO ROUTES (with Supabase uploads)
// ============================================================

// Mount video routes from separate file
app.use('/api/videos', require('./routes/videoRoutes'));

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
//  INTERACTION ROUTES (like, comment, reply, subscribe, rate, trivia)
// ============================================================

app.post('/api/interactions/like', async (req, res) => {
  try {
    const { userId, videoId, commentId, replyId, isLiked, type } = req.body;
    if (!userId || (!videoId && !commentId && !replyId)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    let targetExists = false;
    let targetType = '';
    if (commentId) {
      const comment = await prisma.comment.findUnique({
        where: { id: parseInt(commentId) }
      });
      targetExists = !!comment;
      targetType = 'COMMENT';
    } else if (replyId) {
      const reply = await prisma.reply.findUnique({
        where: { id: parseInt(replyId) }
      });
      targetExists = !!reply;
      targetType = 'REPLY';
    } else if (videoId) {
      const video = await prisma.video.findUnique({
        where: { id: parseInt(videoId) }
      });
      targetExists = !!video;
      targetType = 'VIDEO';
    }
    if (!targetExists) {
      return res.status(404).json({ 
        error: 'TARGET_NOT_FOUND',
        message: 'The item you\'re trying to like no longer exists' 
      });
    }
    const existingLike = await prisma.like.findFirst({
      where: {
        userId: parseInt(userId),
        videoId: videoId ? parseInt(videoId) : null,
        commentId: commentId ? parseInt(commentId) : null,
        replyId: replyId ? parseInt(replyId) : null,
      }
    });
    if (existingLike) {
      await prisma.like.delete({
        where: { id: existingLike.id }
      });
      const likeCount = await prisma.like.count({
        where: {
          videoId: videoId ? parseInt(videoId) : null,
          commentId: commentId ? parseInt(commentId) : null,
          replyId: replyId ? parseInt(replyId) : null,
        }
      });
      return res.json({ 
        action: 'removed',
        liked: false,
        likeCount,
        type: targetType
      });
    } else {
      await prisma.like.create({
        data: {
          type: type || 'LIKE',
          userId: parseInt(userId),
          videoId: videoId ? parseInt(videoId) : null,
          commentId: commentId ? parseInt(commentId) : null,
          replyId: replyId ? parseInt(replyId) : null
        }
      });
      const likeCount = await prisma.like.count({
        where: {
          videoId: videoId ? parseInt(videoId) : null,
          commentId: commentId ? parseInt(commentId) : null,
          replyId: replyId ? parseInt(replyId) : null,
        }
      });
      return res.json({ 
        action: 'created',
        liked: true,
        likeCount,
        type: targetType
      });
    }
  } catch (error) {
    console.error('Like interaction error:', error);
    if (error.code === 'P2003') {
      return res.status(404).json({ 
        error: 'TARGET_NOT_FOUND',
        message: 'The item you\'re trying to like no longer exists'
      });
    }
    res.status(500).json({ 
      error: 'LIKE_ERROR',
      message: 'Failed to process like interaction'
    });
  }
});

app.post('/api/interactions/comment', async (req, res) => {
  try {
    const { text, userId, videoId } = req.body;
    if (!text || !userId || !videoId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const comment = await prisma.comment.create({
      data: {
        text,
        userId: parseInt(userId),
        videoId: parseInt(videoId)
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    res.json(comment);
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

app.post('/api/interactions/reply', async (req, res) => {
  try {
    const { text, userId, commentId, videoId, parentReplyId } = req.body;
    if (!text || !userId || !videoId || (!commentId && !parentReplyId)) {
      return res.status(400).json({ 
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required fields: text, userId, and either commentId or parentReplyId'
      });
    }
    const numericUserId = parseInt(userId);
    const numericVideoId = parseInt(videoId);
    const numericCommentId = commentId ? parseInt(commentId) : null;
    const numericParentReplyId = parentReplyId ? parseInt(parentReplyId) : null;
    const user = await prisma.user.findUnique({
      where: { id: numericUserId },
      select: { id: true }
    });
    if (!user) {
      return res.status(404).json({ 
        error: 'USER_NOT_FOUND',
        message: 'The user does not exist'
      });
    }
    const videoExists = await prisma.video.findUnique({
      where: { id: numericVideoId },
      select: { id: true }
    });
    if (!videoExists) {
      return res.status(404).json({ 
        error: 'VIDEO_NOT_FOUND',
        message: 'The video does not exist'
      });
    }
    let resolvedCommentId = numericCommentId;
    if (numericParentReplyId) {
      const parentReply = await prisma.reply.findUnique({
        where: { id: numericParentReplyId },
        select: { commentId: true, videoId: true }
      });
      if (!parentReply) {
        return res.status(404).json({ 
          error: 'PARENT_REPLY_NOT_FOUND',
          message: 'The reply you are responding to does not exist'
        });
      }
      if (parentReply.videoId !== numericVideoId) {
        return res.status(400).json({ 
          error: 'VIDEO_MISMATCH',
          message: 'The parent reply does not belong to this video'
        });
      }
      resolvedCommentId = parentReply.commentId;
    }
    if (resolvedCommentId) {
      const comment = await prisma.comment.findUnique({
        where: { id: resolvedCommentId },
        select: { id: true, videoId: true }
      });
      if (!comment) {
        return res.status(404).json({ 
          error: 'COMMENT_NOT_FOUND',
          message: 'The comment you are replying to does not exist'
        });
      }
      if (comment.videoId !== numericVideoId) {
        return res.status(400).json({ 
          error: 'VIDEO_MISMATCH',
          message: 'The comment does not belong to this video'
        });
      }
    }
    const reply = await prisma.reply.create({
      data: {
        text,
        userId: numericUserId,
        commentId: resolvedCommentId,
        videoId: numericVideoId,
        parentReplyId: numericParentReplyId
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true
          }
        },
        parent: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });
    res.status(201).json({
      ...reply,
      id: reply.id.toString(),
      userId: reply.userId.toString(),
      commentId: reply.commentId?.toString() || null,
      videoId: reply.videoId.toString(),
      parentReplyId: reply.parentReplyId?.toString() || null
    });
  } catch (error) {
    console.error('Reply creation error:', error);
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'FOREIGN_KEY_CONSTRAINT',
        message: 'Invalid reference to comment, reply, or video'
      });
    }
    res.status(500).json({ 
      error: 'SERVER_ERROR',
      message: 'Failed to create reply',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/interactions/subscribe', async (req, res) => {
  try {
    const { userId, videoId } = req.body;
    if (!userId || !videoId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const video = await prisma.video.findUnique({
      where: { id: parseInt(videoId) },
      select: { userId: true }
    });
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    const creatorId = video.userId;
    const numericUserId = parseInt(userId);
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: numericUserId,
        creatorId: creatorId
      }
    });
    if (existingSubscription) {
      await prisma.subscription.delete({
        where: { id: existingSubscription.id }
      });
      return res.json({ 
        action: 'unsubscribed',
        subscribed: false,
        uploaderId: creatorId
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: numericUserId,
          creatorId: creatorId,
          videoId: parseInt(videoId)
        }
      });
      return res.json({ 
        action: 'subscribed',
        subscribed: true,
        uploaderId: creatorId
      });
    }
  } catch (error) {
    console.error('Subscription error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Already subscribed',
        details: 'You are already subscribed to this creator'
      });
    }
    res.status(500).json({ 
      error: 'Failed to toggle subscription',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/interactions/rate', async (req, res) => {
  try {
    const { userId, videoId, value } = req.body;
    if (value < 1 || value > 10) {
      return res.status(400).json({ 
        success: false,
        error: 'Rating must be between 1 and 10' 
      });
    }
    const numericUserId = parseInt(userId);
    const numericVideoId = parseInt(videoId);
    const videoExists = await prisma.video.findUnique({
      where: { id: numericVideoId }
    });
    if (!videoExists) {
      return res.status(404).json({ 
        success: false,
        error: 'Video not found' 
      });
    }
    const rating = await prisma.rating.upsert({
      where: {
        userId_videoId: {
          userId: numericUserId,
          videoId: numericVideoId
        }
      },
      update: {
        value: parseInt(value),
        updatedAt: new Date()
      },
      create: {
        value: parseInt(value),
        userId: numericUserId,
        videoId: numericVideoId
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    const ratings = await prisma.rating.findMany({
      where: { videoId: numericVideoId }
    });
    const totalSum = ratings.reduce((sum, r) => sum + r.value, 0);
    const average = totalSum / ratings.length;
    const roundedAverage = Math.round(average * 10) / 10;
    res.status(200).json({ 
      success: true,
      rating,
      average: roundedAverage,
      count: ratings.length
    });
  } catch (error) {
    console.error('Rating error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save rating',
      details: error.message
    });
  }
});

app.post('/api/interactions/trivia', async (req, res) => {
  try {
    const { text, userId, videoId } = req.body;
    if (!text || !userId || !videoId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const trivia = await prisma.trivia.create({
      data: {
        text,
        userId: parseInt(userId),
        videoId: parseInt(videoId)
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    res.status(201).json(trivia);
  } catch (error) {
    console.error('Trivia error:', error);
    res.status(500).json({ error: 'Failed to create trivia' });
  }
});

app.get('/api/videos/:id/trivia', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const trivia = await prisma.trivia.findMany({
      where: { videoId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.json(trivia);
  } catch (error) {
    console.error('Error fetching trivia:', error);
    res.status(500).json({ error: 'Failed to fetch trivia' });
  }
});

app.get('/api/videos/approved', async (req, res) => {
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

app.post('/api/videos/:id/synopsis', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const { synopsis } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true }
    });
    if (!video || video.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this video' });
    }
    const updatedVideo = await prisma.video.update({
      where: { id: videoId },
      data: { synopsis },
      select: {
        id: true,
        title: true,
        synopsis: true
      }
    });
    res.json(updatedVideo);
  } catch (error) {
    console.error('Synopsis update error:', error);
    res.status(500).json({ 
      error: 'Failed to update synopsis',
      details: error.message 
    });
  }
});

// ============================================================
//  DELETE VIDEO ENDPOINT (with cascade and ownership check)
// ============================================================
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    if (isNaN(videoId)) {
      return res.status(400).json({ message: 'Invalid video ID' });
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID missing from token' });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true }
    });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const isAdmin = decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN';
    if (video.userId !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Use a transaction to delete all related records
    await prisma.$transaction(async (prisma) => {
      // Delete replies
      await prisma.reply.deleteMany({
        where: { videoId: videoId }
      });
      // Delete comments
      await prisma.comment.deleteMany({
        where: { videoId: videoId }
      });
      // Delete likes
      await prisma.like.deleteMany({
        where: { videoId: videoId }
      });
      // Delete ratings
      await prisma.rating.deleteMany({
        where: { videoId: videoId }
      });
      // Delete trivia
      await prisma.trivia.deleteMany({
        where: { videoId: videoId }
      });
      // Delete subscriptions
      await prisma.subscription.deleteMany({
        where: { videoId: videoId }
      });
      // Finally, delete the video
      await prisma.video.delete({
        where: { id: videoId }
      });
    });

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      message: 'Failed to delete video',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
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