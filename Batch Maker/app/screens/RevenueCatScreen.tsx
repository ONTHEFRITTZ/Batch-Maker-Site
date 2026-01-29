import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import Purchases, { 
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  MakePurchaseResult
} from 'react-native-purchases';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';

export default function RevenueCatScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeRevenueCat();
  }, []);

  const initializeRevenueCat = async () => {
    try {
      // Get current offerings
      const offerings = await Purchases.getOfferings();
      if (offerings.current !== null) {
        setOfferings(offerings.current);
      }

      // Get customer info
      const customerInfo = await Purchases.getCustomerInfo();
      setCustomerInfo(customerInfo);
    } catch (error) {
      console.error('RevenueCat initialization error:', error);
      Alert.alert('Error', 'Failed to load subscription options');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pkg: PurchasesPackage) => {
    try {
      setLoading(true);
      
      const purchaseResult: MakePurchaseResult = await Purchases.purchasePackage(pkg);
      
      // Update customer info with the customerInfo from the purchase result
      setCustomerInfo(purchaseResult.customerInfo);
      
      // Check if premium is now active
      const isPremium = purchaseResult.customerInfo.entitlements.active['premium'] !== undefined;
      
      if (isPremium) {
        Alert.alert(
          'Success!',
          'Welcome to Premium! You now have access to all features.',
          [
            {
              text: 'OK',
              onPress: () => router.back()
            }
          ]
        );
      }
    } catch (error: any) {
      if (!error.userCancelled) {
        console.error('Purchase error:', error);
        Alert.alert('Purchase Failed', error.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const restorePurchases = async () => {
    try {
      setLoading(true);
      const customerInfo = await Purchases.restorePurchases();
      setCustomerInfo(customerInfo);
      
      const isPremium = customerInfo.entitlements.active['premium'] !== undefined;
      
      if (isPremium) {
        Alert.alert('Success', 'Your purchases have been restored!');
      } else {
        Alert.alert('No Purchases Found', 'No active subscriptions to restore.');
      }
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert('Error', 'Failed to restore purchases');
    } finally {
      setLoading(false);
    }
  };

  const isPremiumActive = customerInfo?.entitlements.active['premium'] !== undefined;

  if (loading && !offerings) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Upgrade to Premium</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Unlock all features and sync across devices
          </Text>
        </View>

        {/* Current Status */}
        {isPremiumActive && (
          <View style={[styles.statusCard, { backgroundColor: colors.success + '20', borderColor: colors.success }]}>
            <Text style={[styles.statusText, { color: colors.success }]}>
              ✓ You're a Premium Member!
            </Text>
            <Text style={[styles.statusSubtext, { color: colors.text }]}>
              Customer ID: {customerInfo?.originalAppUserId || 'N/A'}
            </Text>
          </View>
        )}

        {/* Features List */}
        <View style={[styles.featuresCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.featuresTitle, { color: colors.text }]}>Premium Features</Text>
          {[
            'Multi-device sync',
            'Network hosting for your team',
            'Advanced reports & analytics',
            'Export to CSV/Excel',
            'Priority support',
            'Unlimited workflows',
          ].map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <Text style={[styles.featureIcon, { color: colors.success }]}>✓</Text>
              <Text style={[styles.featureText, { color: colors.text }]}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Packages */}
        {offerings?.availablePackages && offerings.availablePackages.length > 0 && (
          <View style={styles.packagesSection}>
            <Text style={[styles.packagesTitle, { color: colors.text }]}>Choose Your Plan</Text>
            {offerings.availablePackages.map((pkg: PurchasesPackage, index: number) => (
              <TouchableOpacity
                key={index}
                style={[styles.packageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handlePurchase(pkg)}
                disabled={loading}
              >
                <View style={styles.packageHeader}>
                  <Text style={[styles.packageTitle, { color: colors.text }]}>
                    {pkg.product.title}
                  </Text>
                  <Text style={[styles.packagePrice, { color: colors.primary }]}>
                    {pkg.product.priceString}
                  </Text>
                </View>
                <Text style={[styles.packageDescription, { color: colors.textSecondary }]}>
                  {pkg.product.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Restore Purchases Button */}
        <TouchableOpacity
          style={[styles.restoreButton, { backgroundColor: colors.surfaceVariant }]}
          onPress={restorePurchases}
          disabled={loading}
        >
          <Text style={[styles.restoreButtonText, { color: colors.text }]}>
            Restore Purchases
          </Text>
        </TouchableOpacity>

        {/* Legal Text */}
        <Text style={[styles.legalText, { color: colors.textSecondary }]}>
          Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.
          Manage your subscription in App Store settings.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  statusCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 24,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusSubtext: {
    fontSize: 14,
  },
  featuresCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  packagesSection: {
    marginBottom: 24,
  },
  packagesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  packageCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  packageDescription: {
    fontSize: 14,
  },
  restoreButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  restoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  legalText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
