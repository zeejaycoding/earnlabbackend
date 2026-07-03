#!/usr/bin/env node
/**
 * Test MongoDB Connection
 * Run: node test-connection.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function testConnection() {
  console.log('🔍 Testing MongoDB Connection...\n');
  console.log(`📍 URI: ${MONGODB_URI}\n`);
  
  try {
    console.log('⏳ Connecting...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    
    console.log('✅ Connected successfully!\n');
    console.log('📊 Connection Details:');
    console.log(`   - Host: ${mongoose.connection.host}`);
    console.log(`   - Database: ${mongoose.connection.name}`);
    console.log(`   - Ready State: ${mongoose.connection.readyState}`);
    
    // Test a simple operation
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\n📚 Collections (${collections.length}):`);
    collections.forEach(col => console.log(`   - ${col.name}`));
    
    await mongoose.disconnect();
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check if MongoDB cluster is running (not paused)');
    console.error('   2. Verify Network Access in MongoDB Atlas (0.0.0.0/0)');
    console.error('   3. Confirm username and password are correct');
    console.error('   4. Ensure database name is in the connection string');
    process.exit(1);
  }
}

testConnection();
