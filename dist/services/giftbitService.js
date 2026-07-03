"use strict";
/**
 * Giftbit Service
 * Handles all interactions with Giftbit API for gift card management
 * API Documentation: https://www.giftbit.com/platform-api/
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGiftbitService = getGiftbitService;
const axios_1 = __importDefault(require("axios"));
// Supported denominations per brand (in dollars)
// These are cached from Giftbit's /brands endpoint
// Conservative defaults for testbed environment - will be updated dynamically
let BRAND_DENOMINATIONS = {
    'amazon': [25, 50, 100],
    'google_play': [20, 50],
    'apple_itunes': [25, 50],
    'steam': [20, 50],
    'xbox': [20, 50],
    'playstation': [20, 50],
};
class GiftbitService {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.client = axios_1.default.create({
            baseURL: config.baseUrl,
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }
    /**
     * Fetch and cache supported denominations from Giftbit
     * @param brandCode - The brand code to fetch details for
     */
    async fetchBrandDenominations(brandCode) {
        try {
            const response = await this.client.get(`/brands/${brandCode}`);
            const brand = response.data.brand || response.data;
            // Extract denominations from brand details
            let denominations = [];
            if (brand.denominations && Array.isArray(brand.denominations)) {
                // If Giftbit returns denominations directly
                denominations = brand.denominations.map((d) => {
                    if (typeof d === 'number')
                        return d;
                    if (typeof d === 'string')
                        return parseInt(d);
                    if (d.value)
                        return d.value;
                    return 0;
                }).filter((d) => d > 0);
            }
            else if (brand.min_value && brand.max_value) {
                // If Giftbit returns min/max range, generate common denominations
                const min = brand.min_value / 100; // Convert from cents
                const max = brand.max_value / 100;
                denominations = [10, 20, 25, 50, 100].filter(d => d >= min && d <= max);
            }
            if (denominations.length > 0) {
                BRAND_DENOMINATIONS[brandCode.toLowerCase()] = denominations;
                console.log(`✅ Updated ${brandCode} denominations:`, denominations);
            }
            return denominations;
        }
        catch (error) {
            console.error(`Failed to fetch brand details for ${brandCode}:`, error.message);
            // Return cached value as fallback
            return BRAND_DENOMINATIONS[brandCode.toLowerCase()] || [];
        }
    }
    /**
     * Validate if a brand/denomination combination is supported
     * @param brandCode - The brand code
     * @param valueInDollars - The value in dollars
     * @returns true if valid, false otherwise
     */
    validateBrandDenomination(brandCode, valueInDollars) {
        const supportedDenominations = BRAND_DENOMINATIONS[brandCode.toLowerCase()];
        if (!supportedDenominations) {
            return false;
        }
        return supportedDenominations.includes(valueInDollars);
    }
    /**
     * Get supported denominations for a brand
     * @param brandCode - The brand code
     * @returns Array of supported denominations in dollars
     */
    getSupportedDenominations(brandCode) {
        return BRAND_DENOMINATIONS[brandCode.toLowerCase()] || [];
    }
    /**
     * Get available gift card brands
     * @returns List of available brands
     */
    async getBrands() {
        try {
            const response = await this.client.get('/brands');
            // Giftbit API returns { brands: [...] } not the array directly
            return response.data.brands || response.data || [];
        }
        catch (error) {
            console.error('Giftbit getBrands error:', error.response?.data || error.message);
            throw new Error(`Failed to fetch brands: ${error.response?.data?.message || error.message}`);
        }
    }
    /**
     * Get details of a specific brand
     * @param brandCode - The brand code (e.g., 'amazon', 'starbucks')
     */
    async getBrandDetails(brandCode) {
        try {
            const response = await this.client.get(`/brands/${brandCode}`);
            // Giftbit API may return { brand: {...} } or the brand object directly
            return response.data.brand || response.data;
        }
        catch (error) {
            console.error('Giftbit getBrandDetails error:', error.response?.data || error.message);
            throw new Error(`Failed to fetch brand details: ${error.response?.data?.message || error.message}`);
        }
    }
    /**
     * Create a gift card order (Payout)
     * @param orderItems - Array of gift card items to order
     * @param externalRefId - External reference ID for tracking
     */
    async createGiftCardOrder(orderItems, externalRefId) {
        try {
            // Giftbit /campaign endpoint - requires subject, message, price_in_cents, brand_code
            const gift = orderItems[0];
            const giftId = externalRefId || `earnlab-${Date.now()}`;
            const payload = {
                contacts: [
                    {
                        firstname: gift.recipientName || gift.recipientEmail.split('@')[0],
                        email: gift.recipientEmail,
                    }
                ],
                subject: 'Your EarnLab Gift Card Reward!',
                message: gift.giftMessage || 'Thank you for using EarnLab! Enjoy your gift card.',
                price_in_cents: Math.round(gift.value * 100),
                brand_codes: [gift.brandCode],
                id: giftId,
            };
            console.log('📤 Sending gift card order:', JSON.stringify(payload, null, 2));
            // Create campaign with Giftbit
            const response = await this.client.post('/campaign', payload);
            console.log('✅ Giftbit order response:', JSON.stringify(response.data, null, 2));
            // Parse Giftbit response
            const giftData = response.data;
            console.log('📦 Parsed Giftbit response:', {
                id: giftData.id,
                status: giftData.status,
                giftsCount: giftData.gifts?.length || 0,
                gifts: giftData.gifts
            });
            return {
                orderId: giftData.id || giftData.order_id,
                status: giftData.status || 'PENDING',
                cards: giftData.gifts?.map((gift) => ({
                    cardId: gift.id,
                    brandCode: gift.brand_code,
                    value: gift.price_in_cents ? gift.price_in_cents / 100 : 0,
                    currency: gift.currency_code || 'USD',
                    recipientEmail: gift.email,
                    redemptionUrl: gift.link || gift.redemption_url,
                    cardNumber: gift.card_number,
                    cardPin: gift.pin,
                    expiryDate: gift.expiry_date,
                })) || [],
            };
        }
        catch (error) {
            console.error('Giftbit createGiftCardOrder error:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message,
            });
            throw new Error(`Failed to create gift card order: ${error.response?.data?.message || error.message}`);
        }
    }
    /**
     * Check gift card order status
     * @param orderId - The order ID to check
     */
    async getOrderStatus(orderId) {
        try {
            const response = await this.client.get(`/gifts/${orderId}`);
            return response.data;
        }
        catch (error) {
            console.error('Giftbit getOrderStatus error:', error.response?.data || error.message);
            throw new Error(`Failed to get order status: ${error.response?.data?.message || error.message}`);
        }
    }
    /**
     * Get transaction history
     * @param limit - Number of transactions to retrieve
     * @param offset - Offset for pagination
     */
    async getTransactionHistory(limit = 50, offset = 0) {
        try {
            const response = await this.client.get('/gifts', {
                params: {
                    limit,
                    offset,
                },
            });
            return response.data.gifts?.map((gift) => ({
                transactionId: gift.id,
                orderId: gift.orderId || gift.id,
                brandCode: gift.brandCode,
                value: gift.price.value,
                currency: gift.price.currencyCode,
                status: gift.status,
                createdAt: gift.createdDate,
                recipientEmail: gift.email,
            })) || [];
        }
        catch (error) {
            console.error('Giftbit getTransactionHistory error:', error.response?.data || error.message);
            throw new Error(`Failed to get transaction history: ${error.response?.data?.message || error.message}`);
        }
    }
    /**
     * Get account balance
     * @returns Current account balance
     */
    async getAccountBalance() {
        try {
            const response = await this.client.get('/account');
            return {
                balance: response.data.balance || 0,
                currency: response.data.currency || 'USD',
            };
        }
        catch (error) {
            console.error('Giftbit getAccountBalance error:', error.response?.data || error.message);
            throw new Error(`Failed to get account balance: ${error.response?.data?.message || error.message}`);
        }
    }
    /**
     * Cancel a pending gift card order
     * @param orderId - The order ID to cancel
     */
    async cancelOrder(orderId) {
        try {
            await this.client.delete(`/gifts/${orderId}`);
            return true;
        }
        catch (error) {
            console.error('Giftbit cancelOrder error:', error.response?.data || error.message);
            throw new Error(`Failed to cancel order: ${error.response?.data?.message || error.message}`);
        }
    }
    /**
     * Resend gift card notification
     * @param orderId - The order ID to resend
     */
    async resendGiftCard(orderId) {
        try {
            await this.client.post(`/gifts/${orderId}/resend`);
            return true;
        }
        catch (error) {
            console.error('Giftbit resendGiftCard error:', error.response?.data || error.message);
            throw new Error(`Failed to resend gift card: ${error.response?.data?.message || error.message}`);
        }
    }
}
// Singleton instance
let giftbitServiceInstance = null;
function getGiftbitService() {
    if (!giftbitServiceInstance) {
        const apiKey = process.env.GIFTBIT_API_KEY;
        const baseUrl = process.env.GIFTBIT_BASE_URL || 'https://testbedapp.giftbit.com/papi/v1';
        if (!apiKey) {
            throw new Error('GIFTBIT_API_KEY is not configured in environment variables');
        }
        giftbitServiceInstance = new GiftbitService({
            apiKey,
            baseUrl,
        });
    }
    return giftbitServiceInstance;
}
exports.default = GiftbitService;
//# sourceMappingURL=giftbitService.js.map