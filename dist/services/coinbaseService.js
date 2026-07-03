"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCryptoCharge = createCryptoCharge;
exports.getChargeStatus = getChargeStatus;
exports.getCryptoCode = getCryptoCode;
exports.getChargeHostedUrl = getChargeHostedUrl;
exports.getChargePaymentAddress = getChargePaymentAddress;
const axios_1 = __importDefault(require("axios"));
// Coinbase Commerce API endpoint - Use sandbox for testing
const ENVIRONMENT = process.env.COINBASE_ENVIRONMENT || 'sandbox';
const COINBASE_API_URL = ENVIRONMENT === 'production'
    ? 'https://api.commerce.coinbase.com'
    : 'https://api-sandbox.commerce.coinbase.com';
const API_KEY = process.env.COINBASE_API_KEY;
const API_SECRET = process.env.COINBASE_API_SECRET;
// Map our crypto names to Coinbase currency codes
const cryptoMap = {
    Bitcoin: 'BTC',
    Ethereum: 'ETH',
    Litecoin: 'LTC',
    Solana: 'SOL',
    Tether: 'USDT',
    Tron: 'TRX',
    'Ripple (XRP)': 'XRP',
    Polygon: 'MATIC',
    'USD Coin': 'USDC',
    Worldcoin: 'WLD',
};
async function createCryptoCharge(cryptoType, amountUSD, walletAddress, userId, userEmail) {
    try {
        const currencyCode = cryptoMap[cryptoType];
        if (!currencyCode) {
            throw new Error(`Unsupported crypto type: ${cryptoType}`);
        }
        if (!API_KEY) {
            throw new Error('COINBASE_API_KEY not configured');
        }
        console.log(`🔄 Creating Coinbase ${ENVIRONMENT} charge for ${cryptoType} (${currencyCode})...`);
        console.log(`API URL: ${COINBASE_API_URL}/charges`);
        const response = await axios_1.default.post(`${COINBASE_API_URL}/charges`, {
            name: `Earnlab Withdrawal - ${cryptoType}`,
            description: `Withdraw ${amountUSD} USD worth of ${cryptoType} to wallet: ${walletAddress.substring(0, 10)}...`,
            local_price: {
                amount: amountUSD.toString(),
                currency: 'USD',
            },
            pricing_type: 'fixed_price',
            metadata: {
                userId,
                userEmail,
                walletAddress,
                cryptoType,
                amountUSD,
                createdAt: new Date().toISOString(),
            },
        }, {
            headers: {
                'X-CC-Api-Key': API_KEY,
                'X-CC-Version': '2018-03-22',
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });
        console.log(`✅ Coinbase charge created: ${response.data.data.id}`);
        console.log(`📱 Payment URL: ${response.data.data.hosted_url}`);
        return response.data.data;
    }
    catch (error) {
        console.error('❌ Coinbase charge creation error:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
        // Check if this is a network connectivity issue
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.error('⚠️  Network error: Cannot reach Coinbase API. Check your internet connection and firewall settings.');
            console.error(`   Attempted to reach: ${COINBASE_API_URL}`);
            throw new Error(`Network error: Unable to reach Coinbase API. Please check your connection and try again.`);
        }
        throw new Error(`Failed to create Coinbase charge: ${error.response?.data?.message || error.message}`);
    }
}
async function getChargeStatus(chargeId) {
    try {
        if (!API_KEY) {
            throw new Error('COINBASE_API_KEY not configured');
        }
        const response = await axios_1.default.get(`${COINBASE_API_URL}/charges/${chargeId}`, {
            headers: {
                'X-CC-Api-Key': API_KEY,
                'X-CC-Version': '2018-03-22',
            },
            timeout: 10000,
        });
        return response.data.data;
    }
    catch (error) {
        console.error('❌ Coinbase charge fetch error:', error.response?.data || error.message);
        // Check if this is a network connectivity issue
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.error('⚠️  Network error: Cannot reach Coinbase API. Check your internet connection and firewall settings.');
            throw new Error(`Network error: Unable to reach Coinbase API. Please check your connection and try again.`);
        }
        throw new Error(`Failed to fetch charge status: ${error.response?.data?.message || error.message}`);
    }
}
function getCryptoCode(cryptoType) {
    return cryptoMap[cryptoType] || null;
}
function getChargeHostedUrl(charge) {
    return charge.hosted_url;
}
function getChargePaymentAddress(charge, cryptoType) {
    const cryptoCode = cryptoMap[cryptoType];
    if (!cryptoCode)
        return null;
    return charge.addresses[cryptoCode] || null;
}
//# sourceMappingURL=coinbaseService.js.map