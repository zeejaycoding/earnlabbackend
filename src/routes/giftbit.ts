import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import requireAuth from '../utils/requireAuth';
import { getGiftbitService } from '../services/giftbitService';
import GiftbitTransaction, { IGiftbitTransaction } from '../models/GiftbitTransaction';
import User from '../models/User';

const router = Router();

/**
 * GET /api/v1/giftbit/brands
 * Get available gift card brands from Giftbit
 */
router.get('/giftbit/brands', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const giftbitService = getGiftbitService();
    const brands = await giftbitService.getBrands();
    
    // Debug: log the first brand to see structure
    if (brands && brands.length > 0) {
      console.log('Sample brand data:', JSON.stringify(brands[0], null, 2));
    }
    
    return res.json({
      success: true,
      brands: brands.map((brand: any) => ({
        brandCode: brand.brand_code || brand.brandKey || brand.brandCode,
        brandName: brand.name || brand.brandName,
        description: brand.disclaimer || brand.description,
        shortDescription: brand.short_description || brand.shortDescription,
        imageUrl: brand.image_url || brand.imageUrls?.['1x'] || brand.imageUrls?.['2x'] || null,
        minValue: brand.min_value || brand.minValue || 1,
        maxValue: brand.max_value || brand.maxValue || 2000,
        currency: brand.currency_code || brand.currencyCode || 'USD',
        countries: brand.countries || [],
      })),
    });
  } catch (err: any) {
    console.error('Error fetching Giftbit brands:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch gift card brands',
      error: err.message 
    });
  }
});

/**
 * GET /api/v1/giftbit/brands/:brandCode
 * Get details of a specific brand
 */
router.get('/giftbit/brands/:brandCode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brandCode } = req.params;
    const giftbitService = getGiftbitService();
    const brand = await giftbitService.getBrandDetails(brandCode);
    
    return res.json({
      success: true,
      brand: {
        brandCode: brand.brandKey,
        brandName: brand.brandName,
        description: brand.description,
        disclaimer: brand.disclaimer,
        imageUrl: brand.imageUrls?.['1x'] || brand.imageUrls?.['2x'],
        minValue: brand.minValue,
        maxValue: brand.maxValue,
        currency: brand.currencyCode,
        websites: brand.websites,
        countries: brand.countries,
      },
    });
  } catch (err: any) {
    console.error('Error fetching brand details:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch brand details',
      error: err.message 
    });
  }
});

/**
 * POST /api/v1/giftbit/payout/create
 * Create a gift card payout (send gift card to user)
 */
router.post(
  '/giftbit/payout/create',
  requireAuth,
  body('brandCode').isString().notEmpty(),
  body('brandName').isString().notEmpty(),
  body('amountCents').isInt({ min: 100 }),
  body('recipientEmail').isEmail(),
  body('recipientName').optional().isString(),
  body('giftMessage').optional().isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { brandCode, brandName, amountCents, recipientEmail, recipientName, giftMessage } = req.body;
      const user = (req as any).user;

      // Verify user has sufficient balance
      if (user.balanceCents < amountCents) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance for this payout',
        });
      }

      const giftbitService = getGiftbitService();
      const amountDollars = amountCents / 100;

      // Note: We skip individual brand validation because Giftbit's /brands/{code} endpoint
      // doesn't work reliably with the codes from /brands list. The order creation will validate.

      // Create transaction record
      const transaction = await GiftbitTransaction.create({
        user: user._id,
        type: 'Payout',
        brandCode: brandCode,
        brandName: brandName,
        amountCents,
        currency: 'USD',
        status: 'Pending',
        recipientEmail,
        recipientName: recipientName || recipientEmail,
        giftMessage: giftMessage || 'Thank you for using EarnLab!',
      });

      // Deduct balance immediately (reserve funds)
      user.balanceCents -= amountCents;
      await user.save();

      // Process gift card order with Giftbit
      try {
        transaction.status = 'Processing';
        await transaction.save();

        const orderResult = await giftbitService.createGiftCardOrder(
          [{
            brandCode: brandCode,
            value: amountDollars,
            currency: 'USD',
            recipientEmail,
            recipientName: recipientName || recipientEmail,
            giftMessage: giftMessage || 'Thank you for using EarnLab!',
          }],
          transaction._id.toString()
        );

        // Update transaction with Giftbit response
        transaction.status = 'Completed';
        transaction.giftbitOrderId = orderResult.orderId;
        if (orderResult.cards && orderResult.cards.length > 0) {
          const card = orderResult.cards[0];
          transaction.giftbitCardId = card.cardId;
          transaction.redemptionUrl = card.redemptionUrl;
          transaction.cardNumber = card.cardNumber;
          transaction.cardPin = card.cardPin;
          if (card.expiryDate) {
            transaction.expiryDate = new Date(card.expiryDate);
          }
        }
        await transaction.save();

        return res.status(201).json({
          success: true,
          message: 'Gift card payout created successfully',
          transaction: {
            id: transaction._id,
            brandName: transaction.brandName,
            amount: transaction.amountCents / 100,
            currency: transaction.currency,
            status: transaction.status,
            recipientEmail: transaction.recipientEmail,
            redemptionUrl: transaction.redemptionUrl,
            createdAt: transaction.createdAt,
          },
        });
      } catch (giftbitError: any) {
        // Rollback: refund user balance
        user.balanceCents += amountCents;
        await user.save();

        transaction.status = 'Failed';
        transaction.errorMessage = giftbitError.message;
        await transaction.save();

        return res.status(500).json({
          success: false,
          message: 'Failed to process gift card order',
          error: giftbitError.message,
        });
      }
    } catch (err: any) {
      console.error('Error creating gift card payout:', err);
      next(err);
    }
  }
);

/**
 * GET /api/v1/giftbit/transactions
 * Get user's Giftbit transaction history
 */
router.get(
  '/giftbit/transactions',
  requireAuth,
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const transactions = await GiftbitTransaction.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean()
        .exec() as IGiftbitTransaction[];

      const total = await GiftbitTransaction.countDocuments({ user: user._id });

      return res.json({
        success: true,
        transactions: transactions.map(tx => ({
          id: tx._id,
          type: tx.type,
          brandCode: tx.brandCode,
          brandName: tx.brandName,
          amount: tx.amountCents / 100,
          currency: tx.currency,
          status: tx.status,
          recipientEmail: tx.recipientEmail,
          redemptionUrl: tx.redemptionUrl,
          errorMessage: tx.errorMessage,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (err: any) {
      console.error('Error fetching Giftbit transactions:', err);
      next(err);
    }
  }
);

/**
 * GET /api/v1/giftbit/transactions/:transactionId
 * Get details of a specific transaction
 */
router.get(
  '/giftbit/transactions/:transactionId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const { transactionId } = req.params;

      const transaction = await GiftbitTransaction.findOne({
        _id: transactionId,
        user: user._id,
      }).lean().exec() as IGiftbitTransaction | null;

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
      }

      return res.json({
        success: true,
        transaction: {
          id: transaction._id,
          type: transaction.type,
          brandCode: transaction.brandCode,
          brandName: transaction.brandName,
          amount: transaction.amountCents / 100,
          currency: transaction.currency,
          status: transaction.status,
          recipientEmail: transaction.recipientEmail,
          recipientName: transaction.recipientName,
          giftMessage: transaction.giftMessage,
          redemptionUrl: transaction.redemptionUrl,
          cardNumber: transaction.cardNumber,
          cardPin: transaction.cardPin,
          expiryDate: transaction.expiryDate,
          errorMessage: transaction.errorMessage,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
        },
      });
    } catch (err: any) {
      console.error('Error fetching transaction details:', err);
      next(err);
    }
  }
);

/**
 * POST /api/v1/giftbit/transactions/:transactionId/resend
 * Resend a gift card to the recipient
 */
router.post(
  '/giftbit/transactions/:transactionId/resend',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const { transactionId } = req.params;

      const transaction = await GiftbitTransaction.findOne({
        _id: transactionId,
        user: user._id,
      }).exec();

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
      }

      if (transaction.status !== 'Completed') {
        return res.status(400).json({
          success: false,
          message: 'Can only resend completed transactions',
        });
      }

      if (!transaction.giftbitOrderId) {
        return res.status(400).json({
          success: false,
          message: 'No Giftbit order ID found for this transaction',
        });
      }

      const giftbitService = getGiftbitService();
      await giftbitService.resendGiftCard(transaction.giftbitOrderId);

      return res.json({
        success: true,
        message: 'Gift card resent successfully',
      });
    } catch (err: any) {
      console.error('Error resending gift card:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to resend gift card',
        error: err.message,
      });
    }
  }
);

/**
 * GET /api/v1/giftbit/account/balance
 * Get Giftbit account balance (admin only)
 */
router.get('/giftbit/account/balance', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    
    // Simple admin check - you should implement proper role checking
    if (user.email !== 'admin@earnlab.com' && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - admin access required',
      });
    }

    const giftbitService = getGiftbitService();
    const balance = await giftbitService.getAccountBalance();

    return res.json({
      success: true,
      balance: balance.balance,
      currency: balance.currency,
    });
  } catch (err: any) {
    console.error('Error fetching Giftbit account balance:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch account balance',
      error: err.message,
    });
  }
});

export default router;
