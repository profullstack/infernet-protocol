/**
 * Migration: Create models collection
 * 
 * This migration creates the models collection for storing information about
 * available AI models in the Infernet Protocol network.
 */

export async function up(pb) {
  console.log('Creating models collection...');
  
  return await pb.collections.create({
    name: 'models',
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
        name: 'description',
        type: 'text',
        required: false
      },
      {
        name: 'type',
        type: 'select',
        required: true,
        options: {
          values: ['text', 'image', 'audio', 'video', 'multimodal']
        }
      },
      {
        name: 'parameters',
        type: 'number',
        required: false
      },
      {
        name: 'quantization',
        type: 'text',
        required: false
      },
      {
        name: 'minVRAM',
        type: 'number',
        required: false,
        options: {
          min: 0
        }
      },
      {
        name: 'containerImage',
        type: 'text',
        required: false
      },
      {
        name: 'supportsTensorParallelism',
        type: 'bool',
        required: false
      },
      {
        name: 'supportsPipelineParallelism',
        type: 'bool',
        required: false
      },
      {
        name: 'averageTokensPerSecond',
        type: 'number',
        required: false
      },
      {
        name: 'pricePerToken',
        type: 'number',
        required: false,
        options: {
          min: 0,
          step: 0.000001
        }
      }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_model_name ON models (name)',
      'CREATE INDEX idx_model_type ON models (type)'
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
  const collection = await pb.collections.getOne('models');
  
  // Delete the collection
  return await pb.collections.delete(collection.id);
}
