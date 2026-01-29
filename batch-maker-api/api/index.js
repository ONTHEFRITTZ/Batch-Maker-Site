require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: ['https://batchmaker.app', 'https://dashboard.batchmaker.app', 'http://localhost:3000', 'http://localhost:19006'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Global connection cache for serverless
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined');
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 75000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });
    
    cachedDb = mongoose.connection;
    console.log('✅ MongoDB connected');
    return cachedDb;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

// Attempt initial connection
connectToDatabase().catch(err => console.error('Initial connection failed:', err.message));

// Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  provider: { type: String, enum: ['google', 'apple'], required: true },
  providerId: { type: String, required: true },
  subscriptionTier: { type: String, enum: ['free', 'individual', 'business', 'enterprise'], default: 'free' },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  subscriptionStatus: { type: String, enum: ['active', 'inactive', 'past_due', 'canceled'], default: 'inactive' },
  maxDevices: { type: Number, default: 1 },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const businessSchema = new mongoose.Schema({
  name: String,
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  connectedDevices: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deviceId: String,
    deviceName: String,
    lastActive: Date
  }],
  workflows: [{
    workflowId: String,
    name: String,
    sharedAt: Date
  }],
  createdAt: { type: Date, default: Date.now }
});

const networkSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  hostDeviceId: String,
  hostUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  connectedDevices: [{
    deviceId: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deviceName: String,
    connectedAt: Date
  }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now }
});

// Models - use mongoose.models to prevent recompilation in serverless
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Business = mongoose.models.Business || mongoose.model('Business', businessSchema);
const Network = mongoose.models.Network || mongoose.model('Network', networkSchema);

// Helper functions
function getDeviceLimitForTier(tier) {
  const limits = { free: 1, individual: 5, business: 15, enterprise: 999 };
  return limits[tier] || 1;
}

const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, tier: user.subscriptionTier },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Routes
app.get('/health', async (req, res) => {
  try {
    await connectToDatabase();
  } catch (err) {
    console.error('Health check connection error:', err.message);
  }
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    mongooseState: mongoose.connection.readyState,
    states: {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    }
  });
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const user = await User.findById(req.user.id).populate('businessId').select('-__v');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        maxDevices: user.maxDevices,
        business: user.businessId,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/network/available', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const premiumUsers = await User.find({
      subscriptionTier: { $in: ['individual', 'business', 'enterprise'] },
      subscriptionStatus: 'active'
    }).populate('businessId');

    const availableNetworks = [];
    for (const user of premiumUsers) {
      if (user.businessId) {
        const business = user.businessId;
        const connectedCount = business.connectedDevices.length;
        const isAvailable = connectedCount < user.maxDevices;
        availableNetworks.push({
          businessId: business._id,
          businessName: business.name || `${user.name}'s Network`,
          ownerName: user.name,
          connectedDevices: connectedCount,
          maxDevices: user.maxDevices,
          isAvailable,
          tier: user.subscriptionTier
        });
      }
    }
    res.json({ networks: availableNetworks });
  } catch (error) {
    console.error('Error fetching available networks:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/business/create', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const { name } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.businessId) return res.status(400).json({ error: 'Business already exists' });
    
    const business = new Business({
      name: name || `${user.name}'s Business`,
      ownerId: user._id
    });
    await business.save();
    
    user.businessId = business._id;
    await user.save();
    
    res.json({
      success: true,
      business: {
        id: business._id,
        name: business.name,
        ownerId: business.ownerId
      }
    });
  } catch (error) {
    console.error('Error creating business:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;

// Export models and helpers for other files
module.exports.User = User;
module.exports.Business = Business;
module.exports.Network = Network;
module.exports.authenticateToken = authenticateToken;
module.exports.generateToken = generateToken;
module.exports.getDeviceLimitForTier = getDeviceLimitForTier;