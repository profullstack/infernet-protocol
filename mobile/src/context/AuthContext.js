import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import PocketBase from 'pocketbase';

// Create the context
const AuthContext = createContext();

// Initialize PocketBase
const pb = new PocketBase('http://127.0.0.1:8080'); // Use environment variable in production

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state
  useEffect(() => {
    loadStoredUser();
  }, []);

  // Load user from secure storage
  const loadStoredUser = async () => {
    try {
      const userJson = await SecureStore.getItemAsync('user');
      const token = await SecureStore.getItemAsync('token');
      
      if (userJson && token) {
        setUser(JSON.parse(userJson));
      }
    } catch (error) {
      console.error('Error loading stored user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Login function
  const login = async (email, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // In a real app, this would be an API call to your authentication endpoint
      // For demo purposes, we'll simulate a successful login
      if (email && password) {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const userData = {
          id: '123456',
          email,
          name: 'Demo User',
          role: 'client'
        };
        
        const token = 'demo-token-123456';
        
        // Store user data and token in secure storage
        await SecureStore.setItemAsync('user', JSON.stringify(userData));
        await SecureStore.setItemAsync('token', token);
        
        setUser(userData);
        return { success: true };
      } else {
        throw new Error('Email and password are required');
      }
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync('user');
      await SecureStore.deleteItemAsync('token');
      setUser(null);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  // Register function
  const register = async (email, password, name) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // In a real app, this would be an API call to your registration endpoint
      // For demo purposes, we'll simulate a successful registration
      if (email && password && name) {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // After successful registration, automatically log in the user
        return await login(email, password);
      } else {
        throw new Error('All fields are required');
      }
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Get current auth token
  const getToken = async () => {
    return await SecureStore.getItemAsync('token');
  };

  // Nostr authentication functions
  const checkNostrAvailability = async () => {
    try {
      // For React Native, we need to check if we can connect to a Nostr signer
      // This is a placeholder - in a real app, you'd implement NIP-07 compatible
      // communication with a native Nostr signer app via deep linking or other methods
      
      // For now, we'll return true to indicate Nostr is available
      return true;
    } catch (error) {
      console.error('Error checking Nostr availability:', error);
      return false;
    }
  };

  const loginWithNostr = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 1. Check if Nostr is available
      const isNostrAvailable = await checkNostrAvailability();
      if (!isNostrAvailable) {
        throw new Error('Nostr is not available. Please install a Nostr signer app.');
      }
      
      // 2. Get public key (in a real app, this would use deep linking to a Nostr signer)
      // This is a placeholder - in production, you'd implement proper NIP-07 communication
      const mockPublicKey = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
      
      // 3. Create a signed event (in a real app, this would be signed by the Nostr signer)
      // This is a placeholder - in production, the event would be properly signed
      const mockSignedEvent = {
        id: 'mock-event-id',
        pubkey: mockPublicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 22242,
        tags: [],
        content: 'Authenticate with Infernet Protocol',
        sig: 'mock-signature'
      };
      
      // 4. Authenticate with the server
      const response = await fetch('http://127.0.0.1:3000/api/nostr/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          publicKey: mockPublicKey,
          signedEvent: mockSignedEvent
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Authentication failed');
      }
      
      // Store user data and token in secure storage
      const userData = result.data.record;
      const token = result.data.token;
      
      await SecureStore.setItemAsync('user', JSON.stringify(userData));
      await SecureStore.setItemAsync('token', token);
      await SecureStore.setItemAsync('auth_method', 'nostr');
      
      setUser(userData);
      return { success: true };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithNostr = async (name) => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (!name) {
        throw new Error('Name is required');
      }
      
      // 1. Check if Nostr is available
      const isNostrAvailable = await checkNostrAvailability();
      if (!isNostrAvailable) {
        throw new Error('Nostr is not available. Please install a Nostr signer app.');
      }
      
      // 2. Get public key (in a real app, this would use deep linking to a Nostr signer)
      // This is a placeholder - in production, you'd implement proper NIP-07 communication
      const mockPublicKey = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
      
      // 3. Create a signed event (in a real app, this would be signed by the Nostr signer)
      // This is a placeholder - in production, the event would be properly signed
      const mockSignedEvent = {
        id: 'mock-event-id',
        pubkey: mockPublicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 22242,
        tags: [],
        content: 'Register with Infernet Protocol',
        sig: 'mock-signature'
      };
      
      // 4. Register with the server
      const response = await fetch('http://127.0.0.1:3000/api/nostr/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          publicKey: mockPublicKey,
          signedEvent: mockSignedEvent,
          userData: {
            name,
            username: `nostr_${mockPublicKey.substring(0, 8)}`
          }
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Registration failed');
      }
      
      // Store user data and token in secure storage
      const userData = result.data.record;
      const token = result.data.token;
      
      await SecureStore.setItemAsync('user', JSON.stringify(userData));
      await SecureStore.setItemAsync('token', token);
      await SecureStore.setItemAsync('auth_method', 'nostr');
      
      setUser(userData);
      return { success: true };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Context value
  const value = {
    user,
    isLoading,
    error,
    login,
    logout,
    register,
    getToken,
    isAuthenticated: !!user,
    loginWithNostr,
    registerWithNostr,
    checkNostrAvailability
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
