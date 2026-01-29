require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User, Business, authenticateToken, getDeviceLimitForTier } = require('./index');

const router = express.Router();

const TIERED_PRICE_ID = process.env.STRIPE_PRICE_TIERED;

router.post('/create-checkout', authenticateToken, async (req, res) => {
  try {
    const { tier } = req.body;
    if (!['individual', 'business', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!TIERED_PRICE_ID) return res.status(500).json({ error: 'Stripe price not configured' });
    
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user._id.toString() }
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    let quantity = 1;
    if (tier === 'business') quantity = 2;
    if (tier === 'enterprise') quantity = 3;

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: TIERED_PRICE_ID, quantity: quantity }],
      mode: 'subscription',
      success_url: `${process.env.DASHBOARD_URL || 'https://dashboard.batchmaker.app'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DASHBOARD_URL || 'https://dashboard.batchmaker.app'}/pricing`,
      metadata: { userId: user._id.toString(), tier: tier, quantity: quantity }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error.message });
  }
});

router.post('/create-portal', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.DASHBOARD_URL || 'https://dashboard.batchmaker.app'}/account`,
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-__v');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    let subscriptionDetails = null;
    if (user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const quantity = subscription.items.data[0].quantity;
        subscriptionDetails = {
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          quantity: quantity,
          tier: user.subscriptionTier
        };
      } catch (error) {
        console.error('Error fetching Stripe subscription:', error);
      }
    }
    res.json({
      tier: user.subscriptionTier,
      status: user.subscriptionStatus,
      maxDevices: user.maxDevices,
      subscription: subscriptionDetails
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }
    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: true });
    res.json({
      success: true,
      message: 'Subscription will be canceled at period end',
      cancelAt: new Date(subscription.current_period_end * 1000)
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

router.post('/reactivate', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No subscription found' });
    }
    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: false });
    res.json({ success: true, message: 'Subscription reactivated', status: subscription.status });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

router.post('/change-plan', authenticateToken, async (req, res) => {
  try {
    const { newTier } = req.body;
    if (!['individual', 'business', 'enterprise'].includes(newTier)) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }
    const user = await User.findById(req.user.id);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    let newQuantity = 1;
    if (newTier === 'business') newQuantity = 2;
    if (newTier === 'enterprise') newQuantity = 3;

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: subscription.items.data[0].id, quantity: newQuantity }],
      proration_behavior: 'create_prorations',
    });

    user.subscriptionTier = newTier;
    user.maxDevices = getDeviceLimitForTier(newTier);
    await user.save();

    res.json({
      success: true,
      message: `Subscription changed to ${newTier}`,
      tier: newTier,
      maxDevices: user.maxDevices,
      quantity: newQuantity
    });
  } catch (error) {
    console.error('Error changing subscription plan:', error);
    res.status(500).json({ error: 'Failed to change subscription' });
  }
});

module.exports = router;