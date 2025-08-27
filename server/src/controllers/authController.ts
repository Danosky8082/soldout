// src/controllers/authController.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

// Extend the Request interface to include the user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        // Add other JWT payload properties as needed
      };
    }
  }
}

// Regular user login (existing)
export const login = async (req: Request, res: Response) => {
  // ... your existing user login implementation
};

// Admin login (new)
export const adminLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // Find user with admin role
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Check if user exists and has admin role
    if (!user || user.role !== 'ADMIN') {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin verification middleware (new)
export const verifyAdmin = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    // Verify and decode the token with proper typing
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { 
      userId: string; 
      role: string;
      // Add other expected properties from your JWT payload
    };
    
    // Check if user has admin role
    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    // Assign decoded payload to req.user
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};