/**
 * Migration: Create reputation_history collection
 * 
 * This migration creates the reputation_history collection for tracking changes
 * in node reputation over time in the Infernet Protocol network.
 */

export async function up(pb) {
  console.log('Creating reputation_history collection...');
  
  return await pb.collections.create({
    name: 'reputation_history',
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
        name: 'timestamp',
        type: 'date',
        required: true
      },
      {
        name: 'oldScore',
        type: 'number',
        required: true,
        options: {
          min: 0,
          max: 5,
          step: 0.1
        }
      },
      {
        name: 'newScore',
        type: 'number',
        required: true,
        options: {
          min: 0,
          max: 5,
          step: 0.1
        }
      },
      {
        name: 'reason',
        type: 'text',
        required: false
      },
      {
        name: 'jobId',
        type: 'relation',
        required: false,
        options: {
          collectionId: '', // Will be filled in dynamically
          cascadeDelete: false
        }
      }
    ],
    indexes: [
      'CREATE INDEX idx_reputation_node_id ON reputation_history (nodeId)',
      'CREATE INDEX idx_reputation_timestamp ON reputation_history (timestamp)'
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
  const collection = await pb.collections.getOne('reputation_history');
  
  // Delete the collection
  return await pb.collections.delete(collection.id);
}
