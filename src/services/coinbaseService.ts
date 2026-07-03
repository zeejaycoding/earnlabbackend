import axios from 'axios';

// Coinbase Commerce API endpoint - Use sandbox for testing
const ENVIRONMENT = process.env.COINBASE_ENVIRONMENT || 'sandbox';
const COINBASE_API_URL = ENVIRONMENT === 'production' 
  ? 'https://api.commerce.coinbase.com'
  : 'https://api-sandbox.commerce.coinbase.com';
const API_KEY = process.env.COINBASE_API_KEY;
const API_SECRET = process.env.COINBASE_API_SECRET;

interface CoinbaseCharge {
  id: string;
  code: string;
  name: string;
  description: string;
  logo_url: string;
  hosted_url: string;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  checkout: {
    id: string;
  };
  timeline: Array<{
    time: string;
    status: string;
  }>;
  metadata: Record<string, any>;
  pricing_type: string;
  pricing: {
    local: {
      amount: string;
      currency: string;
    };
  };
  payments: Array<{
    network: string;
    transaction_id: string;
    status: string;
    value: {
      local: {
        amount: string;
        currency: string;
      };
      crypto: {
        amount: string;
        currency: string;
      };
    };
    block: {
      height: number;
      hash: string;
      confirmations_accumulated: number;
      confirmations_required: number;
    };
  }>;
  addresses: {
    [key: string]: string;
  };
}

// Map our crypto names to Coinbase currency codes
const cryptoMap: Record<string, string> = {
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

export async function createCryptoCharge(
  cryptoType: string,
  amountUSD: number,
  walletAddress: string,
  userId: string,
  userEmail: string
): Promise<CoinbaseCharge> {
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

    const response = await axios.post(
      `${COINBASE_API_URL}/charges`,
      {
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
      },
      {
        headers: {
          'X-CC-Api-Key': API_KEY,
          'X-CC-Version': '2018-03-22',
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Coinbase charge created: ${response.data.data.id}`);
    console.log(`📱 Payment URL: ${response.data.data.hosted_url}`);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Coinbase charge creation error:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    
    // Check if this is a network connectivity issue
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('⚠️  Network error: Cannot reach Coinbase API. Check your internet connection and firewall settings.');
      console.error(`   Attempted to reach: ${COINBASE_API_URL}`);
      throw new Error(
        `Network error: Unable to reach Coinbase API. Please check your connection and try again.`
      );
    }
    
    throw new Error(
      `Failed to create Coinbase charge: ${error.response?.data?.message || error.message}`
    );
  }
}

export async function getChargeStatus(chargeId: string): Promise<CoinbaseCharge> {
  try {
    if (!API_KEY) {
      throw new Error('COINBASE_API_KEY not configured');
    }

    const response = await axios.get(`${COINBASE_API_URL}/charges/${chargeId}`, {
      headers: {
        'X-CC-Api-Key': API_KEY,
        'X-CC-Version': '2018-03-22',
      },
      timeout: 10000,
    });

    return response.data.data;
  } catch (error: any) {
    console.error('❌ Coinbase charge fetch error:', error.response?.data || error.message);
    
    // Check if this is a network connectivity issue
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('⚠️  Network error: Cannot reach Coinbase API. Check your internet connection and firewall settings.');
      throw new Error(
        `Network error: Unable to reach Coinbase API. Please check your connection and try again.`
      );
    }
    
    throw new Error(
      `Failed to fetch charge status: ${error.response?.data?.message || error.message}`
    );
  }
}

export function getCryptoCode(cryptoType: string): string | null {
  return cryptoMap[cryptoType] || null;
}

export function getChargeHostedUrl(charge: CoinbaseCharge): string {
  return charge.hosted_url;
}

export function getChargePaymentAddress(charge: CoinbaseCharge, cryptoType: string): string | null {
  const cryptoCode = cryptoMap[cryptoType];
  if (!cryptoCode) return null;
  return charge.addresses[cryptoCode] || null;
}
