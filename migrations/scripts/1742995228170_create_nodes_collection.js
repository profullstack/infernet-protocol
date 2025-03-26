/**
 * Migration: Create nodes collection
 * 
 * This migration creates the nodes collection for storing information about
 * GPU/CPU provider nodes in the Infernet Protocol network.
 */

export async function up(pb) {
  console.log('Creating nodes collection...');
  
  return await pb.collections.create({
    name: 'nodes',
    type: 'base',
    system: false,
    schema: [
      {
        name: 'name',
        type: 'text',
        required: true,
        options: {
          min: 2,
          max: 100
        }
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        options: {
          values: ['online', 'offline', 'maintenance']
        }
      },
      {
        name: 'ip',
        type: 'text',
        required: true
      },
      {
        name: 'lastSeen',
        type: 'date',
        required: true
      },
      {
        name: 'gpus',
        type: 'json',
        required: false
      },
      {
        name: 'cpus',
        type: 'json',
        required: false
      },
      {
        name: 'jobsCompleted',
        type: 'number',
        required: false,
        options: {
          min: 0
        }
      },
      {
        name: 'uptime',
        type: 'text',
        required: false
      },
      {
        name: 'publicKey',
        type: 'text',
        required: false
      },
      {
        name: 'reputation',
        type: 'number',
        required: false,
        options: {
          min: 0,
          max: 5,
          step: 0.1
        }
      }
    ],
    indexes: [
      'CREATE INDEX idx_node_status ON nodes (status)',
      'CREATE UNIQUE INDEX idx_node_ip ON nodes (ip)'
    ],
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: ''
  });
}

export async function down(pb) {
  // Find the collection by name
  const collection = await pb.collections.getOne('nodes');
  
  // Delete the collection
  return await pb.collections.delete(collection.id);
}
