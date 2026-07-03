"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentInvoice = createPaymentInvoice;
exports.getPaymentStatus = getPaymentStatus;
exports.verifyIPNSignature = verifyIPNSignature;
exports.getCryptoCode = getCryptoCode;
exports.getInvoiceUrl = getInvoiceUrl;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
// NOWPayments API Configuration
const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const ENVIRONMENT = process.env.NOWPAYMENTS_ENVIRONMENT || 'sandbox';
const API_URL = ENVIRONMENT === 'production'
    ? 'https://api.nowpayments.io/v1'
    : 'https://api-sandbox.nowpayments.io/v1';
// Map our crypto names to NOWPayments currency codes
const cryptoMap = {
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
async function createPaymentInvoice(cryptoType, amountUSD, walletAddress, userId, userEmail, callbackUrl, successUrl, cancelUrl) {
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
        const response = await axios_1.default.post(`${API_URL}/invoice`, invoiceData, {
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });
        console.log(`✅ NOWPayments invoice created: ${response.data.id}`);
        console.log(`📱 Payment URL: ${response.data.invoice_url}`);
        return response.data;
    }
    catch (error) {
        console.error('❌ NOWPayments invoice creation error:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
        // Check if this is a network connectivity issue
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.error('⚠️  Network error: Cannot reach NOWPayments API. Check your internet connection and firewall settings.');
            console.error(`   Attempted to reach: ${API_URL}`);
            throw new Error(`Network error: Unable to reach NOWPayments API. Please check your connection and try again.`);
        }
        throw new Error(`Failed to create NOWPayments invoice: ${error.response?.data?.message || error.message}`);
    }
}
/**
 * Get payment status from NOWPayments
 */
async function getPaymentStatus(paymentId) {
    try {
        if (!API_KEY) {
            throw new Error('NOWPAYMENTS_API_KEY not configured');
        }
        const response = await axios_1.default.get(`${API_URL}/payment/${paymentId}`, {
            headers: {
                'x-api-key': API_KEY,
            },
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        console.error('❌ NOWPayments payment fetch error:', error.response?.data || error.message);
        // Check if this is a network connectivity issue
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.error('⚠️  Network error: Cannot reach NOWPayments API. Check your internet connection and firewall settings.');
            throw new Error(`Network error: Unable to reach NOWPayments API. Please check your connection and try again.`);
        }
        throw new Error(`Failed to fetch payment status: ${error.response?.data?.message || error.message}`);
    }
}
/**
 * Verify IPN callback signature
 * This ensures the callback is genuinely from NOWPayments
 */
function verifyIPNSignature(body, signature) {
    if (!IPN_SECRET) {
        console.warn('⚠️  IPN_SECRET not configured. Skipping signature verification.');
        return false;
    }
    try {
        // Sort parameters alphabetically and stringify
        const sortedParams = JSON.stringify(body, Object.keys(body).sort());
        // Create HMAC-SHA512 signature
        const hmac = crypto_1.default.createHmac('sha512', IPN_SECRET);
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
    }
    catch (error) {
        console.error('❌ Error verifying IPN signature:', error);
        return false;
    }
}
/**
 * Get crypto code for a given crypto type
 */
function getCryptoCode(cryptoType) {
    return cryptoMap[cryptoType] || null;
}
/**
 * Get invoice payment URL
 */
function getInvoiceUrl(invoice) {
    return invoice.invoice_url;
}
//# sourceMappingURL=nowpaymentsService.js.map