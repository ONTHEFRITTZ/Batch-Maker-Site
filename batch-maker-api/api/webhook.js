require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User, Business, getDeviceLimitForTier } = require('./index');

const router = express.Router();

function getTierFromQuantity(quantity) {
  if (quantity >= 3) return 'enterprise';
  if (quantity >= 2) return 'business';
  return 'individual';
}

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  console.log('✅ Received webhook:', event.type);
  
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleCheckoutComplete(session) {
  console.log('💳 Checkout completed:', session.id);
  try {
    const userId = session.metadata.userId;
    const tier = session.metadata.tier || getTierFromQuantity(session.metadata.quantity || 1);
    if (!userId) {
      console.error('Missing userId in checkout session metadata');
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found:', userId);
      return;
    }
    user.subscriptionTier = tier;
    user.subscriptionStatus = 'active';
    user.maxDevices = getDeviceLimitForTier(tier);
    user.stripeCustomerId = session.customer;
    user.stripeSubscriptionId = session.subscription;
    user.updatedAt = new Date();
    await user.save();
    
    if (['individual', 'business', 'enterprise'].includes(tier) && !user.businessId) {
      const business = new Business({ name: `${user.name}'s Business`, ownerId: user._id });
      await business.save();
      user.businessId = business._id;
      await user.save();
      console.log('✅ Business created for user:', user.email);
    }
    console.log('✅ User subscription activated:', user.email, '->', tier);
  } catch (error) {
    console.error('Error in handleCheckoutComplete:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  console.log('📝 Subscription created:', subscription.id);
  try {
    const customerId = subscription.customer;
    const quantity = subscription.items.data[0].quantity;
    const tier = getTierFromQuantity(quantity);
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) {
      console.error('User not found for customer:', customerId);
      return;
    }
    user.subscriptionTier = tier;
    user.subscriptionStatus = 'active';
    user.maxDevices = getDeviceLimitForTier(tier);
    user.stripeSubscriptionId = subscription.id;
    user.updatedAt = new Date();
    await user.save();
    console.log('✅ Subscription activated:', user.email, '->', tier, '(qty:', quantity, ')');
  } catch (error) {
    console.error('Error in handleSubscriptionCreated:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 Subscription updated:', subscription.id);
  try {
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (!user) {
      console.error('User not found for subscription:', subscription.id);
      return;
    }
    const quantity = subscription.items.data[0].quantity;
    const tier = getTierFromQuantity(quantity);
    user.subscriptionStatus = subscription.status;
    user.subscriptionTier = tier;
    user.maxDevices = getDeviceLimitForTier(tier);
    user.updatedAt = new Date();
    await user.save();
    console.log('✅ Subscription updated:', user.email, 'Status:', subscription.status, 'Tier:', tier, '(qty:', quantity, ')');
  } catch (error) {
    console.error('Error in handleSubscriptionUpdated:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('❌ Subscription deleted:', subscription.id);
  try {
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (!user) {
      console.error('User not found for subscription:', subscription.id);
      return;
    }
    user.subscriptionTier = 'free';
    user.subscriptionStatus = 'canceled';
    user.maxDevices = getDeviceLimitForTier('free');
    user.updatedAt = new Date();
    await user.save();
    console.log('✅ User downgraded to free:', user.email);
  } catch (error) {
    console.error('Error in handleSubscriptionDeleted:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  console.log('💰 Payment succeeded:', invoice.id);
  try {
    const subscriptionId = invoice.subscription;
    const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
    if (user && user.subscriptionStatus !== 'active') {
      user.subscriptionStatus = 'active';
      user.updatedAt = new Date();
      await user.save();
      console.log('✅ Subscription reactivated after payment:', user.email);
    }
  } catch (error) {
    console.error('Error in handlePaymentSucceeded:', error);
  }
}

async function handlePaymentFailed(invoice) {
  console.log('⚠️ Payment failed:', invoice.id);
  try {
    const subscriptionId = invoice.subscription;
    const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
    if (user) {
      user.subscriptionStatus = 'past_due';
      user.updatedAt = new Date();
      await user.save();
      console.log('⚠️ Subscription marked as past due:', user.email);
    }
  } catch (error) {
    console.error('Error in handlePaymentFailed:', error);
  }
}

module.exports = router;