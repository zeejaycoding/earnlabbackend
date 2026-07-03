"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const requireAuth_1 = __importDefault(require("../utils/requireAuth"));
const PayoutOption_1 = __importDefault(require("../models/PayoutOption"));
const Withdrawal_1 = __importDefault(require("../models/Withdrawal"));
const Notification_1 = __importDefault(require("../models/Notification"));
const giftbitService_1 = require("../services/giftbitService");
const emailService_1 = __importDefault(require("../services/emailService"));
const router = (0, express_1.Router)();
/**
 * GET /api/v1/payouts/options
 * List all available payout methods
 */
// Note: router is mounted at /api/v1 so expose full path here for simplicity
router.get('/payouts/options', async (_req, res, next) => {
    try {
        const options = await PayoutOption_1.default.find({}).lean().exec();
        // Fallback default methods if DB empty
        if (!options || options.length === 0) {
            return res.json([
                { key: 'crypto', name: 'Cryptocurrency', description: 'Bitcoin, Ethereum, etc.', enabled: true },
                { key: 'paypal', name: 'PayPal', description: 'PayPal account transfer', enabled: true },
                { key: 'giftcard', name: 'Gift Card', description: 'Amazon, Steam, Apple, etc.', enabled: true },
                { key: 'bank_transfer', name: 'Bank Transfer', description: 'Direct bank transfer', enabled: true },
            ]);
        }
        return res.json(options);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/giftcard/denominations/:brandCode
 * Get supported denominations for a gift card brand
 */
router.get('/giftcard/denominations/:brandCode', async (req, res, next) => {
    try {
        const { brandCode } = req.params;
        const giftbitService = (0, giftbitService_1.getGiftbitService)();
        // Try to fetch fresh denominations from Giftbit API
        let denominations = await giftbitService.fetchBrandDenominations(brandCode);
        // Fallback to cached if fetch fails
        if (denominations.length === 0) {
            denominations = giftbitService.getSupportedDenominations(brandCode);
        }
        if (denominations.length === 0) {
            return res.status(400).json({
                message: 'Gift card brand not found or not supported',
                brandCode
            });
        }
        return res.json({
            brandCode,
            denominations,
            supportedDenominations: denominations.map(d => `$${d}`)
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/withdrawals/request
 * Submit a manual withdrawal request
 * User requests cash-out, admin reviews and approves/rejects
 */
router.post('/user/withdrawals/request', requireAuth_1.default, (0, express_validator_1.body)('amountCents').isInt({ gt: 0 }), (0, express_validator_1.body)('method').isString().isLength({ min: 1 }), (0, express_validator_1.body)('destination').isString().isLength({ min: 1 }), async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Validation error', errors: errors.array() });
        }
        const { amountCents, method, destination, giftCardType } = req.body;
        const user = req.user;
        // Validate method
        const validMethods = ['crypto', 'paypal', 'giftcard', 'bank_transfer'];
        if (!validMethods.includes(method)) {
            return res.status(400).json({ message: 'Invalid withdrawal method' });
        }
        // Validate gift card type if method is giftcard
        if (method === 'giftcard') {
            const validGiftCards = ['amazon', 'google_play', 'apple_itunes', 'steam', 'xbox', 'playstation'];
            if (!giftCardType || !validGiftCards.includes(giftCardType)) {
                return res.status(400).json({ message: 'Invalid gift card type' });
            }
        }
        // Check balance
        if (user.balanceCents < amountCents) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }
        // Store balance before deduction
        const balanceBeforeWithdrawal = user.balanceCents;
        // Deduct immediately (reserve funds)
        user.balanceCents = user.balanceCents - amountCents;
        await user.save();
        // Create withdrawal request with Pending status
        const withdrawalData = {
            user: user._id,
            amountCents,
            method,
            destination,
            status: 'Pending',
            balanceAtWithdrawalCents: balanceBeforeWithdrawal,
        };
        // Only add giftCardType if method is giftcard
        if (method === 'giftcard') {
            withdrawalData.giftCardType = giftCardType;
        }
        const withdrawal = await Withdrawal_1.default.create(withdrawalData);
        // Create notification for user
        await Notification_1.default.create({
            user: user._id,
            type: 'info',
            title: 'Withdrawal Request Submitted',
            body: `Your withdrawal request for $${(amountCents / 100).toFixed(2)} has been submitted and is pending admin review.`,
            read: false,
        });
        // Send email notification for payout request received
        try {
            if (user.email) {
                await emailService_1.default.sendPayoutRequestReceived({
                    username: user.username || user.displayName || "User",
                    email: user.email,
                    amount: amountCents,
                    method: method.charAt(0).toUpperCase() + method.slice(1),
                    status: "Pending",
                });
            }
        }
        catch (emailErr) {
            console.log("Email notification skipped:", emailErr);
        }
        return res.status(201).json({
            withdrawalId: withdrawal._id,
            status: withdrawal.status,
            message: 'Withdrawal request submitted successfully. Please wait for admin approval.',
        });
    }
    catch (err) {
        console.error('Error creating withdrawal request:', err);
        next(err);
    }
});
/**
 * GET /api/v1/user/withdrawals/history
 */
router.get('/user/withdrawals/history', requireAuth_1.default, async (req, res, next) => {
    try {
        const user = req.user;
        const history = await Withdrawal_1.default.find({ user: user._id }).sort({ createdAt: -1 }).lean().exec();
        return res.json({ history });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/user/withdrawals/:withdrawalId
 * Get withdrawal request details
 */
router.get('/user/withdrawals/:withdrawalId', requireAuth_1.default, async (req, res, next) => {
    try {
        const { withdrawalId } = req.params;
        const user = req.user;
        const withdrawal = await Withdrawal_1.default.findById(withdrawalId).exec();
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }
        // Check ownership
        if (withdrawal.user.toString() !== user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        return res.json({ withdrawal });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/user/withdrawals/status/:withdrawalId
 * Check withdrawal request status
 */
router.get('/user/withdrawals/status/:withdrawalId', requireAuth_1.default, async (req, res, next) => {
    try {
        const { withdrawalId } = req.params;
        const user = req.user;
        const withdrawal = await Withdrawal_1.default.findById(withdrawalId).exec();
        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }
        // Check ownership
        if (withdrawal.user.toString() !== user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        return res.json({
            status: withdrawal.status,
            amountCents: withdrawal.amountCents,
            method: withdrawal.method,
            giftCardType: withdrawal.giftCardType,
            giftCardCode: withdrawal.giftCardCode,
            approvalNotes: withdrawal.approvalNotes,
            rejectionReason: withdrawal.rejectionReason,
            approvedAt: withdrawal.approvedAt,
            rejectedAt: withdrawal.rejectedAt,
            completedAt: withdrawal.completedAt,
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/v1/user/giftcard/redeem
 * Submit a gift card redemption request
 * User selects gift card type and denomination, admin reviews and sends code
 */
router.post('/user/giftcard/redeem', requireAuth_1.default, (0, express_validator_1.body)('giftCardType').isString().isLength({ min: 1 }), (0, express_validator_1.body)('denomination').isInt({ gt: 0 }), (0, express_validator_1.body)('currency').isIn(['USD', 'EUR']), async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Validation error', errors: errors.array() });
        }
        const { giftCardType, denomination, currency } = req.body;
        const user = req.user;
        // Validate gift card type
        const validGiftCards = ['amazon', 'google_play', 'apple_itunes', 'steam', 'xbox', 'playstation'];
        if (!validGiftCards.includes(giftCardType)) {
            return res.status(400).json({ message: 'Invalid gift card type' });
        }
        // Validate brand/denomination combination
        const giftbitService = (0, giftbitService_1.getGiftbitService)();
        const brandCodeMap = {
            'amazon': 'amazon',
            'google_play': 'google_play',
            'apple_itunes': 'apple_itunes',
            'steam': 'steam',
            'xbox': 'xbox',
            'playstation': 'playstation',
        };
        const brandCode = brandCodeMap[giftCardType] || giftCardType;
        // Fetch fresh denominations from Giftbit to ensure accuracy
        await giftbitService.fetchBrandDenominations(brandCode);
        if (!giftbitService.validateBrandDenomination(brandCode, denomination)) {
            const supportedDenominations = giftbitService.getSupportedDenominations(brandCode);
            return res.status(400).json({
                message: `${giftCardType} does not support $${denomination} denomination`,
                supportedDenominations: supportedDenominations.map(d => `$${d}`),
                available: supportedDenominations
            });
        }
        // Convert denomination to cents
        const amountCents = denomination * 100;
        // Check balance
        if (user.balanceCents < amountCents) {
            return res.status(400).json({
                message: 'Insufficient balance',
                required: denomination,
                available: user.balanceCents / 100
            });
        }
        // Store balance before deduction
        const balanceBeforeWithdrawal = user.balanceCents;
        // Deduct immediately (reserve funds)
        user.balanceCents = user.balanceCents - amountCents;
        await user.save();
        let giftCardCode = '';
        let giftbitError = null;
        try {
            // Generate code from Giftbit
            const orderResult = await (0, giftbitService_1.getGiftbitService)().createGiftCardOrder([{
                    brandCode,
                    value: denomination,
                    currency,
                    recipientEmail: user.email,
                    recipientName: user.email.split('@')[0],
                    giftMessage: `Your EarnLab ${currency}${denomination} ${giftCardType} gift card!`,
                }], `earnlab-giftcard-${Date.now()}`);
            // Extract code from Giftbit response
            if (orderResult.cards && orderResult.cards.length > 0) {
                const card = orderResult.cards[0];
                giftCardCode = card.cardNumber || card.cardPin || card.redemptionUrl || 'CODE_GENERATED';
            }
        }
        catch (err) {
            console.error('Giftbit code generation error:', err);
            // Continue without code - admin will add it manually
            giftCardCode = 'PENDING_MANUAL_ENTRY';
            giftbitError = err.message || 'Failed to generate code from Giftbit';
        }
        // Create gift card redemption request with generated code
        const redemption = await Withdrawal_1.default.create({
            user: user._id,
            amountCents,
            method: 'giftcard',
            destination: user.email, // Send to user's email
            status: 'Pending',
            giftCardType,
            giftCardDenomination: denomination,
            giftCardCurrency: currency,
            giftCardCode: giftCardCode !== 'PENDING_MANUAL_ENTRY' ? giftCardCode : null,
            balanceAtWithdrawalCents: balanceBeforeWithdrawal,
        });
        // Create notification for user
        await Notification_1.default.create({
            user: user._id,
            type: 'info',
            title: 'Gift Card Redemption Submitted',
            body: `Your ${currency}${denomination} ${giftCardType} gift card redemption request has been submitted. The admin will review and send the code to your email shortly.`,
            read: false,
        });
        return res.status(201).json({
            redemptionId: redemption._id,
            status: redemption.status,
            giftCardCode: giftCardCode !== 'PENDING_MANUAL_ENTRY' ? giftCardCode : null,
            requiresManualEntry: giftCardCode === 'PENDING_MANUAL_ENTRY',
            giftbitError: giftbitError,
            message: giftCardCode === 'PENDING_MANUAL_ENTRY'
                ? 'Gift card redemption submitted. Admin will generate and send the code to your email.'
                : 'Gift card redemption submitted successfully. Check your email for the code.',
        });
    }
    catch (err) {
        console.error('Error creating gift card redemption:', err);
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=payouts.js.map