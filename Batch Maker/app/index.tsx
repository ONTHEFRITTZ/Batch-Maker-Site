import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image 
        source={require('../assets/images/batch-maker-alpha.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Digital SOP System
      </Text>

      <TouchableOpacity
        onPress={() => router.push('/screens/WorkflowSelectScreen')}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.buttonText}>
          Start Workflow
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/screens/ReportsScreen')}
        style={[styles.button, { backgroundColor: colors.success }]}
      >
        <Text style={styles.buttonText}>
          Reports
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/screens/NetworkScanScreen')}
        style={[styles.button, { backgroundColor: colors.warning }]}
      >
        <Text style={styles.buttonText}>
          Sync Devices
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logo: {
    width: 250,
    height: 250,
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 40,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});