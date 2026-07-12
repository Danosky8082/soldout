const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const adminAuth = async (req, res, next) => {
  try {
    // 1. Extract and verify token
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // 2. Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Fetch user with admin-specific fields
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId || decoded.id },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        role: true,
        isBanned: true
      }
    });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token - user not found' });
    }

    // 4. Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({ 
        message: 'Account suspended',
        reason: 'This account has been banned by administrators'
      });
    }

    // 5. For video-related routes, check if user has appropriate permissions
    if (req.path.includes('/videos')) {
      // For POST requests (video uploads), allow all authenticated users
      if (req.method === 'POST') {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          isAdmin: user.isAdmin,
          canUpload: true
        };
        return next();
      }
      
      // For GET requests to /pending, require admin privileges
      if (req.path.includes('/pending') && req.method === 'GET') {
        if (!user.isAdmin && user.role !== 'SUPER_ADMIN') {
          return res.status(403).json({ 
            message: 'Admin privileges required to view pending videos',
            requiredRole: 'ADMIN or SUPER_ADMIN',
            yourRole: user.role
          });
        }
      }
      
      // For PUT/PATCH/DELETE requests, require admin privileges
      if (['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!user.isAdmin && user.role !== 'SUPER_ADMIN') {
          return res.status(403).json({ 
            message: 'Admin privileges required to modify videos',
            requiredRole: 'ADMIN or SUPER_ADMIN',
            yourRole: user.role
          });
        }
      }
    }

    // 6. Verify admin privileges for admin-only routes
    if (req.path.startsWith('/admin')) {
      if (!user.isAdmin && user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ 
          message: 'Admin privileges required',
          requiredRole: 'ADMIN or SUPER_ADMIN',
          yourRole: user.role
        });
      }
    }

    // 7. Attach user and permissions data to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      canUpload: true,
      canApprove: user.isAdmin || user.role === 'SUPER_ADMIN',
      canDelete: user.isAdmin || user.role === 'SUPER_ADMIN'
    };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired',
        solution: 'Please refresh your token or log in again'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        solution: 'Please provide a valid authentication token'
      });
    }
    
    // Fallback error
    res.status(401).json({ 
      message: 'Authentication failed',
      error: error.message 
    });
  }
};

module.exports = adminAuth;