// Clean up bonus codes and test
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/earnlab';

const bonusCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  amountCents: { type: Number, required: true, min: 1 },
  usageLimit: { type: Number, required: true, min: 1 },
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  expiresAt: { type: Date, required: false },
}, { timestamps: true });

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const BonusCode = mongoose.model('BonusCode', bonusCodeSchema);

    // List all codes
    console.log('\n=== Current Bonus Codes ===');
    const codes = await BonusCode.find({});
    console.log(`Found ${codes.length} codes`);
    codes.forEach(code => {
      console.log(`- ${code.code}: $${(code.amountCents / 100).toFixed(2)}, Active: ${code.isActive}, Limit: ${code.usedCount}/${code.usageLimit}`);
    });

    // Delete all codes
    console.log('\n=== Deleting All Codes ===');
    const result = await BonusCode.deleteMany({});
    console.log(`Deleted ${result.deletedCount} codes`);

    // Create a test code
    console.log('\n=== Creating Test Code ===');
    const testCode = await BonusCode.create({
      code: 'TEST100',
      amountCents: 10000,
      usageLimit: 100,
      usedCount: 0,
      isActive: true,
      usedBy: []
    });
    console.log('Created:', testCode.toObject());

    // Verify it was saved correctly
    console.log('\n=== Verifying ===');
    const retrieved = await BonusCode.findOne({ code: 'TEST100' });
    console.log('Retrieved:', retrieved.toObject());
    console.log(`Amount: $${(retrieved.amountCents / 100).toFixed(2)}`);
    console.log(`Active: ${retrieved.isActive}`);

    await mongoose.disconnect();
    console.log('\nDone! Restart your backend now.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
