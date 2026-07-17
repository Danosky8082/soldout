// utils/email.js – Minimal version (no verification)
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendWelcomeEmail(userEmail, firstName) {
  const mailOptions = {
    from: `"Soldout.com" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: 'Welcome to Soldout.com! 🎬',
    html: `<h1>Welcome, ${firstName}!</h1><p>Thank you for joining Soldout.com.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${userEmail}`);
  } catch (error) {
    console.error('Email error:', error);
  }
}

module.exports = { sendWelcomeEmail };