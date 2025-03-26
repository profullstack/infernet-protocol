/**
 * Migration: Create aggregators collection
 * 
 * This migration creates the aggregators collection for storing information about
 * nodes that coordinate multi-node inference jobs in the Infernet Protocol network.
 */

export async function up(pb) {
  console.log('Creating aggregators collection...');
  
  return await pb.collections.create({
    name: 'aggregators',
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
        name: 'jobsCoordinated',
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
      },
      {
        name: 'fee',
        type: 'number',
        required: false,
        options: {
          min: 0,
          max: 10,
          step: 0.1
        }
      }
    ],
    indexes: [
      'CREATE INDEX idx_aggregator_status ON aggregators (status)',
      'CREATE UNIQUE INDEX idx_aggregator_ip ON aggregators (ip)'
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
  const collection = await pb.collections.getOne('aggregators');
  
  // Delete the collection
  return await pb.collections.delete(collection.id);
}
