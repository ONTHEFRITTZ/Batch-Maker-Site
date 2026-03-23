require('dotenv').config();
const express = require('express');
const { User, Business, Network, authenticateToken } = require('./index');

const router = express.Router();

router.get('/discover', authenticateToken, async (req, res) => {
  try {
    const premiumUsers = await User.find({
      subscriptionTier: { $in: ['individual', 'business', 'enterprise'] },
      subscriptionStatus: 'active',
      businessId: { $exists: true, $ne: null }
    }).populate('businessId');

    const availableNetworks = [];
    for (const user of premiumUsers) {
      const business = user.businessId;
      if (!business) continue;
      const connectedCount = business.connectedDevices.length;
      const maxDevices = user.maxDevices;
      const isAvailable = connectedCount < maxDevices;
      availableNetworks.push({
        businessId: business._id,
        businessName: business.name,
        ownerName: user.name,
        ownerEmail: user.email,
        tier: user.subscriptionTier,
        connectedDevices: connectedCount,
        maxDevices: maxDevices,
        isAvailable: isAvailable,
        deviceList: business.connectedDevices.map(d => ({ deviceName: d.deviceName, lastActive: d.lastActive }))
      });
    }
    availableNetworks.sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
      return a.businessName.localeCompare(b.businessName);
    });
    res.json({ networks: availableNetworks, count: availableNetworks.length });
  } catch (error) {
    console.error('Error discovering networks:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/connect', authenticateToken, async (req, res) => {
  try {
    const { businessId, deviceId, deviceName } = req.body;
    if (!businessId || !deviceId || !deviceName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    const owner = await User.findById(business.ownerId);
    if (!owner) return res.status(404).json({ error: 'Business owner not found' });
    if (owner.subscriptionStatus !== 'active') {
      return res.status(403).json({ error: 'Business subscription is not active' });
    }
    if (business.connectedDevices.length >= owner.maxDevices) {
      return res.status(403).json({ 
        error: 'Device limit reached',
        maxDevices: owner.maxDevices,
        currentDevices: business.connectedDevices.length
      });
    }
    const existingDevice = business.connectedDevices.find(d => d.deviceId === deviceId);
    if (existingDevice) {
      existingDevice.lastActive = new Date();
      await business.save();
      return res.json({ success: true, message: 'Device already connected', device: existingDevice });
    }
    business.connectedDevices.push({
      userId: req.user.id,
      deviceId: deviceId,
      deviceName: deviceName,
      lastActive: new Date()
    });
    await business.save();
    console.log('✅ Device connected:', deviceName, 'to', business.name);
    res.json({
      success: true,
      message: 'Connected to network',
      business: {
        id: business._id,
        name: business.name,
        connectedDevices: business.connectedDevices.length,
        maxDevices: owner.maxDevices
      }
    });
  } catch (error) {
    console.error('Error connecting to network:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/disconnect', authenticateToken, async (req, res) => {
  try {
    const { businessId, deviceId } = req.body;
    if (!businessId || !deviceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    business.connectedDevices = business.connectedDevices.filter(d => d.deviceId !== deviceId);
    await business.save();
    console.log('✅ Device disconnected:', deviceId, 'from', business.name);
    res.json({ success: true, message: 'Disconnected from network' });
  } catch (error) {
    console.error('Error disconnecting from network:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/devices/:businessId', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req.params;
    const business = await Business.findById(businessId).populate('connectedDevices.userId', 'name email');
    if (!business) return res.status(404).json({ error: 'Business not found' });
    const owner = await User.findById(business.ownerId);
    const isOwner = business.ownerId.toString() === req.user.id;
    const isConnected = business.connectedDevices.some(d => d.userId && d.userId._id.toString() === req.user.id);
    if (!isOwner && !isConnected) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({
      businessName: business.name,
      connectedDevices: business.connectedDevices.map(d => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        userName: d.userId ? d.userId.name : 'Unknown',
        userEmail: d.userId ? d.userId.email : null,
        lastActive: d.lastActive
      })),
      maxDevices: owner ? owner.maxDevices : 0,
      isOwner
    });
  } catch (error) {
    console.error('Error fetching connected devices:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/heartbeat', authenticateToken, async (req, res) => {
  try {
    const { businessId, deviceId } = req.body;
    if (!businessId || !deviceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    const device = business.connectedDevices.find(d => d.deviceId === deviceId);
    if (device) {
      device.lastActive = new Date();
      await business.save();
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating heartbeat:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;