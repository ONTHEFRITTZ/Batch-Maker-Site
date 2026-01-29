import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { syncService } from '../../services/sync';

export default function NetworkScanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [mode, setMode] = useState<'select' | 'host' | 'join'>('select');
  const [isHosting, setIsHosting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hostIP, setHostIP] = useState('');
  const [myIP, setMyIP] = useState('');
  const [connectedDevices, setConnectedDevices] = useState<any[]>([]);
  const [maxSeats, setMaxSeats] = useState(5);
  const [joinIP, setJoinIP] = useState('');

  useEffect(() => {
    loadNetworkInfo();
    
    const unsubscribe = syncService.onDevicesChange((devices) => {
      setConnectedDevices(devices);
    });

    return unsubscribe;
  }, []);

  const loadNetworkInfo = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      setMyIP(data.ip || 'Unable to detect');
    } catch (error) {
      setMyIP('192.168.1.XXX');
    }
  };

  const startHost = async () => {
    try {
      setIsHosting(true);
      await syncService.startHost(maxSeats);
      setMode('host');
      Alert.alert(
        'Host Started',
        `Share this IP with team members:\n\n${myIP}\n\nThey can connect to sync batches.`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to start host');
      setIsHosting(false);
    }
  };

  const stopHost = async () => {
    try {
      await syncService.stopHost();
      setIsHosting(false);
      setMode('select');
      setConnectedDevices([]);
    } catch (error) {
      Alert.alert('Error', 'Failed to stop host');
    }
  };

  const connectToHost = async () => {
    if (!joinIP.trim()) {
      Alert.alert('Error', 'Please enter a host IP address');
      return;
    }

    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(joinIP.trim())) {
      Alert.alert('Error', 'Invalid IP address format');
      return;
    }

    try {
      setIsConnecting(true);
      const success = await syncService.connectToHost(joinIP.trim());
      
      if (success) {
        setMode('join');
        setHostIP(joinIP.trim());
        Alert.alert('Connected', 'Successfully connected to host');
      } else {
        Alert.alert('Connection Failed', 'Could not connect to host. Check IP and try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await syncService.disconnect();
      setMode('select');
      setHostIP('');
      setConnectedDevices([]);
    } catch (error) {
      Alert.alert('Error', 'Failed to disconnect');
    }
  };

  if (mode === 'select') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Multi-Device Sync</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Connect multiple devices on the same network to sync batches in real-time
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Your IP Address</Text>
            <Text style={[styles.ipText, { color: colors.primary }]}>{myIP}</Text>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={startHost}
            disabled={isHosting}
          >
            {isHosting ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.buttonText}>🖥️ Start as Host</Text>
                <Text style={styles.buttonSubtext}>Others can connect to you</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.success }]}
            onPress={() => setMode('join')}
          >
            <Text style={styles.buttonText}>📱 Join as Guest</Text>
            <Text style={styles.buttonSubtext}>Connect to someone else's host</Text>
          </TouchableOpacity>

          <View style={[styles.infoBox, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
            <Text style={[styles.infoTitle, { color: colors.primary }]}>💎 Premium Feature</Text>
            <Text style={[styles.infoText, { color: colors.text }]}>
              • Host requires premium subscription{'\n'}
              • Guests can join for free{'\n'}
              • Base plan includes 5 seats{'\n'}
              • Add extra seats for $1/month each
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (mode === 'host') {
    const availableSeats = maxSeats - connectedDevices.length;
    
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Host Mode</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            You are hosting. Share your IP with team members.
          </Text>

          <View style={[styles.card, { backgroundColor: colors.success + '20', borderColor: colors.success }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Your Host IP</Text>
            <Text style={[styles.ipText, { color: colors.success }]}>{myIP}</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              Share this with team members to connect
            </Text>
          </View>

          <View style={[styles.seatsCard, { backgroundColor: colors.surface }]}>
            <View style={styles.seatsHeader}>
              <Text style={[styles.seatsTitle, { color: colors.text }]}>Connected Devices</Text>
              <Text style={[styles.seatsCount, { color: colors.primary }]}>
                {connectedDevices.length}/{maxSeats}
              </Text>
            </View>
            
            {availableSeats > 0 ? (
              <Text style={[styles.seatsAvailable, { color: colors.success }]}>
                {availableSeats} seat{availableSeats !== 1 ? 's' : ''} available
              </Text>
            ) : (
              <Text style={[styles.seatsFull, { color: colors.error }]}>
                All seats filled
              </Text>
            )}

            {connectedDevices.length > 0 ? (
              <View style={styles.devicesList}>
                {connectedDevices.map((device, index) => (
                  <View key={device.id} style={[styles.deviceItem, { borderBottomColor: colors.border }]}>
                    <View style={[styles.deviceDot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.deviceName, { color: colors.text }]}>
                      {device.name || `Device ${index + 1}`}
                    </Text>
                    {device.isHost && (
                      <Text style={[styles.hostBadge, { backgroundColor: colors.primary }]}>HOST</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.noDevices, { color: colors.textSecondary }]}>
                Waiting for guests to connect...
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.dangerButton, { backgroundColor: colors.error }]}
            onPress={stopHost}
          >
            <Text style={styles.buttonText}>Stop Hosting</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (mode === 'join') {
    const isConnected = hostIP !== '';
    
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Join as Guest</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Enter the host's IP address to connect
          </Text>

          {!isConnected ? (
            <>
              <View style={styles.section}>
                <Text style={[styles.label, { color: colors.text }]}>Host IP Address *</Text>
                <TextInput
                  style={[styles.input, {
                    backgroundColor: colors.surface,
                    color: colors.text,
                    borderColor: colors.border
                  }]}
                  value={joinIP}
                  onChangeText={setJoinIP}
                  placeholder="192.168.1.100"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  autoCapitalize="none"
                  editable={!isConnecting}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: colors.success },
                  isConnecting && { opacity: 0.6 }
                ]}
                onPress={connectToHost}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.buttonText}>Connect to Host</Text>
                )}
              </TouchableOpacity>

              <View style={[styles.infoBox, { backgroundColor: colors.surfaceVariant }]}>
                <Text style={[styles.infoTitle, { color: colors.text }]}>📋 Instructions</Text>
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  1. Ask the host for their IP address{'\n'}
                  2. Enter it above (format: 192.168.1.100){'\n'}
                  3. Tap Connect{'\n'}
                  4. You'll sync batches in real-time
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: colors.success + '20', borderColor: colors.success }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>✅ Connected</Text>
                <Text style={[styles.ipText, { color: colors.success }]}>{hostIP}</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  Syncing with host
                </Text>
              </View>

              <View style={[styles.seatsCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.seatsTitle, { color: colors.text }]}>Connected Devices</Text>
                
                {connectedDevices.length > 0 ? (
                  <View style={styles.devicesList}>
                    {connectedDevices.map((device, index) => (
                      <View key={device.id} style={[styles.deviceItem, { borderBottomColor: colors.border }]}>
                        <View style={[styles.deviceDot, { backgroundColor: colors.success }]} />
                        <Text style={[styles.deviceName, { color: colors.text }]}>
                          {device.name || `Device ${index + 1}`}
                        </Text>
                        {device.isHost && (
                          <Text style={[styles.hostBadge, { backgroundColor: colors.primary }]}>HOST</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.noDevices, { color: colors.textSecondary }]}>
                    Loading devices...
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.dangerButton, { backgroundColor: colors.error }]}
                onPress={disconnect}
              >
                <Text style={styles.buttonText}>Disconnect</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <View style={[styles.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => {
              if (isConnected) {
                disconnect();
              }
              setMode('select');
              setJoinIP('');
            }}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 100 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 32, lineHeight: 22 },
  card: { borderRadius: 12, padding: 20, marginBottom: 24, borderWidth: 2 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  ipText: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginVertical: 12 },
  cardSubtitle: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  button: { padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: '600' },
  buttonSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 },
  dangerButton: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 16, fontSize: 14, fontWeight: '600' },
  infoBox: { borderWidth: 2, borderRadius: 12, padding: 16, marginTop: 24 },
  infoTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  infoText: { fontSize: 14, lineHeight: 22 },
  seatsCard: { borderRadius: 12, padding: 20, marginBottom: 16 },
  seatsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  seatsTitle: { fontSize: 18, fontWeight: 'bold' },
  seatsCount: { fontSize: 24, fontWeight: 'bold' },
  seatsAvailable: { fontSize: 14, marginBottom: 16 },
  seatsFull: { fontSize: 14, marginBottom: 16, fontWeight: '600' },
  devicesList: { marginTop: 16 },
  deviceItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  deviceDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  deviceName: { flex: 1, fontSize: 16 },
  hostBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  noDevices: { fontSize: 14, fontStyle: 'italic', marginTop: 16 },
  section: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 1 },
  backButton: { padding: 16, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontSize: 16, fontWeight: '600' },
});