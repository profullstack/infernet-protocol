/**
 * Nostr Authentication Utilities
 * 
 * This module provides functions for authenticating users via Nostr protocol
 * using browser extensions like nos2x-fox or other Nostr clients.
 */

// Check if Nostr extension is available in the browser environment
export const checkNostrAvailability = async () => {
  // For browser environments
  if (typeof window !== 'undefined') {
    // Check for window.nostr (NIP-07 compliant extensions)
    return !!window.nostr;
  }
  
  // For React Native, we'll need to use a different approach
  // This will be handled in the platform-specific implementations
  return false;
};

// Get the public key from Nostr extension
export const getNostrPublicKey = async () => {
  if (typeof window !== 'undefined' && window.nostr) {
    try {
      // Request public key from the extension (NIP-07)
      const publicKey = await window.nostr.getPublicKey();
      return { success: true, publicKey };
    } catch (error) {
      console.error('Error getting Nostr public key:', error);
      return { success: false, error: error.message || 'Failed to get public key' };
    }
  }
  
  return { success: false, error: 'Nostr extension not available' };
};

// Sign an event with Nostr extension
export const signWithNostr = async (event) => {
  if (typeof window !== 'undefined' && window.nostr) {
    try {
      // Sign the event with the extension (NIP-07)
      const signedEvent = await window.nostr.signEvent(event);
      return { success: true, signedEvent };
    } catch (error) {
      console.error('Error signing with Nostr:', error);
      return { success: false, error: error.message || 'Failed to sign event' };
    }
  }
  
  return { success: false, error: 'Nostr extension not available' };
};

// Create a challenge event for authentication
export const createAuthChallenge = (serverPublicKey) => {
  const timestamp = Math.floor(Date.now() / 1000);
  
  return {
    kind: 22242, // Custom kind for auth challenge
    created_at: timestamp,
    tags: [
      ['p', serverPublicKey], // Server's public key
      ['challenge', `auth-${timestamp}`], // Unique challenge
    ],
    content: 'Authenticate with Infernet Protocol',
  };
};

// Verify a Nostr public key against the Supabase `users` table
export const verifyNostrAuth = async (supabase, publicKey, signedEvent) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('nostr_public_key', publicKey)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { success: false, error: 'Unknown Nostr public key' };
    }

    // Signature verification should be performed by the caller (e.g. a Next.js
    // route handler) before this function is invoked — this helper only
    // resolves the Nostr pubkey to a Supabase user row.
    return { success: true, authData: { user: data, signedEvent } };
  } catch (error) {
    console.error('Error verifying Nostr auth with Supabase:', error);
    return { success: false, error: error.message || 'Authentication failed' };
  }
};

// Register a new user with a Nostr public key
export const registerWithNostr = async (supabase, publicKey, userData) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .insert({ nostr_public_key: publicKey, ...userData })
      .select()
      .single();

    if (error) throw error;
    return { success: true, user: data };
  } catch (error) {
    console.error('Error registering with Nostr:', error);
    return { success: false, error: error.message || 'Registration failed' };
  }
};
