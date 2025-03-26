import { writable, derived } from 'svelte/store';
import pocketbase, { pbConnectionStatus, availableNodes } from '../lib/pocketbase.js';

// Store for node status metrics
export const nodeStatus = writable({
  cpuUsage: 0,
  memoryUsage: 0,
  gpuUsage: 0,
  activeJobs: 0,
  completedJobs: 0,
  earnings: 0
});

// Store for node configuration
export const nodeConfig = writable({
  nodeType: 'provider', // provider, client, or aggregator
  isActive: false,
  maxJobs: 5,
  supportedModels: [],
  paymentAddress: '',
  minJobPrice: 0.001
});

// Store for connection status - now linked with PocketBase connection
export const connectionStatus = derived(
  [pbConnectionStatus],
  ([$pbStatus]) => ({
    connected: $pbStatus.isConnected,
    lastSeen: $pbStatus.isConnected ? new Date() : null,
    peers: 0, // Will be updated from network
    networkLatency: 0, // Will be updated from network
    pocketbaseUrl: $pbStatus.url,
    error: $pbStatus.error
  })
);

// Create derived stores for filtering nodes
export const localNodes = derived(availableNodes, $nodes => 
  $nodes.filter(node => node.source === 'local')
);

export const remoteNodes = derived(availableNodes, $nodes => 
  $nodes.filter(node => node.source === 'remote')
);

export const activeNodes = derived(availableNodes, $nodes => 
  $nodes.filter(node => node.status === 'active' || node.status === 'available')
);

// Actions to update the stores - now integrated with PocketBase
export const nodeActions = {
  startNode: async () => {
    try {
      // First update local stores
      nodeConfig.update(config => ({ ...config, isActive: true }));
      
      // Then update in PocketBase if connected
      if (pocketbase.isConnected) {
        const pb = pocketbase.getInstance();
        const nodeData = {};
        
        // Get current config
        let currentConfig = null;
        nodeConfig.subscribe(c => { currentConfig = c; })();
        
        // Prepare node data
        nodeData.status = 'active';
        nodeData.type = currentConfig.nodeType;
        nodeData.max_jobs = currentConfig.maxJobs;
        nodeData.supported_models = currentConfig.supportedModels;
        nodeData.payment_address = currentConfig.paymentAddress;
        nodeData.min_job_price = currentConfig.minJobPrice;
        
        // Check if we already have a node record
        const nodeId = localStorage.getItem('infernet-node-id');
        
        if (nodeId) {
          // Update existing node
          await pb.collection('providers').update(nodeId, nodeData);
        } else {
          // Create new node
          const newNode = await pb.collection('providers').create(nodeData);
          localStorage.setItem('infernet-node-id', newNode.id);
        }
        
        // Refresh nodes list
        await pocketbase.fetchNodes();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to start node:', error);
      return false;
    }
  },
  
  stopNode: async () => {
    try {
      // First update local stores
      nodeConfig.update(config => ({ ...config, isActive: false }));
      
      // Then update in PocketBase if connected
      if (pocketbase.isConnected) {
        const nodeId = localStorage.getItem('infernet-node-id');
        
        if (nodeId) {
          const pb = pocketbase.getInstance();
          await pb.collection('providers').update(nodeId, { status: 'inactive' });
          
          // Refresh nodes list
          await pocketbase.fetchNodes();
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to stop node:', error);
      return false;
    }
  },
  
  updateConfig: async (newConfig) => {
    try {
      // First update local stores
      nodeConfig.update(config => ({ ...config, ...newConfig }));
      
      // Then update in PocketBase if connected
      if (pocketbase.isConnected) {
        const nodeId = localStorage.getItem('infernet-node-id');
        
        if (nodeId) {
          const pb = pocketbase.getInstance();
          
          // Convert to PocketBase field names
          const pbData = {};
          if (newConfig.nodeType) pbData.type = newConfig.nodeType;
          if (newConfig.maxJobs !== undefined) pbData.max_jobs = newConfig.maxJobs;
          if (newConfig.supportedModels) pbData.supported_models = newConfig.supportedModels;
          if (newConfig.paymentAddress) pbData.payment_address = newConfig.paymentAddress;
          if (newConfig.minJobPrice !== undefined) pbData.min_job_price = newConfig.minJobPrice;
          
          await pb.collection('providers').update(nodeId, pbData);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to update node config:', error);
      return false;
    }
  },
  
  addSupportedModel: async (model) => {
    try {
      // First update local stores
      let updatedModels = [];
      nodeConfig.update(config => {
        if (!config.supportedModels.includes(model)) {
          updatedModels = [...config.supportedModels, model];
          return { ...config, supportedModels: updatedModels };
        }
        updatedModels = [...config.supportedModels];
        return config;
      });
      
      // Then update in PocketBase if connected
      if (pocketbase.isConnected) {
        const nodeId = localStorage.getItem('infernet-node-id');
        
        if (nodeId) {
          const pb = pocketbase.getInstance();
          await pb.collection('providers').update(nodeId, { supported_models: updatedModels });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to add supported model:', error);
      return false;
    }
  },
  
  removeSupportedModel: async (model) => {
    try {
      // First update local stores
      let updatedModels = [];
      nodeConfig.update(config => {
        updatedModels = config.supportedModels.filter(m => m !== model);
        return { ...config, supportedModels: updatedModels };
      });
      
      // Then update in PocketBase if connected
      if (pocketbase.isConnected) {
        const nodeId = localStorage.getItem('infernet-node-id');
        
        if (nodeId) {
          const pb = pocketbase.getInstance();
          await pb.collection('providers').update(nodeId, { supported_models: updatedModels });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to remove supported model:', error);
      return false;
    }
  },
  
  // New method to connect to PocketBase
  connectToPocketBase: async (url = 'http://127.0.0.1:8090') => {
    try {
      const success = await pocketbase.init(url);
      
      if (success) {
        // Fetch nodes from both local and remote sources
        await pocketbase.fetchNodes();
        
        // Try to load this node's configuration from PocketBase
        const nodeId = localStorage.getItem('infernet-node-id');
        
        if (nodeId) {
          const pb = pocketbase.getInstance();
          try {
            const nodeData = await pb.collection('providers').getOne(nodeId);
            
            // Update local config from PocketBase
            nodeConfig.update(config => ({
              ...config,
              nodeType: nodeData.type || 'provider',
              isActive: nodeData.status === 'active',
              maxJobs: nodeData.max_jobs || 5,
              supportedModels: nodeData.supported_models || [],
              paymentAddress: nodeData.payment_address || '',
              minJobPrice: nodeData.min_job_price || 0.001
            }));
          } catch (err) {
            // Node might not exist anymore, clear the ID
            if (err.status === 404) {
              localStorage.removeItem('infernet-node-id');
            }
          }
        }
      }
      
      return success;
    } catch (error) {
      console.error('Failed to connect to PocketBase:', error);
      return false;
    }
  },
  
  // New method to disconnect from PocketBase
  disconnectFromPocketBase: () => {
    pocketbase.disconnect();
    return true;
  },
  
  // New method to refresh nodes list
  refreshNodes: async () => {
    try {
      await pocketbase.fetchNodes();
      return true;
    } catch (error) {
      console.error('Failed to refresh nodes:', error);
      return false;
    }
  }
};
