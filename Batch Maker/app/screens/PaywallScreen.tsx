import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getOfferings,
  purchaseProduct,
  restorePurchases,
  getSubscriptionStatus,
} from '../../services/revenueCat';
import type { PurchasesOffering } from 'react-native-purchases';

export default function PaywallScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    setLoading(true);
    const availableOfferings = await getOfferings();
    setOfferings(availableOfferings);
    setLoading(false);
  };

  const handlePurchase = async (productId: string) => {
    setPurchasing(true);
    setSelectedProduct(productId);
    const customerInfo = await purchaseProduct(productId);
    if (customerInfo) {
      const status = await getSubscriptionStatus();
      if (status.hasAccess) {
        Alert.alert('Success!', 'Welcome to Batch Maker Premium!', [
          { text: 'Start Using', onPress: () => router.back() }
        ]);
      }
    }
    setPurchasing(false);
    setSelectedProduct(null);
  };

  const handleRestore = async () => {
    setPurchasing(true);
    const customerInfo = await restorePurchases();
    if (customerInfo) {
      const status = await getSubscriptionStatus();
      if (status.hasAccess) {
        Alert.alert('Restored', 'Your subscription has been restored!', [
          { text: 'Continue', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('No Subscription Found', 'No active subscriptions to restore.');
      }
    }
    setPurchasing(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>
          Loading subscription options...
        </Text>
      </View>
    );
  }

  if (!offerings) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>
          Unable to load subscription options
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadOfferings}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const monthlyPackage = offerings.availablePackages.find(
    pkg => pkg.identifier === '$rc_monthly' || pkg.product.identifier.includes('monthly')
  );
  const yearlyPackage = offerings.availablePackages.find(
    pkg => pkg.identifier === '$rc_annual' || pkg.product.identifier.includes('yearly')
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Unlock Premium</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Get unlimited access to all features
          </Text>
        </View>

        <View style={[styles.featuresCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.featuresTitle, { color: colors.text }]}>Premium Features:</Text>
          {[
            'Unlimited workflows & batches',
            'Cloud sync across all devices',
            'Photo backup & storage',
            'Advanced reporting & analytics',
            'Priority customer support',
            'Export to Excel & CSV',
            'Multi-device production tracking'
          ].map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Text style={[styles.checkmark, { color: colors.success }]}>✓</Text>
              <Text style={[styles.featureText, { color: colors.text }]}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={styles.plansContainer}>
          {yearlyPackage && (
            <TouchableOpacity
              style={[styles.planCard, { 
                backgroundColor: colors.primary + '15',
                borderColor: colors.primary,
                borderWidth: 2
              }]}
              onPress={() => handlePurchase(yearlyPackage.product.identifier)}
              disabled={purchasing}
            >
              <View style={[styles.badge, { backgroundColor: colors.success }]}>
                <Text style={styles.badgeText}>SAVE 17%</Text>
              </View>
              <Text style={[styles.planName, { color: colors.text }]}>Yearly</Text>
              <Text style={[styles.planPrice, { color: colors.primary }]}>
                {yearlyPackage.product.priceString}/year
              </Text>
              <Text style={[styles.planDetail, { color: colors.textSecondary }]}>
                {`$${(yearlyPackage.product.price / 12).toFixed(2)}/month`}
              </Text>
              {purchasing && selectedProduct === yearlyPackage.product.identifier ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
              ) : (
                <View style={[styles.selectButton, { backgroundColor: colors.primary }]}>
                  <Text style={styles.selectButtonText}>Select Plan</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {monthlyPackage && (
            <TouchableOpacity
              style={[styles.planCard, { 
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1
              }]}
              onPress={() => handlePurchase(monthlyPackage.product.identifier)}
              disabled={purchasing}
            >
              <Text style={[styles.planName, { color: colors.text }]}>Monthly</Text>
              <Text style={[styles.planPrice, { color: colors.primary }]}>
                {monthlyPackage.product.priceString}/month
              </Text>
              <Text style={[styles.planDetail, { color: colors.textSecondary }]}>Billed monthly</Text>
              {purchasing && selectedProduct === monthlyPackage.product.identifier ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
              ) : (
                <View style={[styles.selectButton, { backgroundColor: colors.primary }]}>
                  <Text style={styles.selectButtonText}>Select Plan</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.trialInfo, { backgroundColor: colors.success + '15' }]}>
          <Text style={[styles.trialText, { color: colors.text }]}>
            🎉 <Text style={{ fontWeight: 'bold' }}>30-Day Free Trial</Text>
          </Text>
          <Text style={[styles.trialSubtext, { color: colors.textSecondary }]}>
            Cancel anytime. No commitment.
          </Text>
        </View>

        <TouchableOpacity style={styles.restoreButton} onPress={handleRestore} disabled={purchasing}>
          <Text style={[styles.restoreText, { color: colors.primary }]}>Restore Purchases</Text>
        </TouchableOpacity>

        <View style={styles.legal}>
          <Text style={[styles.legalText, { color: colors.textSecondary }]}>
            Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.
          </Text>
          <Text style={[styles.legalText, { color: colors.textSecondary }]}>
            Privacy Policy • Terms of Service
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>Maybe Later</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  header: { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center' },
  featuresCard: { borderRadius: 16, padding: 20, marginBottom: 24 },
  featuresTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkmark: { fontSize: 20, marginRight: 12, fontWeight: 'bold' },
  featureText: { fontSize: 16, flex: 1 },
  plansContainer: { marginBottom: 24 },
  planCard: { borderRadius: 16, padding: 24, marginBottom: 16, alignItems: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -10, right: 20, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  planName: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  planPrice: { fontSize: 32, fontWeight: 'bold', marginBottom: 4 },
  planDetail: { fontSize: 14, marginBottom: 16 },
  selectButton: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  selectButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  trialInfo: { borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 24 },
  trialText: { fontSize: 18, marginBottom: 4 },
  trialSubtext: { fontSize: 14 },
  restoreButton: { padding: 16, alignItems: 'center', marginBottom: 24 },
  restoreText: { fontSize: 16, fontWeight: '600' },
  legal: { alignItems: 'center', gap: 8 },
  legalText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  closeButton: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center', padding: 16 },
  closeButtonText: { fontSize: 16 },
  loadingText: { marginTop: 16, fontSize: 16 },
  errorText: { fontSize: 18, textAlign: 'center', marginBottom: 20 },
  retryButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' }
});