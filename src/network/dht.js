/**
 * Distributed Hash Table (DHT) implementation for Infernet Protocol
 * Based on Kademlia DHT for peer discovery
 */

const crypto = require('crypto');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('dht');

/**
 * Simple Kademlia-inspired DHT implementation
 * For a production implementation, a full Kademlia library would be used
 */
class DistributedHashTable {
    constructor() {
        this.nodeId = this._generateNodeId();
        this.nodes = new Map(); // Map of nodeId -> nodeInfo
        this.buckets = new Array(160).fill().map(() => []); // 160 k-buckets (for 160-bit IDs)
        this.lastSeen = new Map(); // Track when nodes were last seen
        this.nodeType = config.node.type;
        this.discoveryInterval = null;
    }

    /**
     * Generate a node ID (160-bit identifier)
     * @returns {string} - Hex string of the node ID
     * @private
     */
    _generateNodeId() {
        // Use existing node ID if available
        if (config.node.id) {
            return config.node.id;
        }
        
        // Generate a random node ID
        return crypto.randomBytes(20).toString('hex');
    }

    /**
     * Calculate the distance between two node IDs (XOR metric)
     * @param {string} id1 - First node ID
     * @param {string} id2 - Second node ID
     * @returns {BigInt} - Distance as a BigInt
     * @private
     */
    _distance(id1, id2) {
        const buffer1 = Buffer.from(id1, 'hex');
        const buffer2 = Buffer.from(id2, 'hex');
        
        let result = Buffer.alloc(buffer1.length);
        for (let i = 0; i < buffer1.length; i++) {
            result[i] = buffer1[i] ^ buffer2[i];
        }
        
        return BigInt('0x' + result.toString('hex'));
    }

    /**
     * Get the appropriate k-bucket index for a node
     * @param {string} nodeId - Node ID
     * @returns {number} - Bucket index
     * @private
     */
    _getBucketIndex(nodeId) {
        const distance = this._distance(this.nodeId, nodeId);
        if (distance === 0n) return 0;
        
        // Find the index of the first bit set to 1
        return 159 - Math.floor(Math.log2(Number(distance)));
    }

    /**
     * Add a node to the DHT
     * @param {Object} nodeInfo - Node information
     * @returns {boolean} - Success status
     */
    addNode(nodeInfo) {
        if (!nodeInfo.id || !nodeInfo.address) {
            logger.warn('Attempted to add node with missing ID or address');
            return false;
        }
        
        // Don't add ourselves
        if (nodeInfo.id === this.nodeId) {
            return false;
        }
        
        // Update the node in our map
        this.nodes.set(nodeInfo.id, {
            ...nodeInfo,
            lastSeen: Date.now()
        });
        
        // Update the appropriate k-bucket
        const bucketIndex = this._getBucketIndex(nodeInfo.id);
        const bucket = this.buckets[bucketIndex];
        
        // Remove the node if it's already in the bucket
        const existingIndex = bucket.findIndex(node => node.id === nodeInfo.id);
        if (existingIndex !== -1) {
            bucket.splice(existingIndex, 1);
        }
        
        // Add the node to the bucket (at the end, as most recently seen)
        bucket.push(nodeInfo);
        
        // Limit bucket size to k (20 is typical in Kademlia)
        const k = 20;
        if (bucket.length > k) {
            bucket.shift(); // Remove the oldest node
        }
        
        this.lastSeen.set(nodeInfo.id, Date.now());
        
        logger.debug(`Added node to DHT: ${nodeInfo.id} (${nodeInfo.address})`);
        return true;
    }

    /**
     * Remove a node from the DHT
     * @param {string} nodeId - Node ID to remove
     * @returns {boolean} - Success status
     */
    removeNode(nodeId) {
        if (!this.nodes.has(nodeId)) {
            return false;
        }
        
        // Remove from nodes map
        this.nodes.delete(nodeId);
        
        // Remove from the appropriate k-bucket
        const bucketIndex = this._getBucketIndex(nodeId);
        const bucket = this.buckets[bucketIndex];
        
        const nodeIndex = bucket.findIndex(node => node.id === nodeId);
        if (nodeIndex !== -1) {
            bucket.splice(nodeIndex, 1);
        }
        
        this.lastSeen.delete(nodeId);
        
        logger.debug(`Removed node from DHT: ${nodeId}`);
        return true;
    }

    /**
     * Find the closest nodes to a given ID
     * @param {string} targetId - Target node ID
     * @param {number} count - Number of nodes to return
     * @param {Object} filters - Optional filters for node selection
     * @returns {Array} - Array of closest nodes
     */
    findClosestNodes(targetId, count = 20, filters = {}) {
        // Get all nodes and calculate distances
        const nodesWithDistance = Array.from(this.nodes.values())
            .map(node => ({
                ...node,
                distance: this._distance(targetId, node.id)
            }));
        
        // Apply filters if specified
        let filteredNodes = nodesWithDistance;
        
        if (filters.nodeType) {
            filteredNodes = filteredNodes.filter(node => node.type === filters.nodeType);
        }
        
        if (filters.status) {
            filteredNodes = filteredNodes.filter(node => node.status === filters.status);
        }
        
        if (filters.minReputation) {
            filteredNodes = filteredNodes.filter(node => 
                (node.reputation || 0) >= filters.minReputation
            );
        }
        
        // Sort by distance (ascending)
        filteredNodes.sort((a, b) => {
            if (a.distance < b.distance) return -1;
            if (a.distance > b.distance) return 1;
            return 0;
        });
        
        // Return the closest nodes (up to count)
        return filteredNodes.slice(0, count);
    }

    /**
     * Find providers based on GPU specifications
     * @param {Object} gpuSpecs - GPU specifications to filter by
     * @param {number} count - Number of providers to return
     * @returns {Array} - Array of matching providers
     */
    findProviders(gpuSpecs = {}, count = 10) {
        // Get all provider nodes
        const providers = Array.from(this.nodes.values())
            .filter(node => node.type === 'provider' && node.status === 'available');
        
        // Apply GPU specification filters
        let filteredProviders = providers;
        
        if (gpuSpecs.minVram) {
            filteredProviders = filteredProviders.filter(provider => 
                (provider.specs?.vram || 0) >= gpuSpecs.minVram
            );
        }
        
        if (gpuSpecs.minCores) {
            filteredProviders = filteredProviders.filter(provider => 
                (provider.specs?.cudaCores || 0) >= gpuSpecs.minCores
            );
        }
        
        if (gpuSpecs.gpuModel) {
            filteredProviders = filteredProviders.filter(provider => 
                provider.specs?.gpuModel?.includes(gpuSpecs.gpuModel)
            );
        }
        
        // Sort by reputation (descending) and then by price (ascending)
        filteredProviders.sort((a, b) => {
            const reputationA = a.reputation || 0;
            const reputationB = b.reputation || 0;
            
            if (reputationB !== reputationA) {
                return reputationB - reputationA; // Higher reputation first
            }
            
            const priceA = a.price || 0;
            const priceB = b.price || 0;
            return priceA - priceB; // Lower price first
        });
        
        return filteredProviders.slice(0, count);
    }

    /**
     * Find aggregators based on load and reputation
     * @param {number} count - Number of aggregators to return
     * @returns {Array} - Array of matching aggregators
     */
    findAggregators(count = 5) {
        // Get all aggregator nodes
        const aggregators = Array.from(this.nodes.values())
            .filter(node => node.type === 'aggregator' && node.status === 'available');
        
        // Filter by load capacity
        const availableAggregators = aggregators.filter(aggregator => 
            (aggregator.load || 0) < (aggregator.maxLoad || 100)
        );
        
        // Sort by load (ascending) and then by reputation (descending)
        availableAggregators.sort((a, b) => {
            const loadPercentA = (a.load || 0) / (a.maxLoad || 100);
            const loadPercentB = (b.load || 0) / (b.maxLoad || 100);
            
            if (loadPercentA !== loadPercentB) {
                return loadPercentA - loadPercentB; // Lower load percentage first
            }
            
            const reputationA = a.reputation || 0;
            const reputationB = b.reputation || 0;
            return reputationB - reputationA; // Higher reputation first
        });
        
        return availableAggregators.slice(0, count);
    }

    /**
     * Update node information in the DHT
     * @param {string} nodeId - Node ID to update
     * @param {Object} updates - Properties to update
     * @returns {boolean} - Success status
     */
    updateNode(nodeId, updates) {
        if (!this.nodes.has(nodeId)) {
            return false;
        }
        
        const node = this.nodes.get(nodeId);
        
        this.nodes.set(nodeId, {
            ...node,
            ...updates,
            lastSeen: Date.now()
        });
        
        this.lastSeen.set(nodeId, Date.now());
        
        logger.debug(`Updated node in DHT: ${nodeId}`);
        return true;
    }

    /**
     * Register this node in the DHT
     * @param {Object} nodeInfo - Node information
     */
    registerSelf(nodeInfo) {
        const selfInfo = {
            id: this.nodeId,
            type: this.nodeType,
            address: nodeInfo.address,
            port: nodeInfo.port,
            status: 'available',
            ...nodeInfo
        };
        
        logger.info(`Registering self in DHT: ${this.nodeId} (${selfInfo.address}:${selfInfo.port})`);
        
        // We don't add ourselves to our own routing table,
        // but we prepare the info for sharing with other nodes
        return selfInfo;
    }

    /**
     * Start periodic discovery and maintenance
     * @param {Function} discoveryCallback - Callback for discovery events
     */
    startDiscovery(discoveryCallback) {
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
        }
        
        this.discoveryInterval = setInterval(() => {
            // Perform node discovery
            this._performDiscovery(discoveryCallback);
            
            // Perform maintenance (remove stale nodes)
            this._performMaintenance();
        }, config.node.discoveryInterval);
        
        logger.info(`Started DHT discovery (interval: ${config.node.discoveryInterval}ms)`);
    }

    /**
     * Perform node discovery
     * @param {Function} discoveryCallback - Callback for discovery events
     * @private
     */
    _performDiscovery(discoveryCallback) {
        // In a real implementation, this would involve FIND_NODE RPCs
        // to discover new nodes and update the routing table
        
        if (typeof discoveryCallback === 'function') {
            discoveryCallback(this.nodeId, Array.from(this.nodes.values()));
        }
    }

    /**
     * Perform DHT maintenance
     * @private
     */
    _performMaintenance() {
        const now = Date.now();
        const staleThreshold = 15 * 60 * 1000; // 15 minutes
        
        // Find stale nodes
        const staleNodes = [];
        
        for (const [nodeId, lastSeen] of this.lastSeen.entries()) {
            if (now - lastSeen > staleThreshold) {
                staleNodes.push(nodeId);
            }
        }
        
        // Remove stale nodes
        for (const nodeId of staleNodes) {
            this.removeNode(nodeId);
            logger.info(`Removed stale node: ${nodeId}`);
        }
    }

    /**
     * Stop discovery and maintenance
     */
    stopDiscovery() {
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
            logger.info('Stopped DHT discovery');
        }
    }

    /**
     * Get all nodes in the DHT
     * @returns {Array} - Array of all nodes
     */
    getAllNodes() {
        return Array.from(this.nodes.values());
    }

    /**
     * Get node count by type
     * @returns {Object} - Counts by node type
     */
    getNodeCounts() {
        const counts = {
            total: this.nodes.size,
            provider: 0,
            client: 0,
            aggregator: 0
        };
        
        for (const node of this.nodes.values()) {
            if (node.type && counts[node.type] !== undefined) {
                counts[node.type]++;
            }
        }
        
        return counts;
    }
}

// Create a singleton instance
const dht = new DistributedHashTable();

module.exports = dht;
