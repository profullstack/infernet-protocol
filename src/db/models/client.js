/**
 * Client model for Infernet Protocol
 * Represents a client node that submits jobs
 */

import { createLogger } from '../../utils/logger.js';
import crypto from 'crypto';

const logger = createLogger('model:client');

class Client {
    constructor(db) {
        this.db = db;
        this.collection = 'clients';
    }

    /**
     * Register a new client
     * @param {Object} clientData - Client data
     * @returns {Promise<Object>} - Created client record
     */
    async register(clientData) {
        try {
            const pb = this.db.getInstance();
            
            // Generate nodeId if not provided
            if (!clientData.nodeId) {
                clientData.nodeId = `client_${crypto.randomBytes(8).toString('hex')}`;
            }
            
            // Set default values
            const client = {
                nodeId: clientData.nodeId,
                publicKey: clientData.publicKey,
                address: clientData.address || null,
                lastSeen: new Date().toISOString()
            };
            
            // Check if client already exists
            try {
                const existing = await pb.collection(this.collection)
                    .getFirstListItem(`nodeId="${client.nodeId}"`);
                
                // Update existing client
                logger.info(`Updating existing client: ${client.nodeId}`);
                return await pb.collection(this.collection).update(existing.id, client);
            } catch (error) {
                // Client doesn't exist, create new one
                logger.info(`Registering new client: ${client.nodeId}`);
                return await pb.collection(this.collection).create(client);
            }
        } catch (error) {
            logger.error('Failed to register client:', error);
            throw error;
        }
    }

    /**
     * Find a client by nodeId
     * @param {string} nodeId - Client node ID
     * @returns {Promise<Object>} - Client record
     */
    async findByNodeId(nodeId) {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFirstListItem(`nodeId="${nodeId}"`);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            logger.error(`Failed to find client ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Find a client by public key
     * @param {string} publicKey - Client public key
     * @returns {Promise<Object>} - Client record
     */
    async findByPublicKey(publicKey) {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFirstListItem(`publicKey="${publicKey}"`);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            logger.error(`Failed to find client with public key ${publicKey}:`, error);
            throw error;
        }
    }

    /**
     * Update client address
     * @param {string} nodeId - Client node ID
     * @param {string} address - New address
     * @returns {Promise<Object>} - Updated client record
     */
    async updateAddress(nodeId, address) {
        try {
            const client = await this.findByNodeId(nodeId);
            
            if (!client) {
                throw new Error(`Client ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(client.id, {
                address,
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update client ${nodeId} address:`, error);
            throw error;
        }
    }

    /**
     * Get client job history
     * @param {string} nodeId - Client node ID
     * @returns {Promise<Array>} - Array of job records
     */
    async getJobHistory(nodeId) {
        try {
            const client = await this.findByNodeId(nodeId);
            
            if (!client) {
                throw new Error(`Client ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection('jobs').getFullList({
                filter: `clientId="${nodeId}"`,
                sort: '-created'
            });
        } catch (error) {
            logger.error(`Failed to get job history for client ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a client
     * @param {string} nodeId - Client node ID
     * @returns {Promise<boolean>} - Success status
     */
    async delete(nodeId) {
        try {
            const client = await this.findByNodeId(nodeId);
            
            if (!client) {
                return false;
            }
            
            const pb = this.db.getInstance();
            await pb.collection(this.collection).delete(client.id);
            return true;
        } catch (error) {
            logger.error(`Failed to delete client ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get all clients
     * @returns {Promise<Array>} - Array of client records
     */
    async getAll() {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFullList();
        } catch (error) {
            logger.error('Failed to get all clients:', error);
            throw error;
        }
    }

    /**
     * Update client heartbeat
     * @param {string} nodeId - Client node ID
     * @returns {Promise<Object>} - Updated client record
     */
    async heartbeat(nodeId) {
        try {
            const client = await this.findByNodeId(nodeId);
            
            if (!client) {
                throw new Error(`Client ${nodeId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(client.id, {
                lastSeen: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update client ${nodeId} heartbeat:`, error);
            throw error;
        }
    }
}

module.exports = Client;
