import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

// Create the context
const AuthContext = createContext();

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

  // Context value
  const value = {
    user,
    isLoading,
    error,
    login,
    logout,
    register,
    getToken,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
