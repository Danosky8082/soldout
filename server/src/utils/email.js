// utils/email.js
const nodemailer = require('nodemailer');

// Create transporter (using Gmail as example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // your Gmail address
    pass: process.env.EMAIL_PASS, // App password (not your normal password)
  },
});

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
        <a href="https://soldout-murex.vercel.app" 
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
    console.error('Email error:', error);
    // Don't block signup if email fails – just log it
  }
}

module.exports = { sendWelcomeEmail };