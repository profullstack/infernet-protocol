/**
 * Aggregator model for Infernet Protocol
 * Represents a node that coordinates multi-node jobs
 */

const { createLogger } = require('../../utils/logger');
const crypto = require('crypto');

const logger = createLogger('model:aggregator');

class Aggregator {
    constructor(db) {
        this.db = db;
        this.collection = 'aggregators';
    }

    /**
     * Register a new aggregator
     * @param {Object} aggregatorData - Aggregator data
     * @returns {Promise<Object>} - Created aggregator record
     */
    async register(aggregatorData) {
        try {
            const pb = this.db.getInstance();
            
            // Generate nodeId if not provided
            if (!aggregatorData.nodeId) {
                aggregatorData.nodeId = `aggregator_${crypto.randomBytes(8).toString('hex')}`;
            }
            
            // Set default values
            const aggregator = {
                nodeId: aggregatorData.nodeId,
                publicKey: aggregatorData.publicKey,
                address: aggregatorData.address,
                port: aggregatorData.port || 8080,
                status: 'available',
                reputation: 0,
                load: 0,
                maxLoad: aggregatorData.maxLoad || 100,
                lastSeen: new Date().toISOString()
            };
            
            // Check if aggregator already exists
            try {
                const existing = await pb.collection(this.collection)
                    .getFirstListItem(`nodeId="${aggregator.nodeId}"`);
                
                // Update existing aggregator
                logger.info(`Updating existing aggregator: ${aggregator.nodeId}`);
                return await pb.collection(this.collection).update(existing.id, aggregator);
            } catch (error) {
                // Aggregator doesn't exist, create new one
                logger.info(`Registering new aggregator: ${aggregator.nodeId}`);
                return await pb.collection(this.collection).create(aggregator);
            }
        } catch (error) {
            logger.error('Failed to register aggregator:', error);
            throw error;
        }
    }

    /**
     * Find an aggregator by nodeId
     * @param {string} nodeId - Aggregator node ID
     * @returns {Promise<Object>} - Aggregator record
     */
    async findByNodeId(nodeId) {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFirstListItem(`nodeId="${nodeId}"`);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            logger.error(`Failed to find aggregator ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Find an aggregator by public key
     * @param {string} publicKey - Aggregator public key
     * @returns {Promise<Object>} - Aggregator record
     */
    async findByPublicKey(publicKey) {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFirstListItem(`publicKey="${publicKey}"`);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            logger.error(`Failed to find aggregator with public key ${publicKey}:`, error);
            throw error;
        }
    }

    /**
     * Update aggregator status
     * @param {string} nodeId - Aggregator node ID
     * @param {string} status - New status
     * @returns {Promise<Object>} - Updated aggregator record
     */
    async updateStatus(nodeId, status) {
        try {
            const aggregator = await this.findByNodeId(nodeId);
            
            if (!aggregator) {
                throw new Error(`Aggregator ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(aggregator.id, {
                status,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update aggregator ${nodeId} status:`, error);
            throw error;
        }
    }

    /**
     * Update aggregator load
     * @param {string} nodeId - Aggregator node ID
     * @param {number} load - Current load
     * @returns {Promise<Object>} - Updated aggregator record
     */
    async updateLoad(nodeId, load) {
        try {
            const aggregator = await this.findByNodeId(nodeId);
            
            if (!aggregator) {
                throw new Error(`Aggregator ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(aggregator.id, {
                load,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update aggregator ${nodeId} load:`, error);
            throw error;
        }
    }

    /**
     * Update aggregator reputation
     * @param {string} nodeId - Aggregator node ID
     * @param {number} reputation - New reputation score
     * @returns {Promise<Object>} - Updated aggregator record
     */
    async updateReputation(nodeId, reputation) {
        try {
            const aggregator = await this.findByNodeId(nodeId);
            
            if (!aggregator) {
                throw new Error(`Aggregator ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(aggregator.id, {
                reputation,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update aggregator ${nodeId} reputation:`, error);
            throw error;
        }
    }

    /**
     * Find available aggregators
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of aggregator records
     */
    async findAvailable(filters = {}) {
        try {
            const pb = this.db.getInstance();
            
            let filter = 'status="available"';
            
            // Add additional filters
            if (filters.minReputation) {
                filter += ` && reputation>=${filters.minReputation}`;
            }
            
            if (filters.maxLoad) {
                filter += ` && load<=${filters.maxLoad}`;
            }
            
            return await pb.collection(this.collection).getFullList({
                filter,
                sort: '-reputation,+load'
            });
        } catch (error) {
            logger.error('Failed to find available aggregators:', error);
            throw error;
        }
    }

    /**
     * Delete an aggregator
     * @param {string} nodeId - Aggregator node ID
     * @returns {Promise<boolean>} - Success status
     */
    async delete(nodeId) {
        try {
            const aggregator = await this.findByNodeId(nodeId);
            
            if (!aggregator) {
                return false;
            }
            
            const pb = this.db.getInstance();
            await pb.collection(this.collection).delete(aggregator.id);
            return true;
        } catch (error) {
            logger.error(`Failed to delete aggregator ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get all aggregators
     * @returns {Promise<Array>} - Array of aggregator records
     */
    async getAll() {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFullList();
        } catch (error) {
            logger.error('Failed to get all aggregators:', error);
            throw error;
        }
    }

    /**
     * Update aggregator heartbeat
     * @param {string} nodeId - Aggregator node ID
     * @returns {Promise<Object>} - Updated aggregator record
     */
    async heartbeat(nodeId) {
        try {
            const aggregator = await this.findByNodeId(nodeId);
            
            if (!aggregator) {
                throw new Error(`Aggregator ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(aggregator.id, {
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update aggregator ${nodeId} heartbeat:`, error);
            throw error;
        }
    }

    /**
     * Get active jobs for an aggregator
     * @param {string} nodeId - Aggregator node ID
     * @returns {Promise<Array>} - Array of job records
     */
    async getActiveJobs(nodeId) {
        try {
            const aggregator = await this.findByNodeId(nodeId);
            
            if (!aggregator) {
                throw new Error(`Aggregator ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection('jobs').getFullList({
                filter: `aggregatorId="${nodeId}" && (status="assigned" || status="running")`,
                sort: '-created'
            });
        } catch (error) {
            logger.error(`Failed to get active jobs for aggregator ${nodeId}:`, error);
            throw error;
        }
    }
}

module.exports = Aggregator;
