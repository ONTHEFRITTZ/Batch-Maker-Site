// pages/api/subscriptions/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';
import crypto from 'crypto';

// Verify webhook signature from RevenueCat
function verifyWebhook(req: NextApiRequest): boolean {
  const signature = req.headers['x-revenuecat-signature'] as string;
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET!;
  
  if (!signature || !secret) return false;

  const payload = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');

  return signature === expectedSignature;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify webhook signature
    if (!verifyWebhook(req)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    const eventType = event.type;
    const appUserId = event.app_user_id; // This is your Supabase user ID

    console.log('RevenueCat webhook:', eventType, appUserId);

    // Handle different event types
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
        // Activate subscription
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: 'active',
            subscription_platform: event.store === 'APP_STORE' ? 'ios' : 'android',
            subscription_expires_at: event.expiration_at_ms 
              ? new Date(event.expiration_at_ms).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        break;

      case 'CANCELLATION':
        // Mark as cancelled but keep active until expiry
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        break;

      case 'EXPIRATION':
        // Subscription expired
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        break;

      case 'BILLING_ISSUE':
        // Billing problem
        console.warn('Billing issue for user:', appUserId);
        break;

      default:
        console.log('Unhandled event type:', eventType);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Disable body parsing to access raw body for signature verification
export const config = {
  api: {
    bodyParser: true, // RevenueCat sends JSON
  },
};