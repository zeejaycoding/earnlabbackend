#!/usr/bin/env node

/**
 * Seed Admin User Script
 * Creates initial admin account in MongoDB
 * Run: node seed-admin.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/earnlab';

// AdminUser Schema
const adminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'superadmin' },
  permissions: { type: [String], default: ['*'] },
  isActive: { type: Boolean, default: true },
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date },
  lastLoginAt: { type: Date },
  lastLoginIp: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const AdminUser = mongoose.model('AdminUser', adminUserSchema);

async function seedAdmin() {
  try {
    console.log('🔧 Seeding Admin User...\n');
    console.log(`📍 MongoDB URI: ${MONGODB_URI}\n`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if admin already exists
    const existingAdmin = await AdminUser.findOne({ email: 'admin@earnlab.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin account already exists!');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Active: ${existingAdmin.isActive}\n`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create admin account
    console.log('📝 Creating admin account...\n');

    const adminData = {
      email: 'admin@earnlab.com',
      name: 'Admin User',
      password: 'admin123',
      role: 'superadmin',
      permissions: ['*'],
      isActive: true,
    };

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminData.password, salt);

    // Create admin
    const admin = new AdminUser({
      email: adminData.email,
      name: adminData.name,
      passwordHash,
      role: adminData.role,
      permissions: adminData.permissions,
      isActive: adminData.isActive,
    });

    await admin.save();

    console.log('✅ Admin account created successfully!\n');
    console.log('📋 Admin Credentials:');
    console.log(`   Email: ${adminData.email}`);
    console.log(`   Password: ${adminData.password}`);
    console.log(`   Role: ${adminData.role}`);
    console.log(`   Permissions: ${adminData.permissions.join(', ')}\n`);

    console.log('🔐 IMPORTANT: Change password after first login!\n');

    console.log('✅ Setup complete. You can now login to the admin panel.\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedAdmin();
