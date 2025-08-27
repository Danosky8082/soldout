// server/src/config/db.js
const { PrismaClient } = require('@prisma/client');

async function connectDB() {
  try {
    const prisma = new PrismaClient();
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection error', error);
    process.exit(1);
  }
}

module.exports = connectDB;