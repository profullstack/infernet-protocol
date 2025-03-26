/**
 * Job model for Infernet Protocol
 * Represents inference and training jobs
 */

const { createLogger } = require('../../utils/logger');
const crypto = require('crypto');

const logger = createLogger('model:job');

class Job {
    constructor(db) {
        this.db = db;
        this.collection = 'jobs';
    }

    /**
     * Create a new job
     * @param {Object} jobData - Job data
     * @returns {Promise<Object>} - Created job record
     */
    async create(jobData) {
        try {
            const pb = this.db.getInstance();
            
            // Generate jobId if not provided
            if (!jobData.jobId) {
                jobData.jobId = `job_${crypto.randomBytes(8).toString('hex')}`;
            }
            
            // Set default values
            const now = new Date().toISOString();
            const job = {
                jobId: jobData.jobId,
                clientId: jobData.clientId,
                providerId: jobData.providerId || null,
                aggregatorId: jobData.aggregatorId || null,
                type: jobData.type || 'inference',
                status: 'pending',
                specs: jobData.specs || {},
                payment: jobData.payment || null,
                created: now,
                updated: now,
                completed: null
            };
            
            // Create the job
            logger.info(`Creating new job: ${job.jobId} for client ${job.clientId}`);
            return await pb.collection(this.collection).create(job);
        } catch (error) {
            logger.error('Failed to create job:', error);
            throw error;
        }
    }

    /**
     * Find a job by jobId
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} - Job record
     */
    async findByJobId(jobId) {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFirstListItem(`jobId="${jobId}"`);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            logger.error(`Failed to find job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Assign job to a provider
     * @param {string} jobId - Job ID
     * @param {string} providerId - Provider node ID
     * @returns {Promise<Object>} - Updated job record
     */
    async assignToProvider(jobId, providerId) {
        try {
            const job = await this.findByJobId(jobId);
            
            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(job.id, {
                providerId,
                status: 'assigned',
                updated: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to assign job ${jobId} to provider ${providerId}:`, error);
            throw error;
        }
    }

    /**
     * Assign job to an aggregator
     * @param {string} jobId - Job ID
     * @param {string} aggregatorId - Aggregator node ID
     * @returns {Promise<Object>} - Updated job record
     */
    async assignToAggregator(jobId, aggregatorId) {
        try {
            const job = await this.findByJobId(jobId);
            
            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(job.id, {
                aggregatorId,
                status: 'assigned',
                updated: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to assign job ${jobId} to aggregator ${aggregatorId}:`, error);
            throw error;
        }
    }

    /**
     * Update job status
     * @param {string} jobId - Job ID
     * @param {string} status - New status
     * @returns {Promise<Object>} - Updated job record
     */
    async updateStatus(jobId, status) {
        try {
            const job = await this.findByJobId(jobId);
            
            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }
            
            const pb = this.db.getInstance();
            
            const updates = {
                status,
                updated: new Date().toISOString()
            };
            
            // If job is completed or failed, set completed timestamp
            if (status === 'completed' || status === 'failed') {
                updates.completed = new Date().toISOString();
            }
            
            return await pb.collection(this.collection).update(job.id, updates);
        } catch (error) {
            logger.error(`Failed to update job ${jobId} status:`, error);
            throw error;
        }
    }

    /**
     * Update job payment information
     * @param {string} jobId - Job ID
     * @param {Object} payment - Payment information
     * @returns {Promise<Object>} - Updated job record
     */
    async updatePayment(jobId, payment) {
        try {
            const job = await this.findByJobId(jobId);
            
            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }
            
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).update(job.id, {
                payment,
                updated: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Failed to update job ${jobId} payment:`, error);
            throw error;
        }
    }

    /**
     * Find pending jobs
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of job records
     */
    async findPending(filters = {}) {
        try {
            const pb = this.db.getInstance();
            
            let filter = 'status="pending"';
            
            // Add additional filters
            if (filters.type) {
                filter += ` && type="${filters.type}"`;
            }
            
            if (filters.clientId) {
                filter += ` && clientId="${filters.clientId}"`;
            }
            
            return await pb.collection(this.collection).getFullList({
                filter,
                sort: '+created'
            });
        } catch (error) {
            logger.error('Failed to find pending jobs:', error);
            throw error;
        }
    }

    /**
     * Find jobs by provider
     * @param {string} providerId - Provider node ID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of job records
     */
    async findByProvider(providerId, filters = {}) {
        try {
            const pb = this.db.getInstance();
            
            let filter = `providerId="${providerId}"`;
            
            // Add additional filters
            if (filters.status) {
                filter += ` && status="${filters.status}"`;
            }
            
            if (filters.type) {
                filter += ` && type="${filters.type}"`;
            }
            
            return await pb.collection(this.collection).getFullList({
                filter,
                sort: '-created'
            });
        } catch (error) {
            logger.error(`Failed to find jobs for provider ${providerId}:`, error);
            throw error;
        }
    }

    /**
     * Find jobs by aggregator
     * @param {string} aggregatorId - Aggregator node ID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of job records
     */
    async findByAggregator(aggregatorId, filters = {}) {
        try {
            const pb = this.db.getInstance();
            
            let filter = `aggregatorId="${aggregatorId}"`;
            
            // Add additional filters
            if (filters.status) {
                filter += ` && status="${filters.status}"`;
            }
            
            if (filters.type) {
                filter += ` && type="${filters.type}"`;
            }
            
            return await pb.collection(this.collection).getFullList({
                filter,
                sort: '-created'
            });
        } catch (error) {
            logger.error(`Failed to find jobs for aggregator ${aggregatorId}:`, error);
            throw error;
        }
    }

    /**
     * Find jobs by client
     * @param {string} clientId - Client node ID
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} - Array of job records
     */
    async findByClient(clientId, filters = {}) {
        try {
            const pb = this.db.getInstance();
            
            let filter = `clientId="${clientId}"`;
            
            // Add additional filters
            if (filters.status) {
                filter += ` && status="${filters.status}"`;
            }
            
            if (filters.type) {
                filter += ` && type="${filters.type}"`;
            }
            
            return await pb.collection(this.collection).getFullList({
                filter,
                sort: '-created'
            });
        } catch (error) {
            logger.error(`Failed to find jobs for client ${clientId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a job
     * @param {string} jobId - Job ID
     * @returns {Promise<boolean>} - Success status
     */
    async delete(jobId) {
        try {
            const job = await this.findByJobId(jobId);
            
            if (!job) {
                return false;
            }
            
            const pb = this.db.getInstance();
            await pb.collection(this.collection).delete(job.id);
            return true;
        } catch (error) {
            logger.error(`Failed to delete job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Get all jobs
     * @returns {Promise<Array>} - Array of job records
     */
    async getAll() {
        try {
            const pb = this.db.getInstance();
            return await pb.collection(this.collection).getFullList();
        } catch (error) {
            logger.error('Failed to get all jobs:', error);
            throw error;
        }
    }

    /**
     * Get job statistics
     * @returns {Promise<Object>} - Job statistics
     */
    async getStats() {
        try {
            const pb = this.db.getInstance();
            const jobs = await pb.collection(this.collection).getFullList();
            
            return {
                total: jobs.length,
                byStatus: {
                    pending: jobs.filter(job => job.status === 'pending').length,
                    assigned: jobs.filter(job => job.status === 'assigned').length,
                    running: jobs.filter(job => job.status === 'running').length,
                    completed: jobs.filter(job => job.status === 'completed').length,
                    failed: jobs.filter(job => job.status === 'failed').length
                },
                byType: {
                    inference: jobs.filter(job => job.type === 'inference').length,
                    training: jobs.filter(job => job.type === 'training').length,
                    other: jobs.filter(job => job.type === 'other').length
                }
            };
        } catch (error) {
            logger.error('Failed to get job statistics:', error);
            throw error;
        }
    }
}

module.exports = Job;
