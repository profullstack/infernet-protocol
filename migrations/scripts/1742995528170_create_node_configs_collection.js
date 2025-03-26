/**
 * Migration: Create node_configs collection
 * 
 * This migration creates the node_configs collection for storing local node
 * configuration settings in the Infernet Protocol network.
 */

export async function up(pb) {
  console.log('Creating node_configs collection...');
  
  return await pb.collections.create({
    name: 'node_configs',
    type: 'base',
    system: false,
    schema: [
      {
        name: 'nodeId',
        type: 'relation',
        required: true,
        options: {
          collectionId: '', // Will be filled in dynamically
          cascadeDelete: true
        }
      },
      {
        name: 'maxConcurrentJobs',
        type: 'number',
        required: false,
        options: {
          min: 1,
          default: 1
        }
      },
      {
        name: 'gpuAllocationStrategy',
        type: 'select',
        required: false,
        options: {
          values: ['single', 'tensor_parallel', 'pipeline_parallel', 'hybrid'],
          default: 'single'
        }
      },
      {
        name: 'maxVRAMUsagePercent',
        type: 'number',
        required: false,
        options: {
          min: 10,
          max: 100,
          default: 90
        }
      },
      {
        name: 'enabledModels',
        type: 'json',
        required: false
      },
      {
        name: 'p2pSettings',
        type: 'json',
        required: false
      },
      {
        name: 'autoUpdateEnabled',
        type: 'bool',
        required: false,
        options: {
          default: true
        }
      },
      {
        name: 'paymentAddress',
        type: 'text',
        required: false
      },
      {
        name: 'minJobPrice',
        type: 'number',
        required: false,
        options: {
          min: 0,
          step: 0.0001
        }
      }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_node_config_node_id ON node_configs (nodeId)'
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
  const collection = await pb.collections.getOne('node_configs');
  
  // Delete the collection
  return await pb.collections.delete(collection.id);
}
