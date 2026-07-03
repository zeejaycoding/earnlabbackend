// Test email service
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('Testing Gmail SMTP connection...');
  console.log('Host:', process.env.SMTP_HOST);
  console.log('Port:', process.env.SMTP_PORT);
  console.log('User:', process.env.SMTP_USER);
  console.log('Password set:', !!process.env.SMTP_PASSWORD);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  try {
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection successful!');

    // Send test email
    const info = await transporter.sendMail({
      from: `"Labwards" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // Send to self for testing
      subject: '✅ EarnLab Email Test',
      html: `
        <div style="background: #1a1a2e; color: white; padding: 30px; font-family: Arial, sans-serif;">
          <h1 style="color: #22c55e;">Email Service Working! 🎉</h1>
          <p>Your email notifications are now configured correctly.</p>
          <p>Users will receive emails when:</p>
          <ul>
            <li>A payout request is submitted</li>
            <li>A payout is approved</li>
            <li>A payout is rejected</li>
          </ul>
          <p style="color: #888;">Sent from EarnLab Backend</p>
        </div>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
  }
}

testEmail();
