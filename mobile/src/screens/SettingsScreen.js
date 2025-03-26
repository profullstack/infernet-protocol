import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Switch, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useAuth } from '../context/AuthContext';
import * as SecureStore from 'expo-secure-store';

const SettingsScreen = () => {
  const { user, logout } = useAuth();
  
  // PocketBase settings
  const [pocketBaseUrl, setPocketBaseUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  // App settings
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  
  // Payment settings
  const [paymentAddress, setPaymentAddress] = useState('');
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  const loadSettings = async () => {
    try {
      // Load PocketBase settings
      const storedPocketBaseUrl = await SecureStore.getItemAsync('pocketBaseUrl');
      if (storedPocketBaseUrl) {
        setPocketBaseUrl(storedPocketBaseUrl);
        setIsConnected(true);
      }
      
      // Load app settings
      const notificationsEnabledValue = await SecureStore.getItemAsync('notificationsEnabled');
      if (notificationsEnabledValue !== null) {
        setNotificationsEnabled(notificationsEnabledValue === 'true');
      }
      
      const darkModeEnabledValue = await SecureStore.getItemAsync('darkModeEnabled');
      if (darkModeEnabledValue !== null) {
        setDarkModeEnabled(darkModeEnabledValue === 'true');
      }
      
      const autoRefreshEnabledValue = await SecureStore.getItemAsync('autoRefreshEnabled');
      if (autoRefreshEnabledValue !== null) {
        setAutoRefreshEnabled(autoRefreshEnabledValue === 'true');
      }
      
      // Load payment settings
      const storedPaymentAddress = await SecureStore.getItemAsync('paymentAddress');
      if (storedPaymentAddress) {
        setPaymentAddress(storedPaymentAddress);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };
  
  const saveSettings = async () => {
    try {
      // Save PocketBase settings
      await SecureStore.setItemAsync('pocketBaseUrl', pocketBaseUrl);
      
      // Save app settings
      await SecureStore.setItemAsync('notificationsEnabled', notificationsEnabled.toString());
      await SecureStore.setItemAsync('darkModeEnabled', darkModeEnabled.toString());
      await SecureStore.setItemAsync('autoRefreshEnabled', autoRefreshEnabled.toString());
      
      // Save payment settings
      await SecureStore.setItemAsync('paymentAddress', paymentAddress);
      
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };
  
  const connectToPocketBase = async () => {
    try {
      // In a real app, this would attempt to connect to the PocketBase instance
      // For demo purposes, we'll just simulate a connection
      if (!pocketBaseUrl) {
        Alert.alert('Error', 'Please enter a valid PocketBase URL');
        return;
      }
      
      // Simulate connection attempt
      Alert.alert('Connecting', 'Attempting to connect to PocketBase...');
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate successful connection
      setIsConnected(true);
      await SecureStore.setItemAsync('pocketBaseUrl', pocketBaseUrl);
      
      Alert.alert('Success', 'Connected to PocketBase successfully');
    } catch (error) {
      console.error('Error connecting to PocketBase:', error);
      Alert.alert('Error', 'Failed to connect to PocketBase');
    }
  };
  
  const disconnectFromPocketBase = async () => {
    try {
      // In a real app, this would close the connection to the PocketBase instance
      // For demo purposes, we'll just simulate disconnection
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simulate successful disconnection
      setIsConnected(false);
      await SecureStore.deleteItemAsync('pocketBaseUrl');
      
      Alert.alert('Success', 'Disconnected from PocketBase');
    } catch (error) {
      console.error('Error disconnecting from PocketBase:', error);
      Alert.alert('Error', 'Failed to disconnect from PocketBase');
    }
  };
  
  const handleLogout = async () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Out', 
          style: 'destructive',
          onPress: async () => {
            await logout();
          }
        }
      ]
    );
  };
  
  // Render a settings section
  const SettingsSection = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {children}
      </View>
    </View>
  );
  
  // Render a toggle setting
  const ToggleSetting = ({ title, value, onValueChange, description }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#d1d5db', true: '#3a86ff' }}
        thumbColor={value ? '#ffffff' : '#ffffff'}
      />
    </View>
  );
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>
      
      <ScrollView style={styles.content}>
        {/* Account Section */}
        <SettingsSection title="Account">
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{user?.name || 'User'}</Text>
            <Text style={styles.accountEmail}>{user?.email || 'user@example.com'}</Text>
          </View>
          
          <TouchableOpacity style={styles.button} onPress={handleLogout}>
            <Text style={styles.buttonText}>Log Out</Text>
          </TouchableOpacity>
        </SettingsSection>
        
        {/* PocketBase Connection Section */}
        <SettingsSection title="PocketBase Connection">
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>PocketBase URL</Text>
            <TextInput
              style={styles.input}
              placeholder="http://localhost:8090"
              value={pocketBaseUrl}
              onChangeText={setPocketBaseUrl}
              editable={!isConnected}
            />
          </View>
          
          {isConnected ? (
            <View>
              <View style={styles.connectionStatus}>
                <View style={styles.statusIndicator} />
                <Text style={styles.connectionStatusText}>Connected to PocketBase</Text>
              </View>
              
              <TouchableOpacity 
                style={[styles.button, styles.disconnectButton]}
                onPress={disconnectFromPocketBase}
              >
                <Text style={styles.buttonText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.button}
              onPress={connectToPocketBase}
            >
              <Text style={styles.buttonText}>Connect</Text>
            </TouchableOpacity>
          )}
        </SettingsSection>
        
        {/* App Settings Section */}
        <SettingsSection title="App Settings">
          <ToggleSetting
            title="Push Notifications"
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            description="Receive notifications for job status updates"
          />
          
          <ToggleSetting
            title="Dark Mode"
            value={darkModeEnabled}
            onValueChange={setDarkModeEnabled}
            description="Enable dark theme for the app"
          />
          
          <ToggleSetting
            title="Auto Refresh"
            value={autoRefreshEnabled}
            onValueChange={setAutoRefreshEnabled}
            description="Automatically refresh job and provider data"
          />
        </SettingsSection>
        
        {/* Payment Settings Section */}
        <SettingsSection title="Payment Settings">
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Payment Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your payment address"
              value={paymentAddress}
              onChangeText={setPaymentAddress}
            />
            <Text style={styles.inputDescription}>
              This address will be used to receive payments for completed jobs
            </Text>
          </View>
        </SettingsSection>
        
        {/* Save Button */}
        <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </TouchableOpacity>
        
        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Infernet Protocol v0.1.0</Text>
          <Text style={styles.appCopyright}>© 2025 Infernet Protocol Team</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#3a86ff',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 16,
  },
  sectionContent: {
    // Content styling
  },
  accountInfo: {
    marginBottom: 16,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  accountEmail: {
    fontSize: 16,
    color: '#6c757d',
  },
  button: {
    backgroundColor: '#3a86ff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f1f3f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 4,
  },
  inputDescription: {
    fontSize: 12,
    color: '#6c757d',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  connectionStatusText: {
    fontSize: 14,
    color: '#10b981',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    color: '#212529',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#6c757d',
  },
  saveButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  appInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appVersion: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 4,
  },
  appCopyright: {
    fontSize: 12,
    color: '#adb5bd',
  },
});

export default SettingsScreen;
