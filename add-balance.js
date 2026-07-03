#!/usr/bin/env node

/**
 * Script to add balance to a user's wallet
 * Usage: node add-balance.js <email> <amount>
 * Example: node add-balance.js testhaider110@gmail.com 50
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5000';
const email = process.argv[2];
const amountInDollars = parseFloat(process.argv[3]);

// Validate arguments
if (!email || !amountInDollars || isNaN(amountInDollars)) {
  console.error('❌ Invalid arguments');
  console.error('Usage: node add-balance.js <email> <amount>');
  console.error('Example: node add-balance.js testhaider110@gmail.com 50');
  process.exit(1);
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('❌ Invalid email format');
  process.exit(1);
}

// Validate amount
if (amountInDollars <= 0) {
  console.error('❌ Amount must be greater than 0');
  process.exit(1);
}

console.log('🔄 Adding balance to wallet...');
console.log(`   Email: ${email}`);
console.log(`   Amount: $${amountInDollars}`);
console.log(`   API URL: ${API_URL}`);

// Make the API request
axios.post(`${API_URL}/api/v1/user/admin/add-balance`, {
  email,
  amountInDollars
})
  .then(response => {
    const data = response.data;
    if (data.success) {
      console.log('\n✅ Balance added successfully!');
      console.log(`   Old Balance: $${data.oldBalance}`);
      console.log(`   Added Amount: $${data.addedAmount}`);
      console.log(`   New Balance: $${data.newBalance}`);
      console.log(`\n✨ User wallet updated!`);
    } else {
      console.error('\n❌ Error:', data.message);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Request failed');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    console.error('\n💡 Make sure:');
    console.error('   1. Backend server is running (npm run dev)');
    console.error('   2. MongoDB is connected');
    console.error('   3. Email address is correct');
    process.exit(1);
  });
