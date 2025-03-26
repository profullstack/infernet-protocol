/**
 * Migration: Create clients collection
 * 
 * This migration creates the clients collection for storing information about
 * users who submit inference jobs to the Infernet Protocol network.
 */

export async function up(pb) {
  console.log('Creating clients collection...');
  
  return await pb.collections.create({
    name: 'clients',
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
        name: 'publicKey',
        type: 'text',
        required: false
      },
      {
        name: 'totalSpent',
        type: 'number',
        required: false,
        options: {
          min: 0,
          step: 0.0001
        }
      },
      {
        name: 'jobsSubmitted',
        type: 'number',
        required: false,
        options: {
          min: 0
        }
      },
      {
        name: 'lastActive',
        type: 'date',
        required: false
      },
      {
        name: 'preferredModels',
        type: 'json',
        required: false
      },
      {
        name: 'paymentInfo',
        type: 'json',
        required: false
      }
    ],
    indexes: [
      'CREATE INDEX idx_client_name ON clients (name)'
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
  const collection = await pb.collections.getOne('clients');
  
  // Delete the collection
  return await pb.collections.delete(collection.id);
}
