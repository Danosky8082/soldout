const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { sendVerificationEmail, sendWelcomeEmail } = require('../utils/email');

const JWT_SECRET = process.env.JWT_SECRET;

const register = async (req, res) => {
  try {
    const prisma = new PrismaClient();
    const { firstName, lastName, email, password } = req.body;
    
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const user = await prisma.user.create({
      data: { 
        firstName, 
        lastName, 
        email, 
        password: hashedPassword,
        isVerified: false,
        verificationToken,
        verificationExpires
      }
    });

    sendVerificationEmail(user.email, user.firstName, verificationToken)
      .catch(console.error);
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });
    
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({ 
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isVerified: user.isVerified
      },
      token,
      message: 'Verification email sent. Please check your inbox.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const prisma = new PrismaClient();
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials. Check your input.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials. Check your input.' });
    }

    // Optional: check if user is verified
    // if (!user.isVerified) {
    //   return res.status(403).json({ message: 'Please verify your email first.' });
    // }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ 
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isVerified: user.isVerified
      },
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Verification token missing' });
  }

  try {
    const prisma = new PrismaClient();
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationExpires: { gt: new Date() },
        isVerified: false,
      },
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification token. Please request a new one.' 
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });

    sendWelcomeEmail(user.email, user.firstName).catch(console.error);

    res.json({ message: 'Email verified successfully! You can now log in.' });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
};

const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isVerified) return res.status(400).json({ error: 'Email already verified' });

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: newToken,
        verificationExpires: newExpires,
      },
    });

    await sendVerificationEmail(user.email, user.firstName, newToken);
    res.json({ message: 'Verification email resent. Check your inbox.' });
  } catch (error) {
    console.error('Resend error:', error);
    res.status(500).json({ error: 'Failed to resend verification' });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification
};