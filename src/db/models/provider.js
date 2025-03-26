/**
 * Provider model for Infernet Protocol
 * Represents a GPU provider node in the network
 */

import { createLogger } from '../../utils/logger.js';
import crypto from 'crypto';

const logger = createLogger('model:provider');

class Provider {
    constructor(db) {
        this.db = db;
        this.collection = 'providers';
    }

    /**
     * Register a new provider
     * @param {Object} providerData - Provider data
     * @returns {Promise<Object>} - Created provider record
     */
    async register(providerData) {
        try {
            const pb = this.db.getInstance();
            
            // Generate nodeId if not provided
            if (!providerData.nodeId) {
                providerData.nodeId = `provider_${crypto.randomBytes(8).toString('hex')}`;
            }
            
            // Set default values
            const provider = {
                nodeId: providerData.nodeId,
                publicKey: providerData.publicKey,
                address: providerData.address,
                port: providerData.port || 8080,
                status: 'available',
                reputation: 0,
                specs: providerData.specs || {},
                price: providerData.price || 0,
                lastSeen: new Date().toISOString()
            };
            
            // Check if provider already exists
            try {
                const existing = await pb.collection(this.collection)
                    .getFirstListItem(`nodeId="${provider.nodeId}"`);
                
                // Update existing provider
                logger.info(`Updating existing provider: ${provider.nodeId}`);
                return await pb.collection(this.collection).update(existing.id, provider);
            } catch (error) {
                // Provider doesn't exist, create new one
                logger.info(`Registering new provider: ${provider.nodeId}`);
                return await pb.collection(this.collection).create(provider);
            }
        } catch (error) {
            logger.error('Failed to register provider:', error);
            throw error;
        }
    }

    /**
     * Find a provider by nodeId
     * @param {string} nodeId - Provider node ID
     * @returns {Promise<Object>} - Provider record
     */
    async findByNodeId(nodeId) {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFirstListItem(`nodeId="${nodeId}"`);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            logger.error(`Failed to find provider ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Find a provider by public key
     * @param {string} publicKey - Provider public key
     * @returns {Promise<Object>} - Provider record
     */
    async findByPublicKey(publicKey) {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFirstListItem(`publicKey="${publicKey}"`);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            logger.error(`Failed to find provider with public key ${publicKey}:`, error);
            throw error;
        }
    }

    /**
     * Update provider status
     * @param {string} nodeId - Provider node ID
     * @param {string} status - New status
     * @returns {Promise<Object>} - Updated provider record
     */
    async updateStatus(nodeId, status) {
        try {
            const provider = await this.findByNodeId(nodeId);
            
            if (!provider) {
                throw new Error(`Provider ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(provider.id, {
                status,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update provider ${nodeId} status:`, error);
            throw error;
        }
    }

    /**
     * Update provider specs
     * @param {string} nodeId - Provider node ID
     * @param {Object} specs - Provider specs
     * @returns {Promise<Object>} - Updated provider record
     */
    async updateSpecs(nodeId, specs) {
        try {
            const provider = await this.findByNodeId(nodeId);
            
            if (!provider) {
                throw new Error(`Provider ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(provider.id, {
                specs,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update provider ${nodeId} specs:`, error);
            throw error;
        }
    }

    /**
     * Update provider price
     * @param {string} nodeId - Provider node ID
     * @param {number} price - Provider price
     * @returns {Promise<Object>} - Updated provider record
     */
    async updatePrice(nodeId, price) {
        try {
            const provider = await this.findByNodeId(nodeId);
            
            if (!provider) {
                throw new Error(`Provider ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(provider.id, {
                price,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update provider ${nodeId} price:`, error);
            throw error;
        }
    }

    /**
     * Update provider reputation
     * @param {string} nodeId - Provider node ID
     * @param {number} reputation - New reputation score
     * @returns {Promise<Object>} - Updated provider record
     */
    async updateReputation(nodeId, reputation) {
        try {
            const provider = await this.findByNodeId(nodeId);
            
            if (!provider) {
                throw new Error(`Provider ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(provider.id, {
                reputation,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update provider ${nodeId} reputation:`, error);
            throw error;
        }
    }

    /**
     * Find available providers
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of provider records
     */
    async findAvailable(filters = {}) {
        try {
            const pb = this.db.getInstance();
            
            let filter = 'status="available"';
            
            // Add additional filters
            if (filters.minReputation) {
                filter += ` && reputation>=${filters.minReputation}`;
            }
            
            if (filters.maxPrice) {
                filter += ` && price<=${filters.maxPrice}`;
            }
            
            // Add GPU spec filters
            if (filters.minVram) {
                // This is a simplification, as filtering on JSON fields is more complex
                // In a real implementation, you might need to use a more sophisticated approach
                filter += ` && specs.vram>=${filters.minVram}`;
            }
            
            return await pb.collection(this.collection).getFullList({
                filter,
                sort: '-reputation,+price'
            });
        } catch (error) {
            logger.error('Failed to find available providers:', error);
            throw error;
        }
    }

    /**
     * Delete a provider
     * @param {string} nodeId - Provider node ID
     * @returns {Promise<boolean>} - Success status
     */
    async delete(nodeId) {
        try {
            const provider = await this.findByNodeId(nodeId);
            
            if (!provider) {
                return false;
            }
            
            const pb = this.db.getInstance();
            await pb.collection(this.collection).delete(provider.id);
            return true;
        } catch (error) {
            logger.error(`Failed to delete provider ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get all providers
     * @returns {Promise<Array>} - Array of provider records
     */
    async getAll() {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFullList();
        } catch (error) {
            logger.error('Failed to get all providers:', error);
            throw error;
        }
    }

    /**
     * Update provider heartbeat
     * @param {string} nodeId - Provider node ID
     * @returns {Promise<Object>} - Updated provider record
     */
    async heartbeat(nodeId) {
        try {
            const provider = await this.findByNodeId(nodeId);
            
            if (!provider) {
                throw new Error(`Provider ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(provider.id, {
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update provider ${nodeId} heartbeat:`, error);
            throw error;
        }
    }
}

export default Provider;
