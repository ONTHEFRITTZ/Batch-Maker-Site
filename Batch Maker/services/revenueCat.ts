// services/revenueCat.ts
import Purchases, { 
  PurchasesOffering, 
  CustomerInfo,
  LOG_LEVEL 
} from 'react-native-purchases';
import { Platform } from 'react-native';

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '',
});

/**
 * Initialize RevenueCat
 * Call this once when app starts
 */
export async function initializeRevenueCat(userId?: string): Promise<void> {
  if (!API_KEY) {
    console.warn('⚠️ RevenueCat API key not configured');
    return;
  }

  try {
    // Configure SDK
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    
    // Initialize
    await Purchases.configure({ apiKey: API_KEY });
    
    // Set user ID if authenticated
    if (userId) {
      await Purchases.logIn(userId);
      console.log('✅ RevenueCat initialized with user:', userId);
    } else {
      console.log('✅ RevenueCat initialized (anonymous)');
    }
  } catch (error) {
    console.error('❌ RevenueCat initialization error:', error);
  }
}

/**
 * Login user to RevenueCat
 * Call this after user signs in
 */
export async function loginRevenueCat(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
    console.log('✅ RevenueCat user logged in:', userId);
  } catch (error) {
    console.error('❌ RevenueCat login error:', error);
  }
}

/**
 * Logout user from RevenueCat
 * Call this when user signs out
 */
export async function logoutRevenueCat(): Promise<void> {
  try {
    await Purchases.logOut();
    console.log('✅ RevenueCat user logged out');
  } catch (error) {
    console.error('❌ RevenueCat logout error:', error);
  }
}

/**
 * Get available subscription offerings
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    
    if (offerings.current !== null) {
      console.log('✅ Available offerings:', offerings.current.identifier);
      return offerings.current;
    } else {
      console.warn('⚠️ No offerings available');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching offerings:', error);
    return null;
  }
}

/**
 * Purchase a product
 */
export async function purchaseProduct(productId: string): Promise<CustomerInfo | null> {
  try {
    const offerings = await getOfferings();
    if (!offerings) {
      throw new Error('No offerings available');
    }

    // Find the package by product ID
    const packageToPurchase = offerings.availablePackages.find(
      pkg => pkg.product.identifier === productId
    );

    if (!packageToPurchase) {
      throw new Error(`Product ${productId} not found`);
    }

    // Make the purchase
    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    
    console.log('✅ Purchase successful');
    return customerInfo;
  } catch (error: any) {
    if (error.userCancelled) {
      console.log('⚠️ User cancelled purchase');
    } else {
      console.error('❌ Purchase error:', error);
    }
    return null;
  }
}

/**
 * Restore purchases
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    console.log('✅ Purchases restored');
    return customerInfo;
  } catch (error) {
    console.error('❌ Restore error:', error);
    return null;
  }
}

/**
 * Get customer info (subscription status)
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('❌ Error getting customer info:', error);
    return null;
  }
}

/**
 * Check if user has active subscription
 */
export async function hasActiveSubscription(): Promise<boolean> {
  try {
    const customerInfo = await getCustomerInfo();
    
    if (!customerInfo) return false;

    // Check if user has any active entitlements
    const entitlements = customerInfo.entitlements.active;
    const hasAccess = Object.keys(entitlements).length > 0;

    console.log('🔑 Has active subscription:', hasAccess);
    return hasAccess;
  } catch (error) {
    console.error('❌ Error checking subscription:', error);
    return false;
  }
}

/**
 * Check subscription status with details
 */
export async function getSubscriptionStatus(): Promise<{
  hasAccess: boolean;
  isInTrial: boolean;
  expiresAt: string | null;
  productId: string | null;
}> {
  try {
    const customerInfo = await getCustomerInfo();
    
    if (!customerInfo) {
      return {
        hasAccess: false,
        isInTrial: false,
        expiresAt: null,
        productId: null,
      };
    }

    const entitlements = customerInfo.entitlements.active;
    const hasAccess = Object.keys(entitlements).length > 0;

    if (hasAccess) {
      const firstEntitlement = entitlements[Object.keys(entitlements)[0]];
      
      return {
        hasAccess: true,
        isInTrial: firstEntitlement.periodType === 'trial',
        expiresAt: firstEntitlement.expirationDate || null,
        productId: firstEntitlement.productIdentifier,
      };
    }

    return {
      hasAccess: false,
      isInTrial: false,
      expiresAt: null,
      productId: null,
    };
  } catch (error) {
    console.error('❌ Error getting subscription status:', error);
    return {
      hasAccess: false,
      isInTrial: false,
      expiresAt: null,
      productId: null,
    };
  }
}