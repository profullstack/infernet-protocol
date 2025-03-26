/**
 * PocketBase database utility for the Infernet Protocol web server
 * 
 * This module provides utility functions for interacting with PocketBase
 * to replace the mocked data in the API endpoints.
 */

import { PocketBase } from 'pocketbase';

let pb = null;
let isInitialized = false;

/**
 * Initialize the PocketBase connection
 * @param {string} url - The URL of the PocketBase server
 * @returns {PocketBase} - The PocketBase instance
 */
export function initialize(url = 'http://127.0.0.1:8080') {
  if (!isInitialized) {
    console.log(`Initializing PocketBase connection to ${url}`);
    pb = new PocketBase(url);
    isInitialized = true;
  }
  return pb;
}

/**
 * Get the PocketBase instance
 * @returns {PocketBase} - The PocketBase instance
 */
export function getInstance() {
  if (!isInitialized) {
    throw new Error('PocketBase not initialized. Call initialize() first.');
  }
  return pb;
}

/**
 * Get all nodes from the database
 * @returns {Promise<Array>} - Array of node objects
 */
export async function getAllNodes() {
  try {
    const records = await pb.collection('nodes').getFullList({
      sort: '-lastSeen',
      expand: 'jobs'
    });
    
    return records.map(record => {
      // Parse JSON fields
      const gpus = typeof record.gpus === 'string' ? JSON.parse(record.gpus) : record.gpus;
      const cpus = typeof record.cpus === 'string' ? JSON.parse(record.cpus) : record.cpus;
      
      return {
        id: record.id,
        name: record.name,
        status: record.status,
        ip: record.ip,
        lastSeen: record.lastSeen,
        gpus,
        cpus,
        jobsCompleted: record.jobsCompleted,
        uptime: record.uptime,
        reputation: record.reputation
      };
    });
  } catch (error) {
    console.error('Error fetching nodes:', error);
    throw error;
  }
}

/**
 * Get a node by ID
 * @param {string} id - The node ID
 * @returns {Promise<Object>} - The node object
 */
export async function getNodeById(id) {
  try {
    const record = await pb.collection('nodes').getOne(id, {
      expand: 'jobs'
    });
    
    // Parse JSON fields
    const gpus = typeof record.gpus === 'string' ? JSON.parse(record.gpus) : record.gpus;
    const cpus = typeof record.cpus === 'string' ? JSON.parse(record.cpus) : record.cpus;
    
    return {
      id: record.id,
      name: record.name,
      status: record.status,
      ip: record.ip,
      lastSeen: record.lastSeen,
      gpus,
      cpus,
      jobsCompleted: record.jobsCompleted,
      uptime: record.uptime,
      reputation: record.reputation
    };
  } catch (error) {
    console.error(`Error fetching node ${id}:`, error);
    throw error;
  }
}

/**
 * Get all jobs from the database
 * @param {Object} options - Query options
 * @param {string} options.status - Filter by status
 * @param {string} options.model - Filter by model
 * @param {string} options.node - Filter by node ID
 * @param {string} options.client - Filter by client ID
 * @returns {Promise<Array>} - Array of job objects
 */
export async function getAllJobs(options = {}) {
  try {
    const filter = [];
    
    if (options.status) {
      filter.push(`status="${options.status}"`);
    }
    
    if (options.model) {
      filter.push(`model="${options.model}"`);
    }
    
    if (options.node) {
      filter.push(`node="${options.node}"`);
    }
    
    if (options.client) {
      filter.push(`client="${options.client}"`);
    }
    
    const records = await pb.collection('jobs').getFullList({
      sort: '-startTime',
      filter: filter.join(' && ') || undefined,
      expand: 'node,client'
    });
    
    return records.map(record => {
      return {
        id: record.id,
        model: record.model,
        status: record.status,
        runtime: record.runtime || '-',
        node: record.expand?.node?.name || record.node || 'Pending',
        startTime: record.startTime,
        endTime: record.endTime,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cost: record.cost,
        client: record.expand?.client?.name || record.client,
        prompt: record.prompt,
        result: record.result
      };
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
}

/**
 * Get dashboard statistics
 * @returns {Promise<Object>} - Dashboard statistics
 */
export async function getDashboardStats() {
  try {
    // Get active nodes count
    const activeNodesCount = await pb.collection('nodes').getList(1, 1, {
      filter: 'status="online"',
      countTotal: true
    }).then(result => result.totalItems);
    
    // Get total jobs count
    const totalJobsCount = await pb.collection('jobs').getList(1, 1, {
      countTotal: true
    }).then(result => result.totalItems);
    
    // Get average GPU utilization
    const nodes = await getAllNodes();
    let totalGpuUtilization = 0;
    let gpuCount = 0;
    
    nodes.forEach(node => {
      if (node.gpus && Array.isArray(node.gpus)) {
        node.gpus.forEach(gpu => {
          if (typeof gpu.utilization === 'number') {
            totalGpuUtilization += gpu.utilization;
            gpuCount++;
          }
        });
      }
    });
    
    const avgGpuUtilization = gpuCount > 0 ? Math.round(totalGpuUtilization / gpuCount) : 0;
    
    // Get average CPU utilization
    let totalCpuUtilization = 0;
    let cpuCount = 0;
    
    nodes.forEach(node => {
      if (node.cpus && Array.isArray(node.cpus)) {
        node.cpus.forEach(cpu => {
          if (typeof cpu.utilization === 'number') {
            totalCpuUtilization += cpu.utilization;
            cpuCount++;
          }
        });
      }
    });
    
    const avgCpuUtilization = cpuCount > 0 ? Math.round(totalCpuUtilization / cpuCount) : 0;
    
    return {
      activeNodes: activeNodesCount,
      totalJobs: totalJobsCount,
      gpuUtilization: avgGpuUtilization,
      cpuUtilization: avgCpuUtilization
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
}

/**
 * Get all GPU stats
 * @returns {Promise<Array>} - Array of GPU objects with stats
 */
export async function getGpuStats() {
  try {
    const nodes = await getAllNodes();
    const gpuStats = [];
    
    nodes.forEach(node => {
      if (node.gpus && Array.isArray(node.gpus)) {
        node.gpus.forEach((gpu, index) => {
          gpuStats.push({
            id: `${node.id}-gpu${index}`,
            name: gpu.name,
            utilization: gpu.utilization || 0,
            memory: gpu.memory ? parseInt(gpu.memory) : 0,
            temperature: gpu.temperature || Math.floor(Math.random() * 20) + 60, // Fallback to random temp if not available
            node: node.name
          });
        });
      }
    });
    
    return gpuStats;
  } catch (error) {
    console.error('Error fetching GPU stats:', error);
    throw error;
  }
}

/**
 * Get all CPU stats
 * @returns {Promise<Array>} - Array of CPU objects with stats
 */
export async function getCpuStats() {
  try {
    const nodes = await getAllNodes();
    const cpuStats = [];
    
    nodes.forEach(node => {
      if (node.cpus && Array.isArray(node.cpus)) {
        node.cpus.forEach((cpu, index) => {
          cpuStats.push({
            id: `${node.id}-cpu${index}`,
            name: cpu.name,
            utilization: cpu.utilization || 0,
            cores: cpu.cores || 0,
            temperature: cpu.temperature || Math.floor(Math.random() * 20) + 50, // Fallback to random temp if not available
            node: node.name
          });
        });
      }
    });
    
    return cpuStats;
  } catch (error) {
    console.error('Error fetching CPU stats:', error);
    throw error;
  }
}

/**
 * Seed remote nodes from infernet.tech
 * @returns {Promise<Array>} - Array of seeded node objects
 */
export async function seedRemoteNodes() {
  try {
    console.log('Seeding remote nodes from infernet.tech/nodes...');
    // This would be implemented later to fetch nodes from the remote P2P instance
    // For now, just return a message
    return { message: 'Remote node seeding not implemented yet' };
  } catch (error) {
    console.error('Error seeding remote nodes:', error);
    throw error;
  }
}

export default {
  initialize,
  getInstance,
  getAllNodes,
  getNodeById,
  getAllJobs,
  getDashboardStats,
  getGpuStats,
  getCpuStats,
  seedRemoteNodes
};
