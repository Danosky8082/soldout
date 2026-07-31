const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// ============================================================
// ADMIN LOGIN
// ============================================================
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is admin
    if (!user.isAdmin && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================================
// DASHBOARD
// ============================================================
const getAdminDashboard = async (req, res) => {
  try {
    const [pendingVideos, approvedVideos, rejectedVideos, totalUsers] = await Promise.all([
      prisma.video.count({ where: { status: 'PENDING' } }),
      prisma.video.count({ where: { status: 'APPROVED' } }),
      prisma.video.count({ where: { status: 'REJECTED' } }),
      prisma.user.count()
    ]);

    res.json({ pendingVideos, approvedVideos, rejectedVideos, totalUsers });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
};

// ============================================================
// VIDEOS
// ============================================================
const getPendingVideos = async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Pending videos error:', error);
    res.status(500).json({ error: 'Failed to fetch pending videos' });
  }
};

const getApprovedVideos = async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'APPROVED' },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { approvedAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Approved videos error:', error);
    res.status(500).json({ error: 'Failed to fetch approved videos' });
  }
};

const getRejectedVideos = async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'REJECTED' },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { rejectedAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Rejected videos error:', error);
    res.status(500).json({ error: 'Failed to fetch rejected videos' });
  }
};

const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await prisma.video.findUnique({
      where: { id: parseInt(id) },
      include: { user: { select: { firstName: true, lastName: true, email: true } } }
    });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
};

const approveVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await prisma.video.update({
      where: { id: parseInt(id) },
      data: { status: 'APPROVED', approvedAt: new Date() }
    });
    res.json(video);
  } catch (error) {
    console.error('Approve video error:', error);
    res.status(500).json({ error: 'Failed to approve video' });
  }
};

const rejectVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const video = await prisma.video.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason }
    });
    res.json(video);
  } catch (error) {
    console.error('Reject video error:', error);
    res.status(500).json({ error: 'Failed to reject video' });
  }
};

const unpublishVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await prisma.video.update({
      where: { id: parseInt(id) },
      data: { status: 'PENDING', approvedAt: null }
    });
    res.json(video);
  } catch (error) {
    console.error('Unpublish video error:', error);
    res.status(500).json({ error: 'Failed to unpublish video' });
  }
};

const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.video.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
};

// ============================================================
// USERS
// ============================================================
const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isBanned: true,
        profilePicture: true,
        createdAt: true,
        _count: { select: { videos: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isBanned: true,
        profilePicture: true,
        createdAt: true
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, role } = req.body;
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { firstName, lastName, email, role }
    });
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isBanned: true }
    });
    res.json(user);
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
};

const unbanUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isBanned: false }
    });
    res.json(user);
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
};

// ============================================================
// ADMINS
// ============================================================
const getAdmins = async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { 
        OR: [
          { role: 'ADMIN' },
          { role: 'SUPER_ADMIN' }
        ]
      },
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
    console.error('Get admins error:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
};

const getAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        createdAt: true,
        lastLogin: true
      }
    });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json(admin);
  } catch (error) {
    console.error('Get admin error:', error);
    res.status(500).json({ error: 'Failed to fetch admin' });
  }
};

// ===== UPDATE ADMIN (NEW) =====
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, role } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate role
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or SUPER_ADMIN' });
    }

    // Check if admin exists
    const existingAdmin = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: { role: true, email: true }
    });
    
    if (!existingAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    // Check if email is already taken by another user
    if (email !== existingAdmin.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: email }
      });
      if (emailExists) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }
    
    // Prevent changing SUPER_ADMIN role if current user is not SUPER_ADMIN
    if (existingAdmin.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot modify super admin' });
    }
    
    // Update admin
    const updatedAdmin = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { 
        firstName, 
        lastName, 
        email, 
        role 
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        createdAt: true,
        lastLogin: true
      }
    });
    
    res.json(updatedAdmin);
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ error: 'Failed to update admin' });
  }
};

const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Cannot delete self
    if (parseInt(id) === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }
    
    const admin = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: { role: true }
    });
    
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    
    // Prevent deleting SUPER_ADMIN unless the deleter is also SUPER_ADMIN
    if (admin.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot delete super admin' });
    }
    
    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Admin removed successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Failed to delete admin' });
  }
};

const registerAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Validate role
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or SUPER_ADMIN' });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    
    // Create admin user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashed,
        role: role,
        isAdmin: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        createdAt: true
      }
    });
    
    res.status(201).json({ 
      message: 'Admin registered successfully', 
      user 
    });
  } catch (error) {
    console.error('Register admin error:', error);
    res.status(500).json({ error: 'Failed to register admin' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { password: true }
    });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const valid = await bcrypt.compare(currentPassword, admin.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: adminId },
      data: { password: hashed }
    });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// ============================================================
// UPDATE VIDEO (Admin)
// ============================================================
const updateVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, genre, year, thumbnail, videoUrl } = req.body;

    // Validate required fields
    if (!title || !description || !genre || !year || !thumbnail || !videoUrl) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const video = await prisma.video.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        genre,
        year: parseInt(year),
        thumbnail,
        videoUrl
      }
    });

    res.json(video);
  } catch (error) {
    console.error('Update video error:', error);
    res.status(500).json({ error: 'Failed to update video' });
  }
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  adminLogin,
  getAdminDashboard,
  getPendingVideos,
  getApprovedVideos,
  getRejectedVideos,
  getVideoById,
  approveVideo,
  rejectVideo,
  unpublishVideo,
  deleteVideo,
  getUsers,
  getUserById,
  updateUser,
  banUser,
  unbanUser,
  getAdmins,
  getAdminById,
  updateAdmin,      // ✅ Added
  deleteAdmin,
  registerAdmin,
  changePassword,
  updateVideo
};