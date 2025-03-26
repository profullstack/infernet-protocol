import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';

// Store to track connection status
export const pbConnectionStatus = writable({
  isConnected: false,
  url: '',
  error: null
});

// Store to track available nodes from both local and remote sources
export const availableNodes = writable([]);

/**
 * PocketBase client for the mobile app
 */
class PocketBaseClient {
  constructor() {
    this.pb = null;
    this.localUrl = 'http://127.0.0.1:8090'; // Default local PocketBase URL
    this.remoteUrl = 'https://infernet.tech'; // Remote API for node discovery
    this.isConnected = false;
  }

  /**
   * Initialize the PocketBase connection
   * @param {string} url - Optional custom URL for PocketBase
   * @returns {Promise<boolean>} - Connection success
   */
  async init(url = this.localUrl) {
    try {
      this.pb = new PocketBase(url);
      
      // Test the connection
      const healthCheck = await this.pb.health.check();
      
      if (healthCheck) {
        this.isConnected = true;
        this.url = url;
        
        // Update the connection status store
        pbConnectionStatus.set({
          isConnected: true,
          url,
          error: null
        });
        
        console.log(`Connected to PocketBase at ${url}`);
        return true;
      }
    } catch (error) {
      console.error('PocketBase connection failed:', error);
      
      // Update the connection status store with error
      pbConnectionStatus.set({
        isConnected: false,
        url,
        error: error.message
      });
      
      return false;
    }
  }

  /**
   * Get the PocketBase instance
   * @returns {PocketBase|null} - PocketBase instance or null if not connected
   */
  getInstance() {
    return this.pb;
  }

  /**
   * Fetch nodes from both local PocketBase and remote P2P network
   * @returns {Promise<Array>} - Combined list of nodes
   */
  async fetchNodes() {
    const nodes = [];
    
    try {
      // Try to fetch from local PocketBase first
      if (this.isConnected && this.pb) {
        const localNodes = await this.pb.collection('providers').getList(1, 100, {
          sort: '-created'
        });
        
        nodes.push(...localNodes.items.map(node => ({
          ...node,
          source: 'local'
        })));
      }
    } catch (error) {
      console.error('Error fetching local nodes:', error);
    }
    
    try {
      // Try to fetch from remote P2P network
      const response = await fetch(`${this.remoteUrl}/nodes`);
      
      if (response.ok) {
        const remoteNodes = await response.json();
        
        nodes.push(...remoteNodes.map(node => ({
          ...node,
          source: 'remote'
        })));
      }
    } catch (error) {
      console.error('Error fetching remote nodes:', error);
    }
    
    // Update the nodes store
    availableNodes.set(nodes);
    
    return nodes;
  }

  /**
   * Submit a job to the network
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} - Created job record
   */
  async submitJob(jobData) {
    if (!this.isConnected || !this.pb) {
      throw new Error('PocketBase not connected');
    }
    
    try {
      const job = await this.pb.collection('jobs').create(jobData);
      return job;
    } catch (error) {
      console.error('Error submitting job:', error);
      throw error;
    }
  }

  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} - Job record
   */
  async getJobStatus(jobId) {
    if (!this.isConnected || !this.pb) {
      throw new Error('PocketBase not connected');
    }
    
    try {
      const job = await this.pb.collection('jobs').getOne(jobId);
      return job;
    } catch (error) {
      console.error('Error getting job status:', error);
      throw error;
    }
  }

  /**
   * Get user jobs
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - List of jobs
   */
  async getUserJobs(userId) {
    if (!this.isConnected || !this.pb) {
      throw new Error('PocketBase not connected');
    }
    
    try {
      const jobs = await this.pb.collection('jobs').getList(1, 100, {
        filter: `user = "${userId}"`,
        sort: '-created'
      });
      
      return jobs.items;
    } catch (error) {
      console.error('Error fetching user jobs:', error);
      throw error;
    }
  }

  /**
   * Disconnect from PocketBase
   */
  disconnect() {
    this.pb = null;
    this.isConnected = false;
    
    // Update the connection status store
    pbConnectionStatus.set({
      isConnected: false,
      url: '',
      error: null
    });
    
    console.log('Disconnected from PocketBase');
  }
}

// Create a singleton instance
const pocketbase = new PocketBaseClient();

export default pocketbase;
