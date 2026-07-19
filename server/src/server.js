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

// ✅ Routes
const videoRoutes = require('./routes/videoRoutes');
const interactionRoutes = require('./routes/interactionRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const youtubeRoutes = require('./routes/youtubeRoutes');
const newsRoutes = require('./routes/newsRoutes');   // ✅ import

dotenv.config();
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

app.use((req, res, next) => {
    const allowedOrigins = [
        'https://soldout-murex.vercel.app',
        'http://localhost:5000',
        'http://localhost:3000',
        'http://localhost:5173'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'https://soldout-murex.vercel.app');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

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
//  ADMIN ROUTES
// ============================================================
app.use('/api/admin', adminRoutes);
console.log('✅ Admin routes mounted.');

// ============================================================
//  VIDEO & INTERACTION ROUTES
// ============================================================
app.use('/api/videos', videoRoutes);
app.use('/api/interactions', interactionRoutes);

// ============================================================
//  YOUTUBE API
// ============================================================
app.use('/api/youtube', youtubeRoutes);
console.log('✅ YouTube routes mounted.');

// ============================================================
//  NEWS API  <-- MOVED HERE (BEFORE CATCH-ALL)
// ============================================================
app.use('/api/news', newsRoutes);
console.log('✅ News routes mounted.');

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
                bio: true,
                profilePicture: true,
                createdAt: true,
                videos: {
                    select: {
                        id: true,
                        title: true,
                        thumbnail: true,
                        videoUrl: true,
                        genre: true,
                        views: true,
                        createdAt: true,
                        _count: {
                            select: {
                                likes: true,
                                comments: true,
                                subscriptions: true
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
        const totalViews = user.videos.reduce((sum, v) => sum + v.views, 0);
        const totalLikes = user.videos.reduce((sum, v) => sum + v._count.likes, 0);
        const totalSubscribers = await prisma.subscription.count({
            where: { creatorId: userId }
        });
        res.json({
            ...user,
            stats: {
                videos: user.videos.length,
                views: totalViews,
                likes: totalLikes,
                subscribers: totalSubscribers
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { firstName, lastName, email, bio } = req.body;
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Authorization required' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.id !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const user = await prisma.user.update({
            where: { id: userId },
            data: { firstName, lastName, email, bio },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                bio: true,
                profilePicture: true,
                createdAt: true
            }
        });
        res.json(user);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.post('/api/users/:id/profile-picture', upload.single('profilePicture'), async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Authorization required' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.id !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const pictureUrl = await uploadToSupabase(req.file, 'profiles');
        const user = await prisma.user.update({
            where: { id: userId },
            data: { profilePicture: pictureUrl },
            select: { id: true, profilePicture: true }
        });
        res.json({ profilePictureUrl: user.profilePicture });
    } catch (error) {
        console.error('Profile picture error:', error);
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
});

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
//  HEALTH CHECK (for Render)
// ============================================================
app.get('/health', (req, res) => res.send('OK'));

// ============================================================
//  STATIC FILES & CATCH-ALL (MUST BE LAST)
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