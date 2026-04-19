import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isNostrAvailable, setIsNostrAvailable] = useState(false);
  
  const { login, register, isLoading, error, loginWithNostr, registerWithNostr, checkNostrAvailability } = useAuth();
  
  // Check if Nostr is available when component mounts
  useEffect(() => {
    const checkNostr = async () => {
      const available = await checkNostrAvailability();
      setIsNostrAvailable(available);
    };
    
    checkNostr();
  }, []);

  const handleAuth = async () => {
    setErrorMessage('');
    
    if (isRegistering && !name) {
      setErrorMessage('Name is required');
      return;
    }
    
    if (!email) {
      setErrorMessage('Email is required');
      return;
    }
    
    if (!password) {
      setErrorMessage('Password is required');
      return;
    }
    
    try {
      let result;
      
      if (isRegistering) {
        result = await register(email, password, name);
      } else {
        result = await login(email, password);
      }
      
      if (!result.success) {
        setErrorMessage(result.error || 'Authentication failed');
      }
    } catch (error) {
      setErrorMessage('An unexpected error occurred');
      console.error(error);
    }
  };
  
  const handleNostrAuth = async () => {
    setErrorMessage('');
    
    try {
      let result;
      
      if (isRegistering) {
        if (!name) {
          setErrorMessage('Name is required');
          return;
        }
        
        result = await registerWithNostr(name);
      } else {
        result = await loginWithNostr();
      }
      
      if (!result.success) {
        setErrorMessage(result.error || 'Nostr authentication failed');
      }
    } catch (error) {
      setErrorMessage('An unexpected error occurred with Nostr');
      console.error(error);
    }
  };

  const toggleAuthMode = () => {
    setIsRegistering(!isRegistering);
    setErrorMessage('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Infernet Protocol</Text>
          <Text style={styles.tagline}>Decentralized AI Inference</Text>
        </View>
        
        <View style={styles.formContainer}>
          <Text style={styles.headerText}>
            {isRegistering ? 'Create Account' : 'Welcome Back'}
          </Text>
          
          {isRegistering && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          
          {(errorMessage || error) && (
            <Text style={styles.errorText}>{errorMessage || error}</Text>
          )}
          
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleAuth}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isRegistering ? 'Sign Up' : 'Sign In'} with Email
              </Text>
            )}
          </TouchableOpacity>
          
          {isNostrAvailable && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
              
              <TouchableOpacity 
                style={[styles.button, styles.nostrButton]} 
                onPress={handleNostrAuth}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {isRegistering ? 'Sign Up' : 'Sign In'} with Nostr
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
          
          <TouchableOpacity onPress={toggleAuthMode}>
            <Text style={styles.toggleText}>
              {isRegistering 
                ? 'Already have an account? Sign In' 
                : 'Don\'t have an account? Sign Up'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3a86ff',
  },
  tagline: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 8,
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#212529',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
    color: '#495057',
  },
  input: {
    backgroundColor: '#f1f3f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#3a86ff',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  nostrButton: {
    backgroundColor: '#8e44ad', // Purple color for Nostr button
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e9ecef',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#6c757d',
    fontSize: 14,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#3a86ff',
  },
  errorText: {
    color: '#d90429',
    marginBottom: 10,
    textAlign: 'center',
  },
});

export default LoginScreen;
