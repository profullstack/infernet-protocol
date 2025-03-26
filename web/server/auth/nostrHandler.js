/**
 * Nostr Authentication Handler for PocketBase
 * 
 * This module extends PocketBase to handle Nostr authentication requests.
 */

import { verifySignature } from 'nostr-tools';

/**
 * Register Nostr authentication handlers with PocketBase and Hono
 * @param {Object} pb - PocketBase instance
 * @param {Object} app - Hono app instance
 */
export function registerNostrAuthHandlers(pb, app) {
  // Add custom auth method to PocketBase
  pb.collection('users').authWithNostr = async function(nostrData) {
    const { publicKey, signedEvent } = nostrData;
    
    if (!publicKey || !signedEvent) {
      throw new Error('Missing required Nostr authentication data');
    }
    
    // Verify the signature of the event
    const isValid = verifySignature(signedEvent);
    if (!isValid) {
      throw new Error('Invalid Nostr signature');
    }
    
    // Check if the public key in the event matches the provided public key
    if (signedEvent.pubkey !== publicKey) {
      throw new Error('Public key mismatch');
    }
    
    // Find user by Nostr public key
    let user;
    try {
      const users = await pb.collection('users').getFullList({
        filter: `nostrPublicKey = "${publicKey}"`
      });
      
      if (users.length > 0) {
        user = users[0];
      }
    } catch (error) {
      console.error('Error finding user by Nostr public key:', error);
      throw new Error('Authentication failed');
    }
    
    // If user doesn't exist, return error (user must be created first)
    if (!user) {
      throw new Error('User not found. Please register first.');
    }
    
    // Authenticate the user
    try {
      const authData = await pb.collection('users').authRefresh({
        id: user.id,
      }, { noCache: true });
      
      // Update auth method record
      await updateAuthMethod(pb, user.id, 'nostr', publicKey);
      
      return authData;
    } catch (error) {
      console.error('Error authenticating with Nostr:', error);
      throw new Error('Authentication failed');
    }
  };
  
  // Register API endpoints with Hono
  app.post('/api/nostr/auth', async (c) => {
    try {
      const body = await c.req.json();
      const { publicKey, signedEvent } = body;
      
      if (!publicKey || !signedEvent) {
        return c.json({ success: false, message: 'Missing required fields' }, 400);
      }
      
      const authData = await pb.collection('users').authWithNostr({
        publicKey,
        signedEvent,
      });
      
      return c.json({ success: true, data: authData });
    } catch (error) {
      return c.json({ success: false, message: error.message }, 401);
    }
  });
  
  app.post('/api/nostr/register', async (c) => {
    try {
      const body = await c.req.json();
      const { publicKey, signedEvent, userData } = body;
      
      if (!publicKey || !signedEvent || !userData || !userData.name) {
        return c.json({ success: false, message: 'Missing required fields' }, 400);
      }
      
      // Verify the signature
      const isValid = verifySignature(signedEvent);
      if (!isValid) {
        return c.json({ success: false, message: 'Invalid Nostr signature' }, 400);
      }
      
      // Check if the public key in the event matches the provided public key
      if (signedEvent.pubkey !== publicKey) {
        return c.json({ success: false, message: 'Public key mismatch' }, 400);
      }
      
      // Check if user with this public key already exists
      const existingUsers = await pb.collection('users').getFullList({
        filter: `nostrPublicKey = "${publicKey}"`
      });
      
      if (existingUsers.length > 0) {
        return c.json({ success: false, message: 'User with this Nostr public key already exists' }, 400);
      }
      
      // Create the user
      const user = await pb.collection('users').create({
        nostrPublicKey: publicKey,
        name: userData.name,
        username: userData.username || `nostr_${publicKey.substring(0, 8)}`,
        password: crypto.randomUUID(), // Random password since we'll use Nostr for auth
        passwordConfirm: crypto.randomUUID(),
        verified: true, // Nostr verification is done via signature
      });
      
      // Create auth method record
      await createAuthMethod(pb, user.id, 'nostr', publicKey);
      
      // Authenticate the user
      const authData = await pb.collection('users').authWithNostr({
        publicKey,
        signedEvent,
      });
      
      return c.json({ success: true, data: authData });
    } catch (error) {
      console.error('Error registering with Nostr:', error);
      return c.json({ success: false, message: error.message }, 400);
    }
  });
}

/**
 * Create an auth method record
 */
async function createAuthMethod(pb, userId, type, identifier) {
  try {
    await pb.collection('auth_methods').create({
      user: userId,
      type: type,
      identifier: identifier,
      verified: true,
      lastUsed: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating auth method:', error);
  }
}

/**
 * Update an auth method's last used timestamp
 */
async function updateAuthMethod(pb, userId, type, identifier) {
  try {
    const records = await pb.collection('auth_methods').getFullList({
      filter: `user = "${userId}" && type = "${type}" && identifier = "${identifier}"`
    });
    
    if (records.length > 0) {
      await pb.collection('auth_methods').update(records[0].id, {
        lastUsed: new Date().toISOString(),
      });
    } else {
      await createAuthMethod(pb, userId, type, identifier);
    }
  } catch (error) {
    console.error('Error updating auth method:', error);
  }
}
