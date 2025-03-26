/**
 * Migration: Setup collection relations
 * 
 * This migration sets up the relationships between collections by updating
 * the relation fields with the correct collection IDs.
 */

export async function up(pb) {
  console.log('Setting up collection relations...');
  
  try {
    // Get collection IDs
    const nodesCollection = await pb.collections.getOne('nodes');
    const jobsCollection = await pb.collections.getOne('jobs');
    const clientsCollection = await pb.collections.getOne('clients');
    
    // Update jobs collection relations
    console.log('Updating jobs collection relations...');
    await pb.collections.update(jobsCollection.id, {
      schema: jobsCollection.schema.map(field => {
        if (field.name === 'node') {
          return {
            ...field,
            options: {
              ...field.options,
              collectionId: nodesCollection.id
            }
          };
        } else if (field.name === 'client') {
          return {
            ...field,
            options: {
              ...field.options,
              collectionId: clientsCollection.id
            }
          };
        }
        return field;
      })
    });
    
    // Update node_configs collection relations
    console.log('Updating node_configs collection relations...');
    const nodeConfigsCollection = await pb.collections.getOne('node_configs');
    await pb.collections.update(nodeConfigsCollection.id, {
      schema: nodeConfigsCollection.schema.map(field => {
        if (field.name === 'nodeId') {
          return {
            ...field,
            options: {
              ...field.options,
              collectionId: nodesCollection.id
            }
          };
        }
        return field;
      })
    });
    
    // Update reputation_history collection relations
    console.log('Updating reputation_history collection relations...');
    const reputationHistoryCollection = await pb.collections.getOne('reputation_history');
    await pb.collections.update(reputationHistoryCollection.id, {
      schema: reputationHistoryCollection.schema.map(field => {
        if (field.name === 'nodeId') {
          return {
            ...field,
            options: {
              ...field.options,
              collectionId: nodesCollection.id
            }
          };
        } else if (field.name === 'jobId') {
          return {
            ...field,
            options: {
              ...field.options,
              collectionId: jobsCollection.id
            }
          };
        }
        return field;
      })
    });
    
    console.log('Collection relations setup complete');
  } catch (error) {
    console.error('Error setting up collection relations:', error);
    throw error;
  }
}

export async function down(pb) {
  // This is a non-destructive migration, so down is a no-op
  console.log('No down migration needed for collection relations');
  return true;
}
