/**
 * Migration: add_settings_collection
 * 
 * This migration add settings collection.
 */

export async function up(pb) {
  console.log('Running migration: add_settings_collection...');
  
  try {
    // Create settings collection for global and user-specific settings
    const settingsCollection = await pb.collections.create({
      name: 'settings',
      type: 'base',
      system: false,
      listRule: '',  // Only admins can view all settings
      viewRule: 'scope = \'global\' || (user.id != \'\')', // Users can view their own settings or global settings
      createRule: '@request.auth.id != \'\'', // Authenticated users can create settings
      updateRule: 'user.id = @request.auth.id || @request.auth.role = \'admin\'', // Users can update their own settings, admins can update any
      deleteRule: 'user.id = @request.auth.id || @request.auth.role = \'admin\'', // Users can delete their own settings, admins can delete any
      schema: [
        {
          name: 'key',
          type: 'text',
          required: true,
          options: {
            min: 2,
            max: 64,
            pattern: '^[a-zA-Z0-9_\.]+$'
          }
        },
        {
          name: 'value',
          type: 'json',
          required: true
        },
        {
          name: 'scope',
          type: 'select',
          required: true,
          options: {
            values: ['global', 'user', 'node']
          }
        },
        {
          name: 'description',
          type: 'text',
          required: false
        },
        {
          name: 'user',
          type: 'relation',
          required: false,
          options: {
            collectionId: '_pb_users_auth_',
            cascadeDelete: true
          }
        },
        {
          name: 'node',
          type: 'relation',
          required: false,
          options: {
            collectionId: 'nodes',
            cascadeDelete: true
          }
        }
      ]
    });
    
    console.log('Created settings collection:', settingsCollection.name);
    
    // Create indexes for faster lookups
    await pb.dao.db.createIndex('settings', 'CREATE INDEX idx_settings_key ON settings (key)')
    await pb.dao.db.createIndex('settings', 'CREATE INDEX idx_settings_scope ON settings (scope)')
    await pb.dao.db.createIndex('settings', 'CREATE UNIQUE INDEX idx_settings_key_scope_user ON settings (key, scope, user) WHERE user IS NOT NULL')
    await pb.dao.db.createIndex('settings', 'CREATE UNIQUE INDEX idx_settings_key_scope_node ON settings (key, scope, node) WHERE node IS NOT NULL')
    await pb.dao.db.createIndex('settings', 'CREATE UNIQUE INDEX idx_settings_key_scope_global ON settings (key, scope) WHERE scope = \'global\'')
    
    console.log('Created indexes for settings collection');
    
    // Seed some global settings
    const globalSettings = [
      {
        key: 'network.fee_rate',
        value: JSON.stringify(0.01),
        scope: 'global',
        description: 'Default network fee rate (in sats)'
      },
      {
        key: 'network.min_reputation',
        value: JSON.stringify(0.5),
        scope: 'global',
        description: 'Minimum reputation score required for nodes to participate in the network'
      },
      {
        key: 'network.job_timeout',
        value: JSON.stringify(3600),
        scope: 'global',
        description: 'Default job timeout in seconds'
      }
    ];
    
    for (const setting of globalSettings) {
      await pb.collection('settings').create(setting);
    }
    
    console.log('Seeded global settings');
    
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function down(pb) {
  console.log('Rolling back migration: add_settings_collection...');
  
  try {
    // Get the settings collection
    const collection = await pb.collections.getOne('settings');
    
    // Delete all settings records first
    const settings = await pb.collection('settings').getFullList();
    for (const setting of settings) {
      await pb.collection('settings').delete(setting.id);
    }
    console.log(`Deleted ${settings.length} settings records`);
    
    // Delete the collection
    await pb.collections.delete(collection.id);
    console.log('Deleted settings collection');
    
    return true;
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}
