/**
 * Migration: add_settings_collection
 * 
 * This migration add settings collection.
 */

export async function up(pb) {
  console.log('Running migration: add_settings_collection...');
  
  try {
    // Your migration code here
    // Example: Create a collection
    // return await pb.collections.create({
    //   name: 'collection_name',
    //   type: 'base',
    //   system: false,
    //   schema: [
    //     {
    //       name: 'field_name',
    //       type: 'text',
    //       required: true
    //     }
    //   ]
    // });
    
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function down(pb) {
  console.log('Rolling back migration: add_settings_collection...');
  
  try {
    // Your rollback code here
    // Example: Delete a collection
    // const collection = await pb.collections.getOne('collection_name');
    // return await pb.collections.delete(collection.id);
    
    return true;
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}
