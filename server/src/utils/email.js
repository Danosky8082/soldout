// utils/email.js
const nodemailer = require('nodemailer');

// Create transporter (using Gmail as example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ===== Send welcome email (after verification) =====
async function sendWelcomeEmail(userEmail, firstName) {
  const mailOptions = {
    from: `"Soldout.com" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: 'Welcome to Soldout.com! 🎬',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ff0000;">Welcome, ${firstName}!</h1>
        <p>Thank you for joining Soldout.com – the Entertainment Experience.</p>
        <p>You can now upload videos, like content, and connect with the community.</p>
        <a href="${process.env.APP_URL || 'https://soldout-murex.vercel.app'}" 
           style="display: inline-block; background: #ff0000; color: #fff; padding: 12px 24px; 
                  text-decoration: none; border-radius: 40px; margin-top: 16px;">
          Start Exploring
        </a>
        <p style="margin-top: 24px; color: #888;">– The Soldout Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${userEmail}`);
  } catch (error) {
    console.error('Welcome email error:', error);
  }
}

// ===== Send verification email =====
async function sendVerificationEmail(userEmail, firstName, token) {
  const verificationLink = `${process.env.APP_URL || 'https://soldout-murex.vercel.app'}/?token=${token}`;

  const mailOptions = {
    from: `"Soldout.com" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: 'Verify Your Email – Soldout.com',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ff0000;">Hi ${firstName},</h1>
        <p>Thanks for signing up! Please verify your email address to access all features.</p>
        <a href="${verificationLink}" 
           style="display: inline-block; background: #ff0000; color: #fff; padding: 12px 24px; 
                  text-decoration: none; border-radius: 40px; margin-top: 16px;">
          Verify Email
        </a>
        <p style="margin-top: 24px; color: #888;">This link expires in 24 hours.</p>
        <p style="margin-top: 12px; color: #888;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${userEmail}`);
  } catch (error) {
    console.error('Verification email error:', error);
    throw error; // Re‑throw so the caller can handle it
  }
}

module.exports = { sendWelcomeEmail, sendVerificationEmail };