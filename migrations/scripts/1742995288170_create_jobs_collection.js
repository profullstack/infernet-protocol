/**
 * Migration: Create jobs collection
 * 
 * This migration creates the jobs collection for storing information about
 * inference jobs in the Infernet Protocol network.
 */

export async function up(pb) {
  console.log('Creating jobs collection...');
  
  return await pb.collections.create({
    name: 'jobs',
    type: 'base',
    system: false,
    schema: [
      {
        name: 'model',
        type: 'text',
        required: true,
        options: {
          min: 1,
          max: 100
        }
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        options: {
          values: ['queued', 'running', 'completed', 'failed', 'canceled']
        }
      },
      {
        name: 'runtime',
        type: 'text',
        required: false
      },
      {
        name: 'node',
        type: 'relation',
        required: false,
        options: {
          collectionId: '', // Will be filled in dynamically
          cascadeDelete: false
        }
      },
      {
        name: 'startTime',
        type: 'date',
        required: false
      },
      {
        name: 'endTime',
        type: 'date',
        required: false
      },
      {
        name: 'inputTokens',
        type: 'number',
        required: false,
        options: {
          min: 0
        }
      },
      {
        name: 'outputTokens',
        type: 'number',
        required: false,
        options: {
          min: 0
        }
      },
      {
        name: 'cost',
        type: 'number',
        required: false,
        options: {
          min: 0,
          step: 0.0001
        }
      },
      {
        name: 'client',
        type: 'relation',
        required: false,
        options: {
          collectionId: '', // Will be filled in dynamically
          cascadeDelete: false
        }
      },
      {
        name: 'prompt',
        type: 'text',
        required: false
      },
      {
        name: 'result',
        type: 'text',
        required: false
      }
    ],
    indexes: [
      'CREATE INDEX idx_job_status ON jobs (status)',
      'CREATE INDEX idx_job_model ON jobs (model)'
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
  const collection = await pb.collections.getOne('jobs');
  
  // Delete the collection
  return await pb.collections.delete(collection.id);
}
