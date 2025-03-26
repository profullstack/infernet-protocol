/**
 * Distributed Inference System
 * 
 * This module provides the main entry point for the distributed inference system.
 * It exports the coordinator and worker classes, as well as utility functions for
 * setting up and managing distributed inference.
 */

import { InferenceCoordinator } from './coordinator.js';
import { InferenceWorker } from './worker.js';
import { MessageTypes, DistributionStrategies } from './protocol.js';

/**
 * Initialize the distributed inference system based on node configuration
 * 
 * @param {Object} pb - PocketBase instance
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Initialized coordinator or worker
 */
export async function initDistributedInference(pb, config = {}) {
  try {
    // Check if distributed inference is enabled
    const enabledSetting = await getSetting(pb, 'inference.distributed.enabled');
    const isEnabled = enabledSetting ? JSON.parse(enabledSetting.value) : false;
    
    if (!isEnabled) {
      console.log('Distributed inference is disabled');
      return null;
    }
    
    // Get node ID
    const nodeId = config.nodeId;
    if (!nodeId) {
      throw new Error('Node ID is required for distributed inference');
    }
    
    // Get node role
    const nodeRole = await getNodeRole(pb, nodeId);
    if (!nodeRole) {
      console.log('No role configured for this node, skipping distributed inference');
      return null;
    }
    
    // Initialize based on role
    if (nodeRole.role === 'coordinator' || nodeRole.role === 'hybrid') {
      return initCoordinator(pb, nodeId, nodeRole);
    } else if (nodeRole.role === 'worker') {
      return initWorker(pb, nodeId, nodeRole);
    } else {
      console.log(`Unknown role: ${nodeRole.role}`);
      return null;
    }
  } catch (error) {
    console.error('Error initializing distributed inference:', error);
    return null;
  }
}

/**
 * Initialize a coordinator node
 * 
 * @param {Object} pb - PocketBase instance
 * @param {string} nodeId - Node ID
 * @param {Object} nodeRole - Node role information
 * @returns {Promise<InferenceCoordinator>} - Initialized coordinator
 */
async function initCoordinator(pb, nodeId, nodeRole) {
  // Get coordinator port
  const portSetting = await getSetting(pb, 'inference.distributed.coordinator_port');
  const port = portSetting ? JSON.parse(portSetting.value) : 3001;
  
  console.log(`Initializing coordinator on port ${port}`);
  
  // Create and start coordinator
  const coordinator = new InferenceCoordinator(pb, {
    port,
    nodeId
  });
  
  await coordinator.start();
  return coordinator;
}

/**
 * Initialize a worker node
 * 
 * @param {Object} pb - PocketBase instance
 * @param {string} nodeId - Node ID
 * @param {Object} nodeRole - Node role information
 * @returns {Promise<InferenceWorker>} - Initialized worker
 */
async function initWorker(pb, nodeId, nodeRole) {
  if (!nodeRole.coordinator_address) {
    throw new Error('Coordinator address is required for worker nodes');
  }
  
  console.log(`Initializing worker connecting to ${nodeRole.coordinator_address}`);
  
  // Get worker capabilities
  const capabilities = await getNodeCapabilities(pb, nodeId);
  
  // Create and connect worker
  const worker = new InferenceWorker(pb, {
    coordinatorUrl: nodeRole.coordinator_address,
    nodeId,
    ...capabilities
  });
  
  await worker.connect();
  return worker;
}

/**
 * Get a setting from PocketBase
 * 
 * @param {Object} pb - PocketBase instance
 * @param {string} key - Setting key
 * @returns {Object|null} - Setting object or null
 */
async function getSetting(pb, key) {
  try {
    const settings = await pb.collection('settings').getFullList({
      filter: `key="${key}"`
    });
    
    return settings.length > 0 ? settings[0] : null;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return null;
  }
}

/**
 * Get node role information
 * 
 * @param {Object} pb - PocketBase instance
 * @param {string} nodeId - Node ID
 * @returns {Object|null} - Node role information or null
 */
async function getNodeRole(pb, nodeId) {
  try {
    const roles = await pb.collection('node_roles').getFullList({
      filter: `node="${nodeId}"`
    });
    
    return roles.length > 0 ? roles[0] : null;
  } catch (error) {
    console.error(`Error getting node role for ${nodeId}:`, error);
    return null;
  }
}

/**
 * Get node capabilities
 * 
 * @param {Object} pb - PocketBase instance
 * @param {string} nodeId - Node ID
 * @returns {Object} - Node capabilities
 */
async function getNodeCapabilities(pb, nodeId) {
  try {
    // Get node information
    const node = await pb.collection('nodes').getOne(nodeId);
    
    // Get node role information
    const nodeRole = await getNodeRole(pb, nodeId);
    
    // Basic capabilities
    const capabilities = {
      memory: nodeRole?.available_memory || 8192, // Default 8GB
      maxBatchSize: nodeRole?.max_batch_size || 1,
      maxJobs: 2, // Default max concurrent jobs
      hasGPU: false,
      supportedModels: ['llama-7b', 'llama-13b'], // Default supported models
      supportedTasks: ['text-generation', 'embeddings'] // Default supported tasks
    };
    
    // Check for GPU
    if (node.gpu_info) {
      try {
        const gpuInfo = JSON.parse(node.gpu_info);
        capabilities.hasGPU = gpuInfo.available || false;
        capabilities.gpuMemory = gpuInfo.memory || 0;
        capabilities.gpuName = gpuInfo.name || '';
      } catch (e) {
        console.error('Error parsing GPU info:', e);
      }
    }
    
    // Check for supported models
    if (node.supported_models) {
      try {
        capabilities.supportedModels = JSON.parse(node.supported_models);
      } catch (e) {
        console.error('Error parsing supported models:', e);
      }
    }
    
    return capabilities;
  } catch (error) {
    console.error(`Error getting node capabilities for ${nodeId}:`, error);
    
    // Return default capabilities
    return {
      memory: 8192,
      maxBatchSize: 1,
      maxJobs: 2,
      hasGPU: false,
      supportedModels: ['llama-7b', 'llama-13b'],
      supportedTasks: ['text-generation', 'embeddings']
    };
  }
}

/**
 * Start a distributed inference job
 * 
 * @param {Object} pb - PocketBase instance
 * @param {string} jobId - Job ID
 * @param {Object} jobConfig - Job configuration
 * @returns {Promise<Object>} - Job status
 */
export async function startDistributedJob(pb, jobId, jobConfig = {}) {
  try {
    // Get node ID
    const nodeId = jobConfig.nodeId;
    if (!nodeId) {
      throw new Error('Node ID is required for distributed inference');
    }
    
    // Get node role
    const nodeRole = await getNodeRole(pb, nodeId);
    if (!nodeRole || (nodeRole.role !== 'coordinator' && nodeRole.role !== 'hybrid')) {
      throw new Error('This node is not configured as a coordinator');
    }
    
    // Create coordinator if needed
    let coordinator;
    if (global.inferenceCoordinator) {
      coordinator = global.inferenceCoordinator;
    } else {
      coordinator = await initCoordinator(pb, nodeId, nodeRole);
      global.inferenceCoordinator = coordinator;
    }
    
    // Start the job
    return await coordinator.startJob(jobId, jobConfig);
  } catch (error) {
    console.error('Error starting distributed job:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process input for a distributed job
 * 
 * @param {Object} pb - PocketBase instance
 * @param {string} jobId - Job ID
 * @param {Object} input - Input data
 * @returns {Promise<Object>} - Processing status
 */
export async function processDistributedInput(pb, jobId, input) {
  try {
    if (!global.inferenceCoordinator) {
      throw new Error('No active coordinator found');
    }
    
    return await global.inferenceCoordinator.processInput(jobId, input);
  } catch (error) {
    console.error('Error processing distributed input:', error);
    return { success: false, error: error.message };
  }
}

// Export classes and constants
export { InferenceCoordinator, InferenceWorker, MessageTypes, DistributionStrategies };
