/**
 * Migration: Add Distributed Inference Support
 * 
 * This migration adds the necessary collections and fields to support distributed inference
 * across multiple nodes in the Infernet Protocol network.
 */

export default {
  name: 'add_distributed_inference_support',
  
  async up(db) {
    // Create node_roles collection
    try {
      await db.collection('node_roles').create({
        name: 'node_roles',
        type: 'base',
        schema: [
          {
            name: 'node',
            type: 'relation',
            required: true,
            options: {
              collectionId: 'nodes',
              cascadeDelete: true
            }
          },
          {
            name: 'role',
            type: 'select',
            required: true,
            options: {
              values: ['coordinator', 'worker', 'hybrid']
            }
          },
          {
            name: 'worker_address',
            type: 'text',
            required: false
          },
          {
            name: 'coordinator_address',
            type: 'text',
            required: false
          },
          {
            name: 'available_memory',
            type: 'number',
            required: false
          },
          {
            name: 'max_batch_size',
            type: 'number',
            required: false
          }
        ]
      });
      
      console.log('Created node_roles collection');
    } catch (err) {
      if (err.status === 400 && err.data?.name?.code === 'validation_not_unique') {
        console.log('node_roles collection already exists');
      } else {
        throw err;
      }
    }
    
    // Create distributed_jobs collection
    try {
      await db.collection('distributed_jobs').create({
        name: 'distributed_jobs',
        type: 'base',
        schema: [
          {
            name: 'job',
            type: 'relation',
            required: true,
            options: {
              collectionId: 'jobs',
              cascadeDelete: true
            }
          },
          {
            name: 'coordinator',
            type: 'relation',
            required: true,
            options: {
              collectionId: 'nodes'
            }
          },
          {
            name: 'workers',
            type: 'relation',
            required: true,
            options: {
              collectionId: 'nodes',
              maxSelect: null
            }
          },
          {
            name: 'distribution_strategy',
            type: 'select',
            required: true,
            options: {
              values: ['tensor_parallel', 'pipeline_parallel', 'data_parallel']
            }
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            options: {
              values: ['pending', 'running', 'completed', 'failed']
            }
          }
        ]
      });
      
      console.log('Created distributed_jobs collection');
    } catch (err) {
      if (err.status === 400 && err.data?.name?.code === 'validation_not_unique') {
        console.log('distributed_jobs collection already exists');
      } else {
        throw err;
      }
    }
    
    // Add distributed inference settings
    try {
      await db.collection('settings').create({
        key: 'inference.distributed.enabled',
        value: JSON.stringify(false),
        scope: 'node',
        description: 'Enable distributed inference across multiple nodes'
      });
      
      await db.collection('settings').create({
        key: 'inference.distributed.coordinator_port',
        value: JSON.stringify(3001),
        scope: 'node',
        description: 'Port for the distributed inference coordinator WebSocket server'
      });
      
      await db.collection('settings').create({
        key: 'inference.distributed.worker_port',
        value: JSON.stringify(3002),
        scope: 'node',
        description: 'Port for the distributed inference worker WebSocket server'
      });
      
      await db.collection('settings').create({
        key: 'inference.distributed.default_strategy',
        value: JSON.stringify('tensor_parallel'),
        scope: 'node',
        description: 'Default distribution strategy for inference jobs'
      });
      
      console.log('Added distributed inference settings');
    } catch (err) {
      console.log('Some settings may already exist:', err.message);
    }
  },
  
  async down(db) {
    // Remove collections in reverse order
    try {
      await db.collection('distributed_jobs').delete();
      console.log('Deleted distributed_jobs collection');
    } catch (err) {
      console.log('Error deleting distributed_jobs collection:', err.message);
    }
    
    try {
      await db.collection('node_roles').delete();
      console.log('Deleted node_roles collection');
    } catch (err) {
      console.log('Error deleting node_roles collection:', err.message);
    }
    
    // Remove settings
    try {
      const settings = await db.collection('settings').getFullList({
        filter: 'key ~ "inference.distributed."'
      });
      
      for (const setting of settings) {
        await db.collection('settings').delete(setting.id);
      }
      
      console.log('Deleted distributed inference settings');
    } catch (err) {
      console.log('Error deleting distributed inference settings:', err.message);
    }
  }
};
