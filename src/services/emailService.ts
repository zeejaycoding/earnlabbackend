import nodemailer from "nodemailer";
import SystemSettings from "../models/SystemSettings";

/**
 * Email Service for sending payout notifications
 * Supports SMTP configuration from System Settings
 * 
 * Gmail SMTP Configuration:
 * - Host: smtp.gmail.com
 * - Port: 587 (TLS)
 * - User: rminhal783@gmail.com
 * - Pass: App Password (set in environment variable)
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface PayoutEmailData {
  username: string;
  email: string;
  amount: number;
  method: string;
  status: string;
  transactionId?: string;
  reason?: string;
}

// Gmail SMTP defaults (can be overridden by env vars or database settings)
const GMAIL_CONFIG = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false, // true for 465, false for other ports
  user: process.env.SMTP_USER || "rminhal783@gmail.com",
};

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string = process.env.SMTP_USER || "rminhal783@gmail.com";
  private siteName: string = "Labwards";
  private isConfigured: boolean = false;

  /**
   * Initialize or reinitialize the email transporter with settings from the database
   */
  async initializeTransporter(): Promise<boolean> {
    try {
      const settings = await SystemSettings.findOne().lean();
      
      this.siteName = settings?.siteName || "Labwards";
      
      // Use database settings if available, otherwise use Gmail defaults
      const smtpHost = settings?.smtpHost || GMAIL_CONFIG.host;
      const smtpPort = settings?.smtpPort || GMAIL_CONFIG.port;
      const smtpUser = settings?.smtpUser || GMAIL_CONFIG.user;
      const smtpSecure = settings?.smtpSecure ?? GMAIL_CONFIG.secure;
      const smtpPassword = process.env.SMTP_PASSWORD || "";
      
      if (!smtpPassword) {
        console.log("SMTP_PASSWORD not set - email notifications disabled");
        this.isConfigured = false;
        return false;
      }

      this.fromEmail = smtpUser;

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      // Verify connection
      await this.transporter.verify();
      console.log("✅ Email service initialized successfully with", smtpHost);
      this.isConfigured = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize email service:", error);
      this.transporter = null;
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    // Try to initialize if not already done
    if (!this.transporter) {
      const initialized = await this.initializeTransporter();
      if (!initialized) {
        console.log("Email service not available, skipping email send");
        return false;
      }
    }

    try {
      await this.transporter!.sendMail({
        from: `"${this.siteName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ""),
      });
      console.log(`Email sent successfully to ${options.to}`);
      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  }

  /**
   * Send payout request received notification
   */
  async sendPayoutRequestReceived(data: PayoutEmailData): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payout Request Received</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A0C1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0C1A; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1A1D2E; border-radius: 16px; overflow: hidden; border: 1px solid #2A2D3E;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #0ea5e9 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Payout Request Received</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #9CA3AF; font-size: 16px; margin: 0 0 20px 0;">
                Hi <strong style="color: white;">${data.username}</strong>,
              </p>
              <p style="color: #9CA3AF; font-size: 16px; margin: 0 0 30px 0;">
                Your payout request has been received and is being processed. Here are the details:
              </p>
              
              <!-- Details Box -->
              <div style="background-color: #252840; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Amount:</td>
                    <td style="color: #10b981; font-size: 18px; font-weight: bold; text-align: right;">$${(data.amount / 100).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Method:</td>
                    <td style="color: white; font-size: 14px; text-align: right;">${data.method}</td>
                  </tr>
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Status:</td>
                    <td style="color: #fbbf24; font-size: 14px; text-align: right;">⏳ Pending Review</td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #9CA3AF; font-size: 14px; margin: 0;">
                Our team will review your request and process it within 24-48 hours. You'll receive another email once your payout has been processed.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #151728; padding: 20px 30px; border-top: 1px solid #2A2D3E;">
              <p style="color: #6B7280; font-size: 12px; margin: 0; text-align: center;">
                This email was sent by ${this.siteName}. If you didn't make this request, please contact support immediately.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `💰 Payout Request Received - $${(data.amount / 100).toFixed(2)}`,
      html,
    });
  }

  /**
   * Send payout successful notification
   */
  async sendPayoutSuccessful(data: PayoutEmailData): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payout Successful</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A0C1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0C1A; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1A1D2E; border-radius: 16px; overflow: hidden; border: 1px solid #2A2D3E;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">✅ Payout Successful!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #9CA3AF; font-size: 16px; margin: 0 0 20px 0;">
                Hi <strong style="color: white;">${data.username}</strong>,
              </p>
              <p style="color: #9CA3AF; font-size: 16px; margin: 0 0 30px 0;">
                Great news! Your payout has been successfully processed. 🎉
              </p>
              
              <!-- Details Box -->
              <div style="background-color: #252840; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Amount Paid:</td>
                    <td style="color: #10b981; font-size: 20px; font-weight: bold; text-align: right;">$${(data.amount / 100).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Method:</td>
                    <td style="color: white; font-size: 14px; text-align: right;">${data.method}</td>
                  </tr>
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Status:</td>
                    <td style="color: #10b981; font-size: 14px; text-align: right;">✅ Completed</td>
                  </tr>
                  ${data.transactionId ? `
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Transaction ID:</td>
                    <td style="color: #9CA3AF; font-size: 12px; text-align: right;">${data.transactionId}</td>
                  </tr>
                  ` : ""}
                </table>
              </div>
              
              <p style="color: #9CA3AF; font-size: 14px; margin: 0 0 20px 0;">
                ${data.method.toLowerCase() === "paypal" 
                  ? "The funds have been sent to your PayPal account. Please check your PayPal balance."
                  : data.method.toLowerCase() === "crypto"
                    ? "The cryptocurrency has been sent to your wallet address. Please allow a few minutes for blockchain confirmation."
                    : data.method.toLowerCase() === "giftcard"
                      ? "Your gift card code has been generated and sent in a separate email."
                      : "Please allow some time for the funds to appear in your account."}
              </p>
              
              <p style="color: #9CA3AF; font-size: 14px; margin: 0;">
                Thank you for using ${this.siteName}. Keep earning! 💪
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #151728; padding: 20px 30px; border-top: 1px solid #2A2D3E;">
              <p style="color: #6B7280; font-size: 12px; margin: 0; text-align: center;">
                This email was sent by ${this.siteName}. Questions? Contact our support team.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `✅ Payout Successful - $${(data.amount / 100).toFixed(2)}`,
      html,
    });
  }

  /**
   * Send payout rejected notification
   */
  async sendPayoutRejected(data: PayoutEmailData): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payout Request Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A0C1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0C1A; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1A1D2E; border-radius: 16px; overflow: hidden; border: 1px solid #2A2D3E;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Payout Request Update</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #9CA3AF; font-size: 16px; margin: 0 0 20px 0;">
                Hi <strong style="color: white;">${data.username}</strong>,
              </p>
              <p style="color: #9CA3AF; font-size: 16px; margin: 0 0 30px 0;">
                Unfortunately, your payout request could not be processed.
              </p>
              
              <!-- Details Box -->
              <div style="background-color: #252840; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Amount:</td>
                    <td style="color: #ef4444; font-size: 18px; font-weight: bold; text-align: right;">$${(data.amount / 100).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Method:</td>
                    <td style="color: white; font-size: 14px; text-align: right;">${data.method}</td>
                  </tr>
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Status:</td>
                    <td style="color: #ef4444; font-size: 14px; text-align: right;">❌ Rejected</td>
                  </tr>
                  ${data.reason ? `
                  <tr>
                    <td style="color: #6B7280; font-size: 14px;">Reason:</td>
                    <td style="color: #fbbf24; font-size: 14px; text-align: right;">${data.reason}</td>
                  </tr>
                  ` : ""}
                </table>
              </div>
              
              <p style="color: #9CA3AF; font-size: 14px; margin: 0 0 20px 0;">
                The requested amount has been returned to your account balance. If you believe this was an error, please contact our support team.
              </p>
              
              <p style="color: #9CA3AF; font-size: 14px; margin: 0;">
                Thank you for your understanding.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #151728; padding: 20px 30px; border-top: 1px solid #2A2D3E;">
              <p style="color: #6B7280; font-size: 12px; margin: 0; text-align: center;">
                This email was sent by ${this.siteName}. Questions? Contact our support team.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: data.email,
      subject: `Payout Request Update - Action Required`,
      html,
    });
  }
}

// Export singleton instance
const emailService = new EmailService();
export default emailService;
export { EmailService, PayoutEmailData };
