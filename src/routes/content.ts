import { Router, Request, Response, NextFunction } from 'express';
import dayjs from 'dayjs';

const router = Router();

/**
 * Simple content endpoints for:
 *  - GET /api/v1/content/faq
 *  - GET /api/v1/content/tos
 *  - GET /api/v1/content/privacy
 *
 * The module uses in-memory static content as a fallback. In a real
 * deployment these would typically be loaded from a database or from
 * CMS-backed files and versioned.
 *
 * Optional query param: ?format=html will return HTML (very small conversion)
 * otherwise the endpoints return structured JSON with `format: 'markdown'`.
 */

/* -------------------------
   Static content (fallback)
   ------------------------- */

const lastUpdated = new Date().toISOString();

const FAQ = [
  {
    id: 'faq-1',
    question: 'How do I earn money on EarnLab?',
    answer:
      'Complete offers from offerwalls, play games, and participate in promotions. Your earnings are credited to your account balance where you can later withdraw.',
  },
  {
    id: 'faq-2',
    question: 'How do referrals work?',
    answer:
      'Share your affiliate link with friends. When they sign up using your code and meet the referral conditions, you will receive referral earnings which you can claim from your referrals dashboard.',
  },
  {
    id: 'faq-3',
    question: 'What payout methods are available?',
    answer:
      'We support multiple payout methods (PayPal, Crypto, WorldCoin). Visit the payouts endpoint to see available options for your account and region.',
  },
  {
    id: 'faq-4',
    question: 'I think I found a bug — how do I report it?',
    answer:
      'Use the support contact form on the app or POST to /api/v1/support/contact with details. Include screenshots, timestamps, and steps to reproduce if possible.',
  },
];

const TOS_MARKDOWN = `# EarnLab Terms of Service

Welcome to EarnLab. By using our services you agree to the following terms and conditions.

## Accounts
You must provide accurate information when creating an account. Abused or fraudulent accounts may be suspended.

## Payments and Withdrawals
Payouts are processed according to the payout methods and minimums listed in the app. We reserve the right to review and hold withdrawals for fraud prevention.

## Acceptable Use
You may not use automated means to abuse offers, manipulate tasks, or otherwise circumvent our systems.

## Changes
We may modify these terms with notice. Continued use after changes constitutes acceptance.

---
Last updated: ${dayjs(lastUpdated).format()}
`;

const PRIVACY_MARKDOWN = `# Privacy Policy

Your privacy matters. This document explains what data we collect and how it's used.

## Data Collected
We collect information required to operate the service: account details (email, username), basic device and usage analytics, and transactional data (earnings, withdrawals).

## Uses
Data is used to operate the platform, process payments, detect abuse, and to send important notifications.

## Third Parties
We may share limited data with payment processors and analytics providers under contractual obligations.

## Requests
You may request data export or deletion by contacting support.

---
Last updated: ${dayjs(lastUpdated).format()}
`;

/* -------------------------
   Helpers
   ------------------------- */

function toHtmlFromMarkdown(md: string) {
  // Minimal and safe conversion: headings and paragraphs + line breaks.
  // This is intentionally simple and not a full markdown renderer.
  return md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\n{2,}/gim, '</p><p>')
    .replace(/\n/gim, '<br/>')
    .replace(/<\/p><p>/, '<p>')
    .replace(/^/, '<p>')
    .concat('</p>');
}

/* -------------------------
   Routes
   ------------------------- */

/**
 * GET /api/v1/content/faq
 * Returns array of FAQ entries.
 */
router.get('/faq', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Provide small metadata and the FAQ list
    return res.json({
      format: 'json',
      lastUpdated,
      faq: FAQ,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/content/tos
 * Query param: ?format=html  (optional)
 */
router.get('/tos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const format = (req.query.format as string) || 'markdown';
    if (format.toLowerCase() === 'html') {
      return res.json({
        format: 'html',
        lastUpdated,
        title: 'Terms of Service',
        content: toHtmlFromMarkdown(TOS_MARKDOWN),
      });
    }

    return res.json({
      format: 'markdown',
      lastUpdated,
      title: 'Terms of Service',
      content: TOS_MARKDOWN,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/content/privacy
 * Query param: ?format=html  (optional)
 */
router.get('/privacy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const format = (req.query.format as string) || 'markdown';
    if (format.toLowerCase() === 'html') {
      return res.json({
        format: 'html',
        lastUpdated,
        title: 'Privacy Policy',
        content: toHtmlFromMarkdown(PRIVACY_MARKDOWN),
      });
    }

    return res.json({
      format: 'markdown',
      lastUpdated,
      title: 'Privacy Policy',
      content: PRIVACY_MARKDOWN,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
