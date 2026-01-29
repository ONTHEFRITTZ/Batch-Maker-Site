require('dotenv').config();
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const { User, generateToken, getDeviceLimitForTier } = require('./index');

const router = express.Router();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI || '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ provider: 'google', providerId: profile.id });
      if (!user) {
        user = new User({
          email: profile.emails[0].value,
          name: profile.displayName,
          provider: 'google',
          providerId: profile.id,
          subscriptionTier: 'free',
          maxDevices: getDeviceLimitForTier('free')
        });
        await user.save();
        console.log('✅ New user created via Google:', user.email);
      } else {
        user.updatedAt = new Date();
        await user.save();
      }
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed` }),
  async (req, res) => {
    try {
      const token = generateToken(req.user);
      res.redirect(`${process.env.DASHBOARD_URL}?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        tier: req.user.subscriptionTier
      }))}`);
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
    }
  }
);

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-__v');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      valid: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        maxDevices: user.maxDevices
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', valid: false });
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token', valid: false });
    console.error('Error verifying token:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;