import axios from 'axios';
import crypto from 'crypto';

// NOWPayments API Configuration
const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const ENVIRONMENT = process.env.NOWPAYMENTS_ENVIRONMENT || 'sandbox';
const API_URL = ENVIRONMENT === 'production' 
  ? 'https://api.nowpayments.io/v1'
  : 'https://api-sandbox.nowpayments.io/v1';

interface NOWPaymentsInvoice {
  id: string;
  order_id: string;
  order_description: string;
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  pay_amount: number;
  pay_address: string;
  ipn_callback_url: string;
  success_url: string;
  cancel_url: string;
  created_at: string;
  updated_at: string;
  invoice_url: string;
  status: string;
  payment_id?: string;
  actually_paid?: number;
}

// Map our crypto names to NOWPayments currency codes
const cryptoMap: Record<string, string> = {
  Bitcoin: 'btc',
  Ethereum: 'eth',
  Litecoin: 'ltc',
  Solana: 'sol',
  Tether: 'usdt',
  Tron: 'trx',
  'Ripple (XRP)': 'xrp',
  Polygon: 'matic',
  'USD Coin': 'usdc',
  Worldcoin: 'wld',
};

/**
 * Create a payment invoice with NOWPayments
 */
export async function createPaymentInvoice(
  cryptoType: string,
  amountUSD: number,
  walletAddress: string,
  userId: string,
  userEmail: string,
  callbackUrl: string,
  successUrl: string,
  cancelUrl: string
): Promise<NOWPaymentsInvoice> {
  try {
    const currencyCode = cryptoMap[cryptoType];
    if (!currencyCode) {
      throw new Error(`Unsupported crypto type: ${cryptoType}`);
    }

    if (!API_KEY) {
      throw new Error('NOWPAYMENTS_API_KEY not configured');
    }

    console.log(`🔄 Creating NOWPayments invoice for ${cryptoType} (${currencyCode})...`);
    console.log(`API URL: ${API_URL}/invoice`);

    const invoiceData = {
      price_amount: amountUSD,
      price_currency: 'usd',
      pay_currency: currencyCode,
      order_id: userId,
      order_description: `Earnlab Withdrawal - ${cryptoType} to ${walletAddress.substring(0, 10)}...`,
      ipn_callback_url: callbackUrl,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    console.log(`Using API Key: ${API_KEY?.substring(0, 10)}...`);
    
    const response = await axios.post(`${API_URL}/invoice`, invoiceData, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log(`✅ NOWPayments invoice created: ${response.data.id}`);
    console.log(`📱 Payment URL: ${response.data.invoice_url}`);
    return response.data;
  } catch (error: any) {
    console.error('❌ NOWPayments invoice creation error:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);

    // Check if this is a network connectivity issue
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('⚠️  Network error: Cannot reach NOWPayments API. Check your internet connection and firewall settings.');
      console.error(`   Attempted to reach: ${API_URL}`);
      throw new Error(
        `Network error: Unable to reach NOWPayments API. Please check your connection and try again.`
      );
    }

    throw new Error(
      `Failed to create NOWPayments invoice: ${error.response?.data?.message || error.message}`
    );
  }
}

/**
 * Get payment status from NOWPayments
 */
export async function getPaymentStatus(paymentId: string): Promise<any> {
  try {
    if (!API_KEY) {
      throw new Error('NOWPAYMENTS_API_KEY not configured');
    }

    const response = await axios.get(`${API_URL}/payment/${paymentId}`, {
      headers: {
        'x-api-key': API_KEY,
      },
      timeout: 10000,
    });

    return response.data;
  } catch (error: any) {
    console.error('❌ NOWPayments payment fetch error:', error.response?.data || error.message);

    // Check if this is a network connectivity issue
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('⚠️  Network error: Cannot reach NOWPayments API. Check your internet connection and firewall settings.');
      throw new Error(
        `Network error: Unable to reach NOWPayments API. Please check your connection and try again.`
      );
    }

    throw new Error(
      `Failed to fetch payment status: ${error.response?.data?.message || error.message}`
    );
  }
}

/**
 * Verify IPN callback signature
 * This ensures the callback is genuinely from NOWPayments
 */
export function verifyIPNSignature(body: any, signature: string): boolean {
  if (!IPN_SECRET) {
    console.warn('⚠️  IPN_SECRET not configured. Skipping signature verification.');
    return false;
  }

  try {
    // Sort parameters alphabetically and stringify
    const sortedParams = JSON.stringify(body, Object.keys(body).sort());
    
    // Create HMAC-SHA512 signature
    const hmac = crypto.createHmac('sha512', IPN_SECRET);
    hmac.update(sortedParams);
    const calculatedSignature = hmac.digest('hex');

    // Compare signatures
    const isValid = calculatedSignature === signature;
    
    if (!isValid) {
      console.error('❌ IPN signature verification failed');
      console.error('Expected:', calculatedSignature);
      console.error('Received:', signature);
    }

    return isValid;
  } catch (error) {
    console.error('❌ Error verifying IPN signature:', error);
    return false;
  }
}

/**
 * Get crypto code for a given crypto type
 */
export function getCryptoCode(cryptoType: string): string | null {
  return cryptoMap[cryptoType] || null;
}

/**
 * Get invoice payment URL
 */
export function getInvoiceUrl(invoice: NOWPaymentsInvoice): string {
  return invoice.invoice_url;
}
