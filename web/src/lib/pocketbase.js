import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';

// Create a PocketBase client instance
const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8080');

// Create a store for the current user
export const currentUser = writable(pb.authStore.model);

// Update the store when auth state changes
pb.authStore.onChange((token, model) => {
  currentUser.set(model);
});

// Helper function to get nodes from the API
export async function getNodes() {
  try {
    return await pb.collection('nodes').getFullList({
      sort: '-created',
      expand: 'gpus,cpus'
    });
  } catch (error) {
    console.error('Error fetching nodes:', error);
    throw error;
  }
}

// Helper function to get jobs from the API
export async function getJobs() {
  try {
    return await pb.collection('jobs').getFullList({
      sort: '-created',
      expand: 'node'
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
}

// Helper function to get a single node by ID
export async function getNode(id) {
  try {
    return await pb.collection('nodes').getOne(id, {
      expand: 'gpus,cpus,jobs'
    });
  } catch (error) {
    console.error(`Error fetching node ${id}:`, error);
    throw error;
  }
}

// Helper function to get a single job by ID
export async function getJob(id) {
  try {
    return await pb.collection('jobs').getOne(id, {
      expand: 'node'
    });
  } catch (error) {
    console.error(`Error fetching job ${id}:`, error);
    throw error;
  }
}

// Helper function to create a new node
export async function createNode(nodeData) {
  try {
    return await pb.collection('nodes').create(nodeData);
  } catch (error) {
    console.error('Error creating node:', error);
    throw error;
  }
}

// Helper function to update a node
export async function updateNode(id, nodeData) {
  try {
    return await pb.collection('nodes').update(id, nodeData);
  } catch (error) {
    console.error(`Error updating node ${id}:`, error);
    throw error;
  }
}

// Helper function to delete a node
export async function deleteNode(id) {
  try {
    return await pb.collection('nodes').delete(id);
  } catch (error) {
    console.error(`Error deleting node ${id}:`, error);
    throw error;
  }
}

// Helper function to create a new job
export async function createJob(jobData) {
  try {
    return await pb.collection('jobs').create(jobData);
  } catch (error) {
    console.error('Error creating job:', error);
    throw error;
  }
}

// Helper function to update a job
export async function updateJob(id, jobData) {
  try {
    return await pb.collection('jobs').update(id, jobData);
  } catch (error) {
    console.error(`Error updating job ${id}:`, error);
    throw error;
  }
}

// Export the PocketBase instance for direct use
export default pb;
