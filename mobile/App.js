import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import JobsScreen from './src/screens/JobsScreen';
import ProvidersScreen from './src/screens/ProvidersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';

// Context
import { AuthProvider } from './src/context/AuthContext';
import { NodeProvider } from './src/context/NodeContext';

// Navigation
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Icons (we'll use text for now, but you can replace with actual icons)
const getTabIcon = (route, focused) => {
  let iconName;

  if (route.name === 'Home') {
    iconName = '🏠';
  } else if (route.name === 'Jobs') {
    iconName = '📋';
  } else if (route.name === 'Providers') {
    iconName = '🖥️';
  } else if (route.name === 'Settings') {
    iconName = '⚙️';
  }

  return iconName;
};

// Main tab navigator
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          return (
            <React.Fragment>
              {getTabIcon(route, focused)}
            </React.Fragment>
          );
        },
        tabBarActiveTintColor: '#3a86ff',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Jobs" component={JobsScreen} />
      <Tab.Screen name="Providers" component={ProvidersScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// Root navigator
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is logged in and initialize PocketBase
  useEffect(() => {
    const initApp = async () => {
      try {
        // In a real app, check for stored credentials
        // For demo purposes, we'll just simulate a loading state
        
        // We'll initialize PocketBase in the NodeProvider
        // This will happen automatically when the provider mounts
        
        // For demo purposes, let's assume user is not logged in initially
        setIsLoggedIn(false);
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initApp();
  }, []);

  if (isLoading) {
    // You could add a splash screen here
    return null;
  }

  return (
    <AuthProvider>
      <NodeProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {isLoggedIn ? (
              <Stack.Screen name="Main" component={MainTabs} />
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </NodeProvider>
    </AuthProvider>
  );
}
