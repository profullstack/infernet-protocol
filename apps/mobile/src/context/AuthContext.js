import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';

// Create the context
const AuthContext = createContext();

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state from any persisted Supabase session.
  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Error loading Supabase session:', sessionError);
        }
        if (!active) return;
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
      } catch (err) {
        console.error('Error bootstrapping auth:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Login function (email + password via Supabase Auth)
  const login = async (email, password) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        throw loginError;
      }

      setSession(data.session);
      setUser(data.user);
      return { success: true };
    } catch (err) {
      const message = err?.message || 'Login failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) {
        console.error('Error during logout:', logoutError);
      }
      setUser(null);
      setSession(null);
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  // Register function (email + password via Supabase Auth)
  const register = async (email, password, name) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!email || !password || !name) {
        throw new Error('All fields are required');
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setSession(data.session);
      setUser(data.user);
      return { success: true };
    } catch (err) {
      const message = err?.message || 'Registration failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  // Get current auth token from the active Supabase session.
  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  };

  // Nostr authentication functions
  const checkNostrAvailability = async () => {
    try {
      // For React Native, we need to check if we can connect to a Nostr signer
      // This is a placeholder - in a real app, you'd implement NIP-07 compatible
      // communication with a native Nostr signer app via deep linking or other methods

      // For now, we'll return true to indicate Nostr is available
      return true;
    } catch (err) {
      console.error('Error checking Nostr availability:', err);
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
        sig: 'mock-signature',
      };

      // 4. Authenticate with the server
      const response = await fetch('http://127.0.0.1:8080/api/nostr/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicKey: mockPublicKey,
          signedEvent: mockSignedEvent,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Authentication failed');
      }

      // Store Nostr-side user data and token in secure storage.
      // Supabase session is not involved in the Nostr flow.
      const userData = result.data.record;
      const token = result.data.token;

      await SecureStore.setItemAsync('user', JSON.stringify(userData));
      await SecureStore.setItemAsync('token', token);
      await SecureStore.setItemAsync('auth_method', 'nostr');

      setUser(userData);
      return { success: true };
    } catch (err) {
      const message = err?.message || 'Nostr login failed';
      setError(message);
      return { success: false, error: message };
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
        sig: 'mock-signature',
      };

      // 4. Register with the server
      const response = await fetch('http://127.0.0.1:8080/api/nostr/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicKey: mockPublicKey,
          signedEvent: mockSignedEvent,
          userData: {
            name,
            username: `nostr_${mockPublicKey.substring(0, 8)}`,
          },
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Registration failed');
      }

      // Store Nostr-side user data and token in secure storage.
      const userData = result.data.record;
      const token = result.data.token;

      await SecureStore.setItemAsync('user', JSON.stringify(userData));
      await SecureStore.setItemAsync('token', token);
      await SecureStore.setItemAsync('auth_method', 'nostr');

      setUser(userData);
      return { success: true };
    } catch (err) {
      const message = err?.message || 'Nostr registration failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  // Context value
  const value = {
    user,
    session,
    isLoading,
    error,
    login,
    logout,
    register,
    getToken,
    isAuthenticated: !!user,
    loginWithNostr,
    registerWithNostr,
    checkNostrAvailability,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export { AuthContext };
