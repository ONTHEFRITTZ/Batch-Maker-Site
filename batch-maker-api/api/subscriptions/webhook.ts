import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';

// Verify webhook authorization header from RevenueCat
function verifyWebhook(req: NextApiRequest): boolean {
  const authHeader = req.headers['authorization'];
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH; // Changed from SECRET
  
  if (!authHeader || !expectedAuth) {
    console.error('Missing authorization header or expected auth');
    return false;
  }

  // RevenueCat sends: "Bearer YOUR_SECRET_KEY"
  return authHeader === expectedAuth;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify webhook authorization
    if (!verifyWebhook(req)) {
      console.error('Invalid webhook authorization');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = req.body;
    const eventType = event.type;
    const appUserId = event.app_user_id;

    console.log('📩 RevenueCat webhook:', eventType, 'for user:', appUserId);

    // Handle different event types
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
        console.log('✅ Activating subscription for user:', appUserId);
        
        await supabaseAdmin
          .from('profiles')
          .update({
            role: 'premium',
            subscription_status: 'active',
            subscription_platform: event.store === 'APP_STORE' ? 'ios' : 'android',
            subscription_expires_at: event.expiration_at_ms 
              ? new Date(event.expiration_at_ms).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        
        console.log('✅ Subscription activated');
        break;

      case 'CANCELLATION':
        console.log('⚠️ Subscription cancelled for user:', appUserId);
        
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        
        console.log('✅ Subscription marked as cancelled');
        break;

      case 'EXPIRATION':
        console.log('❌ Subscription expired for user:', appUserId);
        
        await supabaseAdmin
          .from('profiles')
          .update({
            role: 'free',
            subscription_status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        
        console.log('✅ User downgraded to free');
        break;

      case 'BILLING_ISSUE':
        console.warn('💳 Billing issue for user:', appUserId);
        
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        
        break;

      case 'SUBSCRIBER_ALIAS':
        console.log('🔗 Subscriber alias event for user:', appUserId);
        break;

      default:
        console.log('ℹ️ Unhandled event type:', eventType);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};