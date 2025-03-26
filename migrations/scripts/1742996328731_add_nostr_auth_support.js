/**
 * Migration: add_nostr_auth_support
 * 
 * This migration adds Nostr authentication support to the users collection
 * and creates a new auth_methods collection to track different auth methods.
 */

export async function up(pb) {
  console.log('Running migration: add_nostr_auth_support...');
  
  try {
    // 1. Update the users collection to add nostrPublicKey field
    const usersCollection = await pb.collections.getOne('users');
    
    // Check if the collection exists, if not create it
    if (!usersCollection) {
      console.log('Users collection not found, creating it...');
      await pb.collections.create({
        name: 'users',
        type: 'auth',
        system: false,
        schema: [
          {
            name: 'name',
            type: 'text',
            required: true,
          },
          {
            name: 'avatar',
            type: 'file',
            required: false,
          },
          {
            name: 'nostrPublicKey',
            type: 'text',
            required: false,
            options: {
              min: 64,
              max: 64,
              pattern: '^[0-9a-f]{64}$'
            }
          }
        ]
      });
    } else {
      // Update existing users collection to add nostrPublicKey field
      console.log('Updating users collection to add nostrPublicKey field...');
      
      // Check if the field already exists
      const hasNostrField = usersCollection.schema.some(field => field.name === 'nostrPublicKey');
      
      if (!hasNostrField) {
        const updatedSchema = [...usersCollection.schema, {
          name: 'nostrPublicKey',
          type: 'text',
          required: false,
          options: {
            min: 64,
            max: 64,
            pattern: '^[0-9a-f]{64}$'
          }
        }];
        
        await pb.collections.update(usersCollection.id, {
          schema: updatedSchema
        });
      }
    }
    
    // 2. Create auth_methods collection to track different auth methods
    console.log('Creating auth_methods collection...');
    await pb.collections.create({
      name: 'auth_methods',
      type: 'base',
      system: false,
      listRule: 'user.id = @request.auth.id',
      viewRule: 'user.id = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: 'user.id = @request.auth.id',
      deleteRule: 'user.id = @request.auth.id',
      schema: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          options: {
            collectionId: 'users',
            cascadeDelete: true
          }
        },
        {
          name: 'type',
          type: 'select',
          required: true,
          options: {
            values: ['email', 'nostr']
          }
        },
        {
          name: 'identifier',
          type: 'text',
          required: true
        },
        {
          name: 'verified',
          type: 'bool',
          required: true,
          options: {
            default: false
          }
        },
        {
          name: 'lastUsed',
          type: 'date',
          required: false
        }
      ]
    });
    
    // Create indexes for faster lookups
    await pb.dao.db.createIndex('auth_methods', 'CREATE INDEX idx_auth_methods_user ON auth_methods (user)');
    await pb.dao.db.createIndex('auth_methods', 'CREATE INDEX idx_auth_methods_type ON auth_methods (type)');
    await pb.dao.db.createIndex('auth_methods', 'CREATE UNIQUE INDEX idx_auth_methods_type_identifier ON auth_methods (type, identifier)');
    
    console.log('Created indexes for auth_methods collection');
    
    // 3. Create a custom API endpoint for Nostr authentication
    // Note: This will be implemented in the server code, not in the migration
    
    console.log('Nostr authentication support added successfully');
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function down(pb) {
  console.log('Rolling back migration: add_nostr_auth_support...');
  
  try {
    // 1. Remove nostrPublicKey field from users collection
    const usersCollection = await pb.collections.getOne('users');
    
    if (usersCollection) {
      const updatedSchema = usersCollection.schema.filter(field => field.name !== 'nostrPublicKey');
      
      await pb.collections.update(usersCollection.id, {
        schema: updatedSchema
      });
      
      console.log('Removed nostrPublicKey field from users collection');
    }
    
    // 2. Delete auth_methods collection
    try {
      const authMethodsCollection = await pb.collections.getOne('auth_methods');
      
      if (authMethodsCollection) {
        // Delete all records first
        const authMethods = await pb.collection('auth_methods').getFullList();
        for (const method of authMethods) {
          await pb.collection('auth_methods').delete(method.id);
        }
        
        // Then delete the collection
        await pb.collections.delete(authMethodsCollection.id);
        console.log('Deleted auth_methods collection');
      }
    } catch (error) {
      console.log('Auth methods collection not found, skipping deletion');
    }
    
    return true;
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}
